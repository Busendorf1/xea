import { errorResponse, jsonResponse } from "../_shared/cors.ts";

export async function handleDeactivateAccount(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const confirmText = String(body?.confirmText || "").trim().toUpperCase();
  const confirmEmail = String(body?.confirmEmail || "").toLowerCase().trim();
  const isConfirmed =
    confirmText === "DEACTIVATE" || (confirmEmail && confirmEmail === cleanEmail);

  if (!isConfirmed) {
    return errorResponse(
      "Confirmation required. Type DEACTIVATE or enter your account email to proceed.",
      400,
    );
  }

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, email, username, balance, mutuals, referred_by")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (userErr || !user) {
    // Still record tombstone if auth account exists without users row
    await supabase
      .from("deactivated_users")
      .upsert({ email: cleanEmail, deactivated_at: new Date().toISOString() }, { onConflict: "email" });
    await supabase.rpc("delete_auth_user_by_email", { p_email: cleanEmail }).catch(() => {});
    return jsonResponse({
      success: true,
      message: "Account deactivated successfully.",
    });
  }

  const balance = Math.round(Number(user.balance || 0) * 100) / 100;

  // Balance >= 10,000 NGN blocks deactivation until withdrawn
  if (balance >= 10000) {
    return errorResponse(
      `You have ₦${balance.toLocaleString()} in your wallet. Please withdraw funds (balances ≥ ₦10,000 cannot be forfeited) before deactivating your account.`,
      400,
      { balance, withdrawalRequired: true },
    );
  }

  // Balance > 0 && < 10,000 requires explicit forfeit confirmation
  if (balance > 0 && body?.forfeitConfirmed !== true) {
    return errorResponse(
      `Your remaining balance of ₦${balance.toLocaleString()} is below ₦10,000 and will be permanently forfeited upon deactivation. Confirm forfeiture to proceed.`,
      400,
      {
        requiresForfeitConfirmation: true,
        forfeitableAmount: balance,
      },
    );
  }

  // Record forfeited balance & PII-free reconciliation log BEFORE purge
  if (balance > 0) {
    await supabase.from("forfeited_balances").insert({
      user_email: cleanEmail,
      username: user.username || null,
      amount: balance,
      currency: "NGN",
      reason: "Account deactivation forfeiture",
      status: "PENDING",
    });

    // Strictly omit raw PII (no email/phone/username in reconciliation logs)
    await supabase.from("system_reconciliation_logs").insert({
      status: "RESOLVED",
      total_credits_kobo: 0,
      total_debits_kobo: Math.round(balance * 100),
      variance_kobo: -Math.round(balance * 100),
      notes: "Voluntary account deactivation balance forfeiture processed.",
    });

    const adminEmail = (Deno.env.get("ADMIN_EMAIL") || "nonsom019@gmail.com")
      .toLowerCase()
      .trim();
    await supabase
      .from("notifications")
      .insert({
        user_email: adminEmail,
        title: "Account Balance Forfeited",
        message: `₦${balance.toLocaleString()} was forfeited from a deactivated account and queued in Forfeited Balances.`,
        type: "admin_alert",
        is_read: false,
      })
      .catch(() => {});
  }

  // Capture network graph links BEFORE atomic deletion
  const [{ data: asReferee }, { data: asReferrer }, { data: mutualRows }] =
    await Promise.all([
      supabase.from("referrals").select("referrer_email").ilike("referee_email", cleanEmail).limit(10),
      supabase.from("referrals").select("referee_email").ilike("referrer_email", cleanEmail).limit(5000),
      supabase.from("users").select("email").contains("mutuals", [cleanEmail]).limit(5000),
    ]);

  // Execute canonical atomic account deletion RPC
  const { data: rpcRes, error: rpcErr } = await supabase.rpc(
    "deactivate_user_atomic",
    { p_email: cleanEmail },
  );

  // Fallback cleanup if RPC errored (ensures tombstones, ads, links, & notifications always complete)
  if (rpcErr || !rpcRes?.success) {
    await supabase
      .from("deactivated_users")
      .upsert({ email: cleanEmail, deactivated_at: new Date().toISOString() }, { onConflict: "email" });

    // Remove ads, highlights, and bids
    await Promise.allSettled([
      supabase.from("adds").delete().ilike("user_email", cleanEmail),
      supabase.from("addsactive").delete().ilike("user_email", cleanEmail),
      supabase.from("completed_ads").delete().ilike("user_email", cleanEmail),
      supabase.from("addscompleted").delete().ilike("user_email", cleanEmail),
      supabase.from("news").delete().ilike("user_email", cleanEmail),
      supabase.from("newsactive").delete().ilike("user_email", cleanEmail),
      supabase.from("users").update({ referred_by: null }).ilike("referred_by", cleanEmail),
      supabase.from("referrals").delete().ilike("referrer_email", cleanEmail),
      supabase.from("referrals").delete().ilike("referee_email", cleanEmail),
    ]);

    for (const mRow of mutualRows || []) {
      const mEmail = String(mRow.email || "").toLowerCase().trim();
      if (!mEmail) continue;
      const { data: holder } = await supabase
        .from("users")
        .select("mutuals, mutual_count")
        .ilike("email", mEmail)
        .maybeSingle();
      if (holder && Array.isArray(holder.mutuals)) {
        const filtered = holder.mutuals.filter(
          (e: string) => String(e).toLowerCase().trim() !== cleanEmail,
        );
        await supabase
          .from("users")
          .update({ mutuals: filtered, mutual_count: filtered.length })
          .ilike("email", mEmail);
      }
    }

    await supabase.from("users").delete().eq("id", user.id);
  }

  // Emit follower, referee, & mutual notifications if the RPC did not already emit them
  const alreadyNotifiedCount = Number(rpcRes?.notifications_sent || 0);
  if (alreadyNotifiedCount === 0) {
    const handle = user.username ? `@${String(user.username).replace(/^@/, "")}` : "A connection";
    const notifRows: Array<Record<string, unknown>> = [];
    const recipientSet = new Set<string>();

    const referrerEmails = (rpcRes?.referrer_email
      ? [String(rpcRes.referrer_email)]
      : (asReferee || []).map((r: { referrer_email: string }) => String(r.referrer_email || ""))
    )
      .map((e) => e.toLowerCase().trim())
      .filter((e) => e && e !== cleanEmail);

    for (const rEmail of referrerEmails) {
      if (recipientSet.has(`ref:${rEmail}`)) continue;
      recipientSet.add(`ref:${rEmail}`);
      notifRows.push({
        user_email: rEmail,
        title: "Network Update",
        message: `${handle} deactivated their account and was removed from your referrals.`,
        type: "network",
        is_read: false,
      });
    }

    const refereeEmails: string[] = Array.isArray(rpcRes?.referee_emails)
      ? rpcRes.referee_emails
      : (asReferrer || []).map((r: { referee_email: string }) => String(r.referee_email || ""));

    for (const fEmailRaw of refereeEmails) {
      const fEmail = String(fEmailRaw || "").toLowerCase().trim();
      if (!fEmail || fEmail === cleanEmail || recipientSet.has(`fol:${fEmail}`)) continue;
      recipientSet.add(`fol:${fEmail}`);
      notifRows.push({
        user_email: fEmail,
        title: "Agent Network Update",
        message: `Your referring user (${handle}) deactivated their account. Your direct link has been removed.`,
        type: "network",
        is_read: false,
      });
    }

    const mutualHolderEmails: string[] = Array.isArray(rpcRes?.mutual_holder_emails)
      ? rpcRes.mutual_holder_emails
      : (mutualRows || []).map((m: { email: string }) => String(m.email || ""));

    for (const mEmailRaw of mutualHolderEmails) {
      const mEmail = String(mEmailRaw || "").toLowerCase().trim();
      if (!mEmail || mEmail === cleanEmail || recipientSet.has(`mut:${mEmail}`)) continue;
      recipientSet.add(`mut:${mEmail}`);
      notifRows.push({
        user_email: mEmail,
        title: "Mutual Connection Removed",
        message: `${handle} deactivated their account and was removed from your mutuals.`,
        type: "network",
        is_read: false,
      });
    }

    if (notifRows.length > 0) {
      for (let i = 0; i < notifRows.length; i += 200) {
        await supabase.from("notifications").insert(notifRows.slice(i, i + 200)).catch(() => {});
      }
    }
  }

  // Delete Supabase Auth record cleanly
  await supabase.rpc("delete_auth_user_by_email", { p_email: cleanEmail }).catch(() => {});

  return jsonResponse({
    success: true,
    forfeitedAmount: balance,
    message: "Your account and personal data have been permanently deactivated.",
  });
}
