import { computeAtwTierDetails } from "../_shared/atwEngine.ts";
import { AFFILIATE_EMAILS, errorResponse, jsonResponse } from "../_shared/cors.ts";
import {
  checkAndInsertEdgeMilestoneNotifications,
  parseNumericAtwLevel,
} from "../_shared/milestoneNotifications.ts";

export async function handleGetMonetization(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
): Promise<Response> {
  const [{ data: tomb }, { data: user, error: userErr }] = await Promise.all([
    supabase.from("deactivated_users").select("email").eq("email", cleanEmail).maybeSingle(),
    supabase
      .from("users")
      .select(
        "id, email, username, balance, monetized, monetized_at, monetization_clicks, has_cancelled_monetization, attention_worth_score, atw_tier, last_active_at, is_affiliate, is_career, ad_account_status, suspended_until",
      )
      .ilike("email", cleanEmail)
      .maybeSingle(),
  ]);

  if (tomb || user?.ad_account_status === "deactivated") {
    return errorResponse("Account is deactivated.", 403, { code: "ACCOUNT_DEACTIVATED" });
  }
  if (userErr || !user) {
    return errorResponse("User profile not found.", 404);
  }

  const isExempt = Boolean(
    user.is_affiliate || user.is_career || AFFILIATE_EMAILS.has(cleanEmail),
  );

  // Compute accurate daysInactive from last_active_at (never hardcoded 0)
  let daysInactive = 0;
  if (user.last_active_at) {
    const lastActiveMs = new Date(user.last_active_at).getTime();
    if (!Number.isNaN(lastActiveMs) && lastActiveMs > 0) {
      daysInactive = Math.max(0, Math.floor((Date.now() - lastActiveMs) / 86400000));
    }
  }

  let wasReset = false;
  let dormantForfeited = false;
  let clicks = Math.max(0, Number(user.monetization_clicks || 0));
  let isMonetized =
    !user.has_cancelled_monetization &&
    (isExempt ||
      ["true", "yes", "1", "t"].includes(String(user.monetized || "").toLowerCase()));
  let balance = Number(user.balance || 0);
  let score = Number(user.attention_worth_score ?? 0.1);
  let currentTier = user.atw_tier;

  // Execute canonical DB status sync RPC
  const { data: rpcStatus } = await supabase
    .rpc("check_and_update_monetization_status", { user_email_param: cleanEmail })
    .catch(() => ({ data: null }));

  if (rpcStatus) {
    isMonetized = Boolean(rpcStatus.is_monetized);
    clicks = Number(rpcStatus.clicks ?? clicks);
    wasReset = Boolean(rpcStatus.was_reset);
    if (typeof rpcStatus.days_inactive === "number") {
      daysInactive = Math.max(daysInactive, Number(rpcStatus.days_inactive));
    }
  }

  // Enforce 60-day dormancy balance forfeiture for THIS user only (never call table-scanning RPC inline!)
  if (!isExempt && daysInactive >= 60) {
    // Forfeit caller's own row directly without scanning 500M users inline
    if (balance > 0) {
      await supabase.from("forfeited_balances").insert({
        user_email: cleanEmail,
        username: user.username || null,
        amount: balance,
        currency: "NGN",
        reason: "60-day dormant inactivity forfeiture",
        status: "PENDING",
      });
      await supabase.from("system_reconciliation_logs").insert({
        status: "RESOLVED",
        total_credits_kobo: 0,
        total_debits_kobo: Math.round(balance * 100),
        variance_kobo: -Math.round(balance * 100),
        notes: "60-day dormancy balance forfeiture executed.",
      });
    }

    await supabase
      .from("users")
      .update({
        balance: 0,
        monetized: "false",
        monetization_clicks: 0,
        atw_tier: "ATW1",
        attention_worth_score: 0.1,
      })
      .eq("id", user.id);

    balance = 0;
    clicks = 0;
    isMonetized = false;
    score = 0.1;
    currentTier = "ATW1";
    wasReset = true;
    dormantForfeited = true;
  } else if (!isExempt && daysInactive >= 7 && (isMonetized || clicks > 0)) {
    // 7-day monetization pause & reset (aligned with SQL + web)
    await supabase
      .from("users")
      .update({
        monetized: "false",
        monetization_clicks: 0,
        atw_tier: "ATW1",
        attention_worth_score: 0.1,
      })
      .eq("id", user.id);

    clicks = 0;
    isMonetized = false;
    score = 0.1;
    currentTier = "ATW1";
    wasReset = true;
  }

  const atw = computeAtwTierDetails({
    email: cleanEmail,
    clicks,
    attentionWorthScore: score,
    currentTier,
    isAffiliate: user.is_affiliate,
    isCareer: user.is_career,
  });

  const dbWasMonetized = ["true", "yes", "1", "t"].includes(String(user.monetized || "").toLowerCase());
  const prevLevel = parseNumericAtwLevel(user.atw_tier);
  if (!wasReset && !user.has_cancelled_monetization && (isMonetized || clicks >= 500)) {
    const finalMonetized = isExempt || isMonetized || clicks >= 500;
    if ((finalMonetized && !dbWasMonetized) || atw.tier !== user.atw_tier) {
      await supabase
        .from("users")
        .update({
          monetized: finalMonetized ? "true" : "false",
          atw_tier: atw.tier,
          ...(finalMonetized && !dbWasMonetized ? { monetized_at: new Date().toISOString() } : {}),
        })
        .eq("id", user.id);
    }

    const monetizedAtMs = user.monetized_at ? new Date(user.monetized_at).getTime() : 0;
    const unlockedRecently = monetizedAtMs > 0 && Date.now() - monetizedAtMs <= 7 * 86400_000;
    if (
      !isExempt &&
      finalMonetized &&
      clicks >= 500 &&
      (!dbWasMonetized || atw.tierLevel > prevLevel || unlockedRecently)
    ) {
      await checkAndInsertEdgeMilestoneNotifications(supabase, {
        email: cleanEmail,
        prevClicks: Number(user.monetization_clicks || 0),
        prevMonetized: dbWasMonetized,
        prevAtwTier: user.atw_tier,
        nextClicks: clicks,
        nextMonetized: finalMonetized,
        nextAtwTier: atw.tier,
        attentionWorthScore: score,
        isExempt,
        hasCancelled: Boolean(user.has_cancelled_monetization),
        checkRecentUnlock: unlockedRecently,
      });
    }
    isMonetized = finalMonetized;
  }

  return jsonResponse({
    monetized: isMonetized,
    hasCancelledMonetization: Boolean(user.has_cancelled_monetization),
    clicks,
    requiredClicks: 500,
    daysInactive,
    wasReset,
    dormantForfeited,
    balance,
    atwTier: atw.tier,
    atwLevel: atw.tierLevel,
    holdingCap: atw.isUnlimited ? null : atw.holdingCap,
    maxHoldingCap: atw.isUnlimited ? null : atw.maxHoldingCap,
    attentionWorthScore: atw.score,
    effectiveClicks: atw.effectiveClicks,
    nextTierClicks: atw.nextTierClicks,
    progressPercent: atw.progressPercent,
    isUnlimited: atw.isUnlimited,
    monetizationPausedWarning: !isExempt && daysInactive >= 7,
  });
}

