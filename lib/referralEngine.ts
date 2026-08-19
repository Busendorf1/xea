import redisConnection from "./redis";
import supabaseAdmin from "./utils/dbAdmin";
import crypto from "crypto";

const IP_REFERRAL_DAILY_LIMIT = 30; // Max 30 referral registrations per IP subnet / 24 hours
const IP_RATE_LIMIT_TTL_SECONDS = 86400; // 24 Hours

/**
 * Calculates ATW Tier Level from Clicks OR Invites (Dual Progression)
 * Level 1: 12 Invites / 300 Clicks
 * Each level increment: +15 Invites OR +300 Clicks
 * Max: ATW14 (₦1.4M Cap)
 */
export function calculateAtwTier(clicks = 0, invites = 0): {
  tier: string;
  level: number;
  holdingLimit: number;
} {
  const levelFromInvites = invites >= 12 ? 1 + Math.floor((invites - 12) / 15) : 1;
  const levelFromClicks = clicks >= 300 ? 1 + Math.floor((clicks - 300) / 300) : 1;
  const finalLevel = Math.min(14, Math.max(1, Math.max(levelFromInvites, levelFromClicks)));

  return {
    tier: `ATW${finalLevel}`,
    level: finalLevel,
    holdingLimit: finalLevel * 100000,
  };
}

/**
 * Checks and increments IP subnet registration rate limiter
 * Enforces max 30 per day per IP/subnet in Redis
 */
export async function checkIpSubnetRateLimit(ipAddress: string): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
}> {
  if (!ipAddress) {
    return { allowed: true, currentCount: 1, limit: IP_REFERRAL_DAILY_LIMIT };
  }

  try {
    const ipHash = crypto.createHash("sha256").update(ipAddress.trim()).digest("hex").slice(0, 16);
    const key = `rate:ref:ip:${ipHash}`;

    const count = await redisConnection.incr(key);
    if (count === 1) {
      await redisConnection.expire(key, IP_RATE_LIMIT_TTL_SECONDS);
    }

    if (count > IP_REFERRAL_DAILY_LIMIT) {
      return { allowed: false, currentCount: count, limit: IP_REFERRAL_DAILY_LIMIT };
    }

    return { allowed: true, currentCount: count, limit: IP_REFERRAL_DAILY_LIMIT };
  } catch (err) {
    console.error("❌ Redis IP Rate Limit error in checkIpSubnetRateLimit:", err);
    return { allowed: true, currentCount: 1, limit: IP_REFERRAL_DAILY_LIMIT };
  }
}

/**
 * Registers an app install referral link with Anti-Fraud gates:
 * 1. IP Subnet Rate Limiting (30/day max)
 * 2. Unique Device Hash (1 physical device = 1 credit)
 * 3. Self-referral protection
 */
export async function registerReferralInvite({
  referrerCode,
  refereeEmail,
  deviceHash,
  ipAddress,
}: {
  referrerCode: string;
  refereeEmail: string;
  deviceHash: string;
  ipAddress?: string;
}): Promise<{ success: boolean; error?: string; referrerEmail?: string }> {
  try {
    if (!referrerCode || !refereeEmail || !deviceHash) {
      return { success: false, error: "Missing required referral parameters." };
    }

    const cleanReferee = refereeEmail.toLowerCase().trim();
    const cleanCode = referrerCode.toUpperCase().trim();
    const cleanDeviceHash = deviceHash.trim();

    // 1. IP Subnet Throttling Check (Max 30 / day)
    if (ipAddress) {
      const ipCheck = await checkIpSubnetRateLimit(ipAddress);
      if (!ipCheck.allowed) {
        return {
          success: false,
          error: "Daily referral limit reached from this network. Please try again tomorrow.",
        };
      }
    }

    // 2. Resolve referrer by code
    const { data: referrerUser, error: refErr } = await supabaseAdmin
      .from("users")
      .select("email, id")
      .eq("referral_code", cleanCode)
      .maybeSingle();

    if (refErr || !referrerUser) {
      return { success: false, error: "Invalid referral code." };
    }

    const referrerEmail = referrerUser.email.toLowerCase().trim();

    // 3. Block self-referrals
    if (referrerEmail === cleanReferee) {
      return { success: false, error: "You cannot refer your own account." };
    }

    // 4. Insert into referrals table with unique device_hash constraint
    const { error: insertErr } = await supabaseAdmin.from("referrals").insert({
      referrer_email: referrerEmail,
      referee_email: cleanReferee,
      device_hash: cleanDeviceHash,
      ip_address: ipAddress || null,
      status: "pending",
      interactions_count: 0,
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        // Unique violation (device_hash or referee_email already used)
        return {
          success: false,
          error: "This device or account has already been registered with a referral.",
        };
      }
      return { success: false, error: insertErr.message || "Failed to link referral." };
    }

    // 5. Update user's referred_by column
    await supabaseAdmin
      .from("users")
      .update({ referred_by: referrerEmail })
      .eq("email", cleanReferee);

    return { success: true, referrerEmail };
  } catch (err: any) {
    console.error("❌ Unexpected error in registerReferralInvite:", err);
    return { success: false, error: err.message || "Internal referral error." };
  }
}
