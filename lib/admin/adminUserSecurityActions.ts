import { NextResponse } from "next/server";
import supabaseAdmin from "../utils/dbAdmin";
import { isAdminEmail } from "../adminHelper";
import { invalidateAuthStatusCache } from "../authHelper";
import { invalidateUserNotificationCaches } from "../notifications/notificationCache";
import { recordAdminAudit } from "./adminAudit";

const VALID_AD_ACCOUNT_STATUSES = new Set([
  "active",
  "temp_banned",
  "temp_blocked",
  "perm_banned",
  "deactivated",
]);

export async function handleSuspendUser(adminEmail: string, userId: string, payload: any) {
  const { suspendedUntil, reason, permanent } = payload || {};

  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("email, suspended_until, ad_account_status, ad_ban_reason")
    .eq("id", userId)
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }
  if (isAdminEmail(targetUser.email)) {
    return NextResponse.json(
      { error: "Cannot block or suspend an administrator account." },
      { status: 403 }
    );
  }

  let normalizedUntil: string | null = null;
  if (suspendedUntil !== null && suspendedUntil !== undefined && suspendedUntil !== "") {
    const parsedMs = Date.parse(String(suspendedUntil));
    if (Number.isNaN(parsedMs)) {
      return NextResponse.json({ error: "Invalid suspendedUntil timestamp" }, { status: 400 });
    }
    normalizedUntil = new Date(parsedMs).toISOString();
  }

  const isPermanentBlock =
    Boolean(permanent) ||
    (normalizedUntil !== null &&
      Date.parse(normalizedUntil) - Date.now() >= 40 * 365 * 24 * 60 * 60 * 1000);
  const isUnblock = !normalizedUntil && !isPermanentBlock;
  const cleanReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;

  const nextStatus = isUnblock
    ? "active"
    : isPermanentBlock
    ? "perm_banned"
    : "temp_blocked";

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      suspended_until: isPermanentBlock
        ? "2099-12-31T23:59:59.000Z"
        : normalizedUntil,
      ad_account_status: nextStatus,
      ad_ban_reason: isUnblock ? null : cleanReason,
    })
    .eq("id", userId);

  if (error) throw error;

  if (targetUser.email) {
    const emailLower = String(targetUser.email).toLowerCase().trim();
    const { invalidateCachedProfile } = await import("../utils/cache");
    const { redisConnection, isRedisReady } = await import("../redis");

    if (isPermanentBlock) {
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
        await Promise.allSettled([
          redisConnection.set(`perm_banned:${emailLower}`, "1", "EX", 315360000),
          redisConnection.set(`deactivated:${emailLower}`, "1", "EX", 315360000),
          redisConnection.set(`revoked_before:${emailLower}`, String(Date.now()), "EX", 315360000),
        ]);
      }
    } else if (isUnblock) {
      await supabaseAdmin
        .from("deactivated_users")
        .delete()
        .ilike("email", emailLower)
        .in("reason", ["admin_perm_banned", "perm_banned", "admin_deactivated"]);
      if (isRedisReady()) {
        await Promise.allSettled([
          redisConnection.del(`perm_banned:${emailLower}`),
          redisConnection.del(`deactivated:${emailLower}`),
          redisConnection.del(`revoked_before:${emailLower}`),
        ]);
      }
    } else if (isRedisReady()) {
      const ttlSecs = Math.max(
        60,
        Math.ceil((Date.parse(normalizedUntil!) - Date.now()) / 1000)
      );
      await redisConnection
        .set(`revoked_before:${emailLower}`, String(Date.now()), "EX", Math.min(ttlSecs, 31536000))
        .catch(() => {});
    }

    await invalidateAuthStatusCache(emailLower).catch(() => {});
    await invalidateCachedProfile(emailLower).catch(() => {});
  }

  await recordAdminAudit(
    adminEmail,
    isUnblock ? "unblock_user" : isPermanentBlock ? "permanent_block_user" : "temporary_block_user",
    userId,
    "user",
    cleanReason || (isUnblock ? "Admin lifted block" : isPermanentBlock ? "Admin permanent block" : "Admin temporary block"),
    {
      suspended_until: targetUser.suspended_until,
      ad_account_status: targetUser.ad_account_status,
    },
    {
      suspended_until: isPermanentBlock ? "2099-12-31T23:59:59.000Z" : normalizedUntil,
      ad_account_status: nextStatus,
      reason: cleanReason,
    }
  );

  return NextResponse.json({
    success: true,
    status: nextStatus,
    blockedUntil: isPermanentBlock ? null : normalizedUntil,
  });
}