export async function handleResumeMonetization(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
): Promise<Response> {
  const [{ data: tomb }, { data: currentUser }] = await Promise.all([
    supabase.from("deactivated_users").select("email").eq("email", cleanEmail).maybeSingle(),
    supabase
      .from("users")
      .select("has_cancelled_monetization")
      .ilike("email", cleanEmail)
      .maybeSingle(),
  ]);
  if (tomb) return errorResponse("Account is deactivated.", 403);
  if (!currentUser?.has_cancelled_monetization) {
    return errorResponse("Monetization is not cancelled for this account.", 400);
  }

  await supabase
    .from("users")
    .update({
      monetized: "false",
      monetization_clicks: 0,
      atw_tier: "ATW1",
      attention_worth_score: 0.1,
      has_cancelled_monetization: false,
      last_active_at: new Date().toISOString(),
    })
    .ilike("email", cleanEmail);

  return jsonResponse({
    success: true,
    message:
      "Monetization path resumed! Complete 500 clicks on feed ads to activate your account monetization.",
  });
}

export async function handleCancelMonetization(
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
    return errorResponse("Confirmation error. Type DEACTIVATE to cancel monetization.", 400);
  }

  await supabase
    .from("users")
    .update({
      monetized: "false",
      monetization_clicks: 0,
      atw_tier: "ATW1",
      attention_worth_score: 0.1,
      has_cancelled_monetization: true,
    })
    .ilike("email", cleanEmail);

  return jsonResponse({
    success: true,
    message: "Monetization cancelled successfully.",
  });
}
