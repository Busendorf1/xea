import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { recordAdminAudit } from "./adminAudit";

export async function handleSuspendUser(adminEmail: string, userId: string, payload: any) {
  const { suspendedUntil, reason } = payload || {};
  const { error } = await supabaseAdmin
    .from("users")
    .update({ suspended_until: suspendedUntil })
    .eq("id", userId);

  if (error) throw error;

  await recordAdminAudit(
    adminEmail,
    "suspend_user",
    userId,
    "user",
    reason || "Admin suspension",
    null,
    { suspended_until: suspendedUntil }
  );

  return NextResponse.json({ success: true });
}

export async function handleAdjustUserBalance(adminEmail: string, userId: string, payload: any) {
  const { newBalance, reason } = payload || {};
  const parsedNewBalance = Number(newBalance);
  if (!Number.isFinite(parsedNewBalance) || parsedNewBalance < 0) {
    return NextResponse.json({ error: "Invalid balance amount" }, { status: 400 });
  }

  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("balance, email")
    .eq("id", userId)
    .maybeSingle();

  if (!previousUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const prevBalance = Number(previousUser.balance || 0);
  const deltaAmount = Math.abs(parsedNewBalance - prevBalance);

  const {
    checkAdminVelocityLimit,
    requiresDualApproval,
    createPendingAdminRequest,
  } = await import("@/lib/security/adminGuard");

  const velocityCheck = await checkAdminVelocityLimit(adminEmail, deltaAmount);
  if (!velocityCheck.allowed) {
    return NextResponse.json({ error: velocityCheck.reason }, { status: 403 });
  }

  if (requiresDualApproval(deltaAmount)) {
    const pendingReq = await createPendingAdminRequest({
      actionType: "balance_adjustment",
      requestedBy: adminEmail,
      targetIdentifier: previousUser.email || userId,
      amountNaira: deltaAmount,
      payload: {
        userId,
        userEmail: previousUser.email,
        previousBalance: prevBalance,
        newBalance: parsedNewBalance,
      },
      reason: reason || "Manual administrative balance adjustment",
    });

    return NextResponse.json({
      success: true,
      requiresDualApproval: true,
      requestId: pendingReq.id,
      message: `Balance adjustment of ₦${deltaAmount.toLocaleString("en-NG")} exceeds ₦50,000 threshold and has been queued for dual-admin approval.`,
    });
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ balance: parsedNewBalance })
    .eq("id", userId);

  if (error) throw error;

  if (previousUser.email) {
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(previousUser.email).catch(() => {});
    await supabaseAdmin.from("payments").insert({
      user_email: previousUser.email.toLowerCase().trim(),
      reference: `admin_adj_${Date.now()}_${userId.substring(0, 6)}`,
      amount: deltaAmount,
      status: "success",
      type: "admin_adjustment",
      description: reason || `Admin balance adjustment (${prevBalance} -> ${parsedNewBalance})`,
      metadata: {
        admin_email: adminEmail,
        previous_balance: prevBalance,
        new_balance: parsedNewBalance,
        reason: reason || "Manual administrative adjustment",
      },
    }).then(() => {}, () => {});
  }

  await recordAdminAudit(
    adminEmail,
    "adjust_user_balance",
    userId,
    "user",
    reason || "Manual administrative adjustment",
    { balance: prevBalance, email: previousUser.email },
    { balance: parsedNewBalance }
  );

  return NextResponse.json({ success: true });
}