export async function handleBlockUser(adminEmail: string, userId: string, payload: any) {
  const mode = String(payload?.mode || "temporary").toLowerCase().trim();
  const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";

  if (mode === "unblock") {
    return handleSuspendUser(adminEmail, userId, { suspendedUntil: null, permanent: false, reason });
  }
  if (mode === "permanent") {
    return handleSuspendUser(adminEmail, userId, {
      suspendedUntil: "2099-12-31T23:59:59.000Z",
      permanent: true,
      reason,
    });
  }

  let blockedUntil = payload?.blockedUntil || payload?.suspendedUntil || null;
  if (!blockedUntil) {
    const durationHours = Number(payload?.durationHours);
    const durationDays = Number(payload?.durationDays);
    const ms =
      Number.isFinite(durationHours) && durationHours > 0
        ? durationHours * 60 * 60 * 1000
        : Number.isFinite(durationDays) && durationDays > 0
        ? durationDays * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
    blockedUntil = new Date(Date.now() + ms).toISOString();
  }

  return handleSuspendUser(adminEmail, userId, {
    suspendedUntil: blockedUntil,
    permanent: false,
    reason,
  });
}

export async function handleUnblockUser(adminEmail: string, userId: string, payload: any) {
  return handleSuspendUser(adminEmail, userId, {
    suspendedUntil: null,
    permanent: false,
    reason: payload?.reason || "Admin unblocked user",
  });
}

