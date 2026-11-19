import { computeAtwTierDetails, MAX_ATW_LEVEL } from "./atwEngine.ts";

export function parseNumericAtwLevel(tierCode?: string | null): number {
  if (!tierCode || typeof tierCode !== "string") return 1;
  const trimmed = tierCode.trim();
  if (trimmed.toLowerCase() === "unlimited") return MAX_ATW_LEVEL;
  const match = /^ATW(\d+)$/i.exec(trimmed);
  if (!match) return 1;
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(MAX_ATW_LEVEL, parsed);
}

async function insertDeduplicatedEdgeNotification(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: {
    emailLower: string;
    title: string;
    message: string;
    lookbackDays: number;
  },
): Promise<boolean> {
  const { emailLower, title, message, lookbackDays } = params;
  if (!emailLower) return false;

  try {
    const sinceIso = new Date(Date.now() - lookbackDays * 86400_000).toISOString();
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .ilike("user_email", emailLower)
      .eq("title", title)
      .gte("created_at", sinceIso)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return false;

    const { error: insertErr } = await supabase
      .from("notifications")
      .insert([{ user_email: emailLower, title, message }]);

    if (insertErr) {
      console.warn("⚠️ Edge milestone notification insert failed:", insertErr.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("⚠️ Edge milestone notification error:", err);
    return false;
  }
}

export async function checkAndInsertEdgeMilestoneNotifications(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: {
    email: string;
    prevClicks?: number;
    prevMonetized?: boolean;
    prevAtwTier?: string | null;
    nextClicks: number;
    nextMonetized: boolean;
    nextAtwTier?: string | null;
    attentionWorthScore?: number | null;
    isExempt?: boolean;
    hasCancelled?: boolean;
    checkRecentUnlock?: boolean;
  },
): Promise<{ monetizationNotified: boolean; atwNotified: boolean }> {
  const emailLower = String(input.email || "").toLowerCase().trim();
  if (!emailLower || input.isExempt || input.hasCancelled) {
    return { monetizationNotified: false, atwNotified: false };
  }

  const crossedMonetization =
    input.nextMonetized &&
    input.nextClicks >= 500 &&
    (input.prevMonetized === false ||
      (typeof input.prevClicks === "number" && input.prevClicks < 500) ||
      input.nextClicks === 500 ||
      Boolean(input.checkRecentUnlock));

  const nextDetails = computeAtwTierDetails({
    email: emailLower,
    clicks: input.nextClicks,
    attentionWorthScore: input.attentionWorthScore,
    currentTier: input.nextAtwTier,
    isAffiliate: false,
    isCareer: false,
  });

  const hasExplicitPrevTier =
    typeof input.prevAtwTier === "string" && input.prevAtwTier.trim().length > 0;
  const prevLevel = hasExplicitPrevTier
    ? parseNumericAtwLevel(input.prevAtwTier)
    : typeof input.prevClicks === "number"
    ? computeAtwTierDetails({
        email: emailLower,
        clicks: input.prevClicks,
        attentionWorthScore: input.attentionWorthScore,
        isAffiliate: false,
        isCareer: false,
      }).tierLevel
    : nextDetails.tierLevel;

  const atwIncreased =
    !nextDetails.isUnlimited &&
    nextDetails.tierLevel >= 2 &&
    nextDetails.tierLevel > prevLevel;

  let monetizationNotified = false;
  let atwNotified = false;

  if (crossedMonetization) {
    monetizationNotified = await insertDeduplicatedEdgeNotification(supabase, {
      emailLower,
      title: "Monetization Unlocked! Welcome to ATW1",
      message:
        "Congratulations! You have reached 500 clicks and unlocked monetization (ATW1, ₦30,000 balance cap). Start earning on ads now, and remember to withdraw promptly.",
      lookbackDays: 7,
    });
  }

  if (atwIncreased) {
    const capFormatted = `₦${nextDetails.holdingCap.toLocaleString("en-US")}`;
    atwNotified = await insertDeduplicatedEdgeNotification(supabase, {
      emailLower,
      title: `ATW Level Upgraded to ${nextDetails.tier}`,
      message: `Congratulations! Your ATW level has increased to ${nextDetails.tier}, raising your new balance cap to ${capFormatted}. Please withdraw your earnings promptly so you don't hit your limit.`,
      lookbackDays: 180,
    });
  }

  return { monetizationNotified, atwNotified };
}