export async function handleDeleteUser(adminEmail: string, userId: string) {
  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select('id, email, username, "profileImage", referral_code')
    .eq("id", userId)
    .maybeSingle();

  if (!previousUser || !previousUser.email) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const emailLower = String(previousUser.email).toLowerCase().trim();
  const usernameLabel = previousUser.username ? `@${previousUser.username}` : emailLower.split("@")[0];

  // 1. Capture storage asset paths before atomic database scrub removes campaign rows
  const adFilesToRemove: string[] = [];
  const newsFilesToRemove: string[] = [];
  try {
    const [userAds, userActiveAds, userNews, userActiveNews] = await Promise.all([
      supabaseAdmin.from("adds").select("ad_media, custom_sponsor_logo").ilike("user_email", emailLower),
      supabaseAdmin.from("addsactive").select("ad_media, custom_sponsor_logo").ilike("user_email", emailLower),
      supabaseAdmin.from("news").select("image_url").ilike("user_email", emailLower),
      supabaseAdmin.from("newsactive").select("image_url").ilike("user_email", emailLower),
    ]);

    [...(userAds.data || []), ...(userActiveAds.data || [])].forEach((ad: any) => {
      const rawMedia = [ad.ad_media, ad.custom_sponsor_logo].filter(Boolean).join(",");
      rawMedia.split(",").forEach((url: string) => {
        const trimmed = url.trim();
        if (trimmed.includes("/ad-media/")) {
          const filename = trimmed.split("/ad-media/").pop()?.split("?")[0];
          if (filename) adFilesToRemove.push(filename);
        }
      });
    });

    [...(userNews.data || []), ...(userActiveNews.data || [])].forEach((item: any) => {
      if (item.image_url && typeof item.image_url === "string") {
        const trimmed = item.image_url.trim();
        if (trimmed.includes("/news/")) {
          const filename = trimmed.split("/news/").pop()?.split("?")[0];
          if (filename) newsFilesToRemove.push(filename);
        }
      }
    });
  } catch {}

  // 2. Call deactivate_user_atomic RPC (scrubs follower/mutual/ad data, records tombstone, notifies neighbors)
  let rpcSucceeded = false;
  let notificationsSentByRpc = false;
  let graph: { referrerEmail: string | null; refereeEmails: string[]; mutualHolderEmails: string[] } = {
    referrerEmail: null,
    refereeEmails: [],
    mutualHolderEmails: [],
  };

  try {
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc("deactivate_user_atomic", {
      p_email: emailLower,
    });

    if (!rpcErr && rpcResult && (rpcResult as any).code === "LOCK_TIMEOUT") {
      return NextResponse.json(
        { error: "Target account is processing another action. Please retry shortly." },
        { status: 409 }
      );
    }

    if (!rpcErr && rpcResult && (rpcResult as any).success === true) {
      rpcSucceeded = true;
      const r = rpcResult as any;
      notificationsSentByRpc = Boolean(r.notifications_sent);
      graph = {
        referrerEmail: r.referrer_email || null,
        refereeEmails: Array.isArray(r.referee_emails) ? r.referee_emails : [],
        mutualHolderEmails: Array.isArray(r.mutual_holder_emails) ? r.mutual_holder_emails : [],
      };
    }
  } catch (rpcEx) {
    console.warn("⚠️ deactivate_user_atomic RPC unavailable in admin delete, running direct scrub fallback:", rpcEx);
  }

  // 3. Fallback if RPC was unavailable: perform full scrub of follower/mutual/ad data + tombstone
  if (!rpcSucceeded) {
    const [upRow, downRows, mutualRows] = await Promise.all([
      supabaseAdmin.from("referrals").select("referrer_email").ilike("referee_email", emailLower).maybeSingle(),
      supabaseAdmin.from("referrals").select("referee_email").ilike("referrer_email", emailLower),
      supabaseAdmin.from("users").select("email, mutuals, mutual_count").contains("mutuals", [emailLower]),
    ]);

    graph.referrerEmail = upRow.data?.referrer_email ? String(upRow.data.referrer_email).toLowerCase() : null;
    graph.refereeEmails = (downRows.data || []).map((r: any) => String(r.referee_email).toLowerCase());
    graph.mutualHolderEmails = (mutualRows.data || []).map((m: any) => String(m.email).toLowerCase());

    // Scrub mutual arrays on neighbor user rows
    for (const holder of mutualRows.data || []) {
      const nextMutuals = Array.isArray(holder.mutuals)
        ? holder.mutuals.filter((e: string) => String(e).toLowerCase() !== emailLower)
        : [];
      await supabaseAdmin
        .from("users")
        .update({
          mutuals: nextMutuals,
          mutual_count: Math.max(0, Number(holder.mutual_count || 1) - 1),
        })
        .eq("email", holder.email);
    }

    const { createHash } = await import("crypto");
    const pseudonym = `deleted_${createHash("md5").update(emailLower).digest("hex")}`;
    await Promise.allSettled([
      supabaseAdmin.from("payments").update({ user_email: pseudonym }).ilike("user_email", emailLower),
      supabaseAdmin.from("forfeited_balances").update({ user_email: pseudonym, username: null }).ilike("user_email", emailLower),
      supabaseAdmin.from("users").update({ referred_by: null }).ilike("referred_by", emailLower),
      previousUser.referral_code
        ? supabaseAdmin.from("users").update({ referred_by: null }).ilike("referred_by", previousUser.referral_code)
        : Promise.resolve(),
    ]);

    await Promise.allSettled([
      supabaseAdmin.from("adds").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("addsactive").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("completed_ads").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("addscompleted").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("news").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("newsactive").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("notifications").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("ad_impressions").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("read_announcements").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("help_tickets").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("referrals").delete().or(`referrer_email.ilike.${emailLower},referee_email.ilike.${emailLower}`),
      supabaseAdmin.from("ad_reports").delete().or(`reporter_email.ilike.${emailLower},advertiser_email.ilike.${emailLower}`),
      supabaseAdmin.from("blocked_advertisers").delete().or(`reporter_email.ilike.${emailLower},advertiser_email.ilike.${emailLower}`),
      supabaseAdmin.from("blocked_ads").delete().ilike("reporter_email", emailLower),
      supabaseAdmin.from("completed_ads_ratings").delete().ilike("advertiser_email", emailLower),
      supabaseAdmin.from("newsletter_subscribers").delete().ilike("email", emailLower),
      supabaseAdmin.from("premium_subscribers").delete().ilike("user_email", emailLower),
    ]);

    const { error: deleteErr } = await supabaseAdmin.from("users").delete().eq("id", userId);
    if (deleteErr) throw deleteErr;

    await supabaseAdmin
      .from("deactivated_users")
      .upsert({ email: emailLower, deactivated_at: new Date().toISOString(), reason: "admin_deleted" })
      .then(() => {}, () => {});
  }

  // 4. Trigger notifications to affected followers / referrer / mutuals if RPC didn't already insert them
  if (!notificationsSentByRpc) {
    const notifyEmails = Array.from(
      new Set(
        [graph.referrerEmail, ...graph.refereeEmails, ...graph.mutualHolderEmails]
          .filter((e): e is string => Boolean(e) && e !== emailLower)
      )
    );
    if (notifyEmails.length > 0) {
      const notifRows = notifyEmails.map((recipient) => ({
        user_email: recipient,
        title: "Account Removed from Network",
        message: `${usernameLabel} has permanently deactivated their account and has been removed from your network lists.`,
      }));
      for (let i = 0; i < notifRows.length; i += 500) {
        await supabaseAdmin
          .from("notifications")
          .insert(notifRows.slice(i, i + 500))
          .then(() => {}, () => {});
      }
    }
  }

  // 5. Purge media, auth identities, and all Redis caches
  const { default: redisConnection, scanDeletePattern } = await import("@/lib/redis");
  const { invalidateCachedProfile, invalidateAllHighlights } = await import("@/lib/utils/cache");
  const { purgeDeletedUserFromAgentCaches } = await import("@/lib/agent/agentCache");
  const { deleteAuth0IdentitiesByEmail } = await import("@/lib/security/auth0Management");

  await Promise.allSettled([
    previousUser.profileImage && String(previousUser.profileImage).includes("storage.supabase")
      ? (() => {
          const parts = String(previousUser.profileImage).split("/");
          return supabaseAdmin.storage.from("dp").remove([`${parts.at(-2)}/${parts.at(-1)}`]);
        })()
      : Promise.resolve(),
    adFilesToRemove.length > 0
      ? supabaseAdmin.storage.from("ad-media").remove(Array.from(new Set(adFilesToRemove)))
      : Promise.resolve(),
    newsFilesToRemove.length > 0
      ? supabaseAdmin.storage.from("news").remove(Array.from(new Set(newsFilesToRemove)))
      : Promise.resolve(),
    purgeDeletedUserFromAgentCaches({ email: emailLower, ...graph }),
    deleteAuth0IdentitiesByEmail(emailLower),
    supabaseAdmin.rpc("delete_auth_user_by_email", { p_email: emailLower }),
    redisConnection.set(`deactivated:${emailLower}`, "1", "EX", 2592000),
    invalidateCachedProfile(emailLower),
    invalidateAllHighlights(),
    redisConnection.del(
      `campaigns:${emailLower}`,
      `feed:ad_ids:${emailLower}`,
      `feed:ads:${emailLower}`,
      `feed:profiles:${emailLower}`,
      `feed:impressions:${emailLower}`,
      `statement:payments:${emailLower}`,
      `statement:withdrawals:${emailLower}`,
      `statement:all:${emailLower}`,
      `monetize:${emailLower}`,
      `monetize:status:${emailLower}`,
      `atw:${emailLower}`,
      `rate:feed:${emailLower}`,
      `user:${emailLower}`,
      `profile:${emailLower}`,
      `cache:user_exists:${emailLower}`,
      "admin:overview:stats",
      "admin:overview_stats"
    ),
    scanDeletePattern("admin:users:list:*"),
    scanDeletePattern("admin:agents:list:*"),
  ]);

  await recordAdminAudit(
    adminEmail,
    "delete_user",
    userId,
    "user",
    "Admin permanent account deletion",
    { email: emailLower, username: previousUser.username },
    null
  );

  return NextResponse.json({ success: true });
}