export async function handleAdjustUserBalance(adminEmail: string, userId: string, payload: any) {
  const { newBalance, delta, reason } = payload || {};
  const hasDelta = delta !== undefined && delta !== null && delta !== "";
  const parsedDelta = hasDelta ? Number(delta) : NaN;
  const parsedNewBalanceInput =
    newBalance !== undefined && newBalance !== null && newBalance !== "" ? Number(newBalance) : NaN;

  if (hasDelta && (!Number.isFinite(parsedDelta) || parsedDelta === 0)) {
    return NextResponse.json({ error: "Invalid balance delta amount" }, { status: 400 });
  }
  if (!hasDelta && (!Number.isFinite(parsedNewBalanceInput) || parsedNewBalanceInput < 0)) {
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
  const effectiveNewBalance = hasDelta
    ? Math.max(0, Math.round((prevBalance + parsedDelta) * 100) / 100)
    : Math.round(parsedNewBalanceInput * 100) / 100;
  const deltaAmount = Math.abs(Math.round((effectiveNewBalance - prevBalance) * 100) / 100);
  const signedDelta = hasDelta ? parsedDelta : Math.round((effectiveNewBalance - prevBalance) * 100) / 100;

  const {
    checkAdminVelocityLimit,
    requiresDualApproval,
    createPendingAdminRequest,
  } = await import("../security/adminGuard");

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
        previous_balance: prevBalance,
        newBalance: effectiveNewBalance,
        new_balance: effectiveNewBalance,
        ...(hasDelta ? { delta: signedDelta } : {}),
      },
      reason: reason || "Manual administrative balance adjustment",
    });

    return NextResponse.json(
      {
        success: true,
        requiresDualApproval: true,
        requestId: pendingReq.id,
        message: `Balance adjustment of ₦${deltaAmount.toLocaleString("en-NG")} exceeds ₦50,000 threshold and has been queued for dual-admin approval.`,
      },
      { status: 202 }
    );
  }

  // Prefer atomic FOR UPDATE RPC so concurrent user earnings/withdrawals are never lost
  let finalPrevBalance = prevBalance;
  let finalNewBalance = effectiveNewBalance;
  let finalAppliedDelta = signedDelta;

  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("adjust_user_balance_atomic", {
    p_user_id: userId,
    p_delta: hasDelta ? signedDelta : null,
    p_new_balance: hasDelta ? null : effectiveNewBalance,
  });

  const rpcPayload = rpcRes as Record<string, any> | null;
  if (!rpcErr && rpcPayload?.success) {
    finalPrevBalance = Number(rpcPayload.previous_balance ?? prevBalance);
    finalNewBalance = Number(rpcPayload.new_balance ?? effectiveNewBalance);
    finalAppliedDelta = Number(rpcPayload.delta ?? signedDelta);
  } else if (!rpcErr && rpcPayload && rpcPayload.success === false) {
    return NextResponse.json(
      { error: String(rpcPayload.error || "Balance adjustment failed") },
      { status: 400 }
    );
  } else if (
    rpcErr &&
    !String(rpcErr.message || "").includes("does not exist") &&
    !String(rpcErr.message || "").includes("could not find function")
  ) {
    return NextResponse.json(
      { error: rpcErr.message || "Balance adjustment failed" },
      { status: 400 }
    );
  } else {
    // Fallback if migration not yet applied
    const { error } = await supabaseAdmin
      .from("users")
      .update({ balance: effectiveNewBalance })
      .eq("id", userId);
    if (error) throw error;
  }

  if (previousUser.email) {
    const emailLower = previousUser.email.toLowerCase().trim();
    const { invalidateCachedProfile } = await import("../utils/cache");
    await invalidateCachedProfile(emailLower).catch(() => {});
    await supabaseAdmin
      .from("payments")
      .insert({
        user_email: emailLower,
        reference: `admin_adj_${Date.now()}_${userId.substring(0, 6)}`,
        amount: Math.abs(finalAppliedDelta),
        status: "success",
        type: "admin_adjustment",
        description: reason || `Admin balance adjustment (${finalPrevBalance} -> ${finalNewBalance})`,
        metadata: {
          admin_email: adminEmail,
          previous_balance: finalPrevBalance,
          new_balance: finalNewBalance,
          delta: finalAppliedDelta,
          reason: reason || "Manual administrative adjustment",
        },
      })
      .then(() => {}, () => {});

    await supabaseAdmin
      .from("notifications")
      .insert({
        user_email: emailLower,
        title: "Wallet Balance Updated",
        message: `Your wallet balance was updated by an administrator to ₦${finalNewBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
      })
      .then(() => {}, () => {});
    await invalidateUserNotificationCaches(emailLower).catch(() => {});
  }

  await recordAdminAudit(
    adminEmail,
    "adjust_user_balance",
    userId,
    "user",
    reason || "Manual administrative adjustment",
    { balance: finalPrevBalance, email: previousUser.email },
    { balance: finalNewBalance, delta: finalAppliedDelta }
  );

  return NextResponse.json({
    success: true,
    previousBalance: finalPrevBalance,
    newBalance: finalNewBalance,
    delta: finalAppliedDelta,
  });
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

  if (isAdminEmail(previousUser.email)) {
    return NextResponse.json(
      { error: "Cannot delete an administrator account." },
      { status: 403 }
    );
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
  if (!adStatus || !VALID_AD_ACCOUNT_STATUSES.has(String(adStatus))) {
    return NextResponse.json(
      { error: "Invalid adStatus. Allowed: active, temp_banned, perm_banned, deactivated." },
      { status: 400 }
    );
  }

  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("email, ad_account_status")
    .eq("id", userId)
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }
  if (adStatus !== "active" && isAdminEmail(targetUser.email)) {
    return NextResponse.json(
      { error: "Cannot ban or deactivate an administrator account." },
      { status: 403 }
    );
  }

  let adBanUntil: string | null = null;
  if (adStatus === "temp_banned") {
    const parsedDays = parseInt(String(banDays ?? "7"), 10);
    if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
      return NextResponse.json({ error: "banDays must be a valid integer between 1 and 3650" }, { status: 400 });
    }
    adBanUntil = new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString();
  } else if (adStatus === "perm_banned") {
    adBanUntil = new Date("2099-12-31T23:59:59Z").toISOString();
  }

  const { data: updatedUser, error } = await supabaseAdmin
    .from("users")
    .update({
      ad_account_status: adStatus,
      ad_ban_until: adBanUntil,
      ad_ban_reason: adStatus === "active" ? null : banReason || null,
    })
    .eq("id", userId)
    .select("email")
    .maybeSingle();

  if (error) throw error;

  if (updatedUser?.email) {
    const emailLower = String(updatedUser.email).trim().toLowerCase();
    const { invalidateCachedProfile } = await import("../utils/cache");
    await invalidateCachedProfile(emailLower).catch(() => {});

    const { redisConnection, isRedisReady } = await import("../redis");
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
    } else if (adStatus === "deactivated") {
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
    } else if (adStatus === "active") {
      await supabaseAdmin
        .from("deactivated_users")
        .delete()
        .ilike("email", emailLower)
        .in("reason", ["admin_perm_banned", "perm_banned", "admin_deactivated"]);
      if (isRedisReady()) {
        await Promise.allSettled([
          redisConnection.del(`perm_banned:${emailLower}`),
          redisConnection.del(`deactivated:${emailLower}`),
          redisConnection.del(`revoked_before:${emailLower}`),
        ]);
      }
    }
    await invalidateAuthStatusCache(emailLower).catch(() => {});
  }

  await recordAdminAudit(
    adminEmail,
    "update_ad_account_status",
    userId,
    "user",
    banReason || null,
    { ad_account_status: targetUser.ad_account_status },
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

  if (!previousUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }
  if (isDeactivated && isAdminEmail(previousUser.email)) {
    return NextResponse.json(
      { error: "Cannot deactivate an administrator account." },
      { status: 403 }
    );
  }

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
    const { invalidateCachedProfile } = await import("../utils/cache");
    await invalidateCachedProfile(emailLower).catch(() => {});

    const { redisConnection, isRedisReady } = await import("../redis");
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
        .ilike("email", emailLower)
        .not("reason", "in", '("admin_perm_banned","perm_banned")');
      if (isRedisReady()) {
        await Promise.allSettled([
          redisConnection.del(`deactivated:${emailLower}`),
          redisConnection.del(`revoked_before:${emailLower}`),
        ]);
      }
    }
    await invalidateAuthStatusCache(emailLower).catch(() => {});
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