export async function handleAdAccountAction(adminEmail: string, userId: string, payload: any) {
  const { adStatus, banDays, banReason } = payload || {};
  let adBanUntil = null;
  if (adStatus === "temp_banned") {
    const days = parseInt(banDays || "7", 10);
    adBanUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  } else if (adStatus === "perm_banned") {
    adBanUntil = new Date("2099-12-31T23:59:59Z").toISOString();
  }

  const { data: updatedUser, error } = await supabaseAdmin
    .from("users")
    .update({
      ad_account_status: adStatus,
      ad_ban_until: adBanUntil,
      ad_ban_reason: banReason || null
    })
    .eq("id", userId)
    .select("email")
    .maybeSingle();

  if (error) throw error;

  if (updatedUser?.email) {
    const emailLower = String(updatedUser.email).trim().toLowerCase();
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(emailLower).catch(() => {});

    const { redisConnection, isRedisReady } = await import("@/lib/redis");
    if (adStatus === "perm_banned") {
      await supabaseAdmin
        .from("deactivated_users")
        .upsert(
          {
            email: emailLower,
            deactivated_at: new Date().toISOString(),
            reason: "admin_perm_banned",
          },
          { onConflict: "email" }
        );
      if (isRedisReady()) {
        await redisConnection.set(`perm_banned:${emailLower}`, "1", "EX", 315360000).catch(() => {});
        await redisConnection.set(`deactivated:${emailLower}`, "1", "EX", 315360000).catch(() => {});
        await redisConnection.set(`revoked_before:${emailLower}`, String(Date.now()), "EX", 315360000).catch(() => {});
      }
    } else if (adStatus === "active") {
      await supabaseAdmin
        .from("deactivated_users")
        .delete()
        .eq("email", emailLower)
        .in("reason", ["admin_perm_banned", "perm_banned"]);
      if (isRedisReady()) {
        await redisConnection.del(`perm_banned:${emailLower}`).catch(() => {});
      }
    }
  }

  await recordAdminAudit(
    adminEmail,
    "update_ad_account_status",
    userId,
    "user",
    banReason || null,
    null,
    { adStatus, adBanUntil, banReason }
  );

  return NextResponse.json({ success: true });
}

export async function handleDeactivateAccount(adminEmail: string, userId: string, payload: any) {
  const { deactivated, reason } = payload || {};
  const isDeactivated = Boolean(deactivated);

  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("ad_account_status, email")
    .eq("id", userId)
    .maybeSingle();

  const adStatus = isDeactivated ? "deactivated" : "active";
  const banReason = reason || (isDeactivated ? "Account deactivated by admin" : null);

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      ad_account_status: adStatus,
      ad_ban_reason: banReason,
    })
    .eq("id", userId);

  if (error) throw error;

  if (previousUser?.email) {
    const emailLower = String(previousUser.email).trim().toLowerCase();
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(emailLower).catch(() => {});

    const { redisConnection, isRedisReady } = await import("@/lib/redis");
    if (isDeactivated) {
      await supabaseAdmin
        .from("deactivated_users")
        .upsert(
          {
            email: emailLower,
            deactivated_at: new Date().toISOString(),
            reason: "admin_deactivated",
          },
          { onConflict: "email" }
        );
      if (isRedisReady()) {
        await redisConnection.set(`deactivated:${emailLower}`, "1", "EX", 2592000).catch(() => {});
        await redisConnection.set(`revoked_before:${emailLower}`, String(Date.now()), "EX", 2592000).catch(() => {});
      }
    } else {
      await supabaseAdmin
        .from("deactivated_users")
        .delete()
        .eq("email", emailLower)
        .not("reason", "in", '("admin_perm_banned","perm_banned")');
      if (isRedisReady()) {
        await redisConnection.del(`deactivated:${emailLower}`).catch(() => {});
      }
    }
  }

  await recordAdminAudit(
    adminEmail,
    isDeactivated ? "deactivate_account" : "reactivate_account",
    userId,
    "user",
    banReason,
    previousUser,
    { ad_account_status: adStatus }
  );

  return NextResponse.json({ success: true, deactivated: isDeactivated });
}
