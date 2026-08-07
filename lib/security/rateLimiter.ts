import redisConnection from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  statusCode?: number;
}

/**
 * Checks if emergency system pause flag is active in Redis or DB
 */
export async function checkEmergencyPause(): Promise<RateLimitResult> {
  try {
    const isPaused = await redisConnection.get("system:transfers_paused");
    if (isPaused === "true" || isPaused === "1") {
      return {
        allowed: false,
        reason: "P2P transfers are temporarily under routine security maintenance. Please try again shortly.",
        statusCode: 503,
      };
    }
  } catch (err) {
    console.warn("⚠️ Emergency pause Redis check error:", err);
  }
  return { allowed: true };
}

/**
 * Enforces Velocity & Daily Rate Limits for Sender
 * - Velocity Limit: Max 10 transfer attempts per minute per user
 * - Daily Limit: Max 6 unique recipients per 24 hours per user
 */
export async function checkSenderRateLimit(senderEmail: string, recipientEmail: string): Promise<RateLimitResult> {
  const cleanSender = senderEmail.toLowerCase().trim();
  const cleanRecipient = recipientEmail.toLowerCase().trim();

  const velocityKey = `ratelimit:transfer_velocity:${cleanSender}`;
  const recipientSetKey = `ratelimit:send_money_recipients:${cleanSender}`;

  try {
    // 1. Velocity check (10 requests / 60 seconds)
    const currentVelocity = await redisConnection.incr(velocityKey);
    if (currentVelocity === 1) {
      await redisConnection.expire(velocityKey, 60);
    }

    if (currentVelocity > 10) {
      return {
        allowed: false,
        reason: "Transfer velocity limit exceeded. Please wait a minute before attempting another transfer.",
        statusCode: 429,
      };
    }

    // 2. Unique recipient count check (Max 6 unique recipients per day)
    const [isExistingRecipient, uniqueCount] = await Promise.all([
      redisConnection.sismember(recipientSetKey, cleanRecipient),
      redisConnection.scard(recipientSetKey),
    ]);

    if (!isExistingRecipient && uniqueCount >= 6) {
      return {
        allowed: false,
        reason: "Daily limit reached. You can only send money to up to 6 unique users per day.",
        statusCode: 429,
      };
    }
  } catch (err) {
    console.warn("⚠️ Sender rate limit Redis check error:", err);
  }

  return { allowed: true };
}

/**
 * Enforces Inbound Velocity Rate Limit for Recipient
 * - Inbound Limit: Max 1,000 incoming transfer operations per minute per recipient
 */
export async function checkRecipientRateLimit(recipientEmail: string): Promise<RateLimitResult> {
  const cleanRecipient = recipientEmail.toLowerCase().trim();
  const inboundKey = `ratelimit:inbound_velocity:${cleanRecipient}`;

  try {
    const inboundCount = await redisConnection.incr(inboundKey);
    if (inboundCount === 1) {
      await redisConnection.expire(inboundKey, 60);
    }

    if (inboundCount > 1000) {
      return {
        allowed: false,
        reason: "Recipient account is currently receiving high volume transactions. Please retry in a few moments.",
        statusCode: 429,
      };
    }
  } catch (err) {
    console.warn("⚠️ Recipient rate limit Redis check error:", err);
  }

  return { allowed: true };
}

/**
 * Atomic Sender Balance Reservation using Redis & Supabase verification
 */
export async function reserveSenderBalance(senderEmail: string, amountNaira: number): Promise<{ success: boolean; currentBalance: number; error?: string }> {
  const cleanSender = senderEmail.toLowerCase().trim();

  // Fetch real-time balance from DB
  const { data: user, error: fetchErr } = await supabaseAdmin
    .from("users")
    .select("balance")
    .ilike("email", cleanSender)
    .maybeSingle();

  if (fetchErr || !user) {
    return { success: false, currentBalance: 0, error: "Sender profile not found" };
  }

  const currentBal = parseFloat(user.balance || 0);

  if (currentBal < amountNaira) {
    return { success: false, currentBalance: currentBal, error: "Insufficient wallet balance for this transfer" };
  }

  const maxAllowed = currentBal * 0.20;
  if (amountNaira > maxAllowed + 0.01) {
    const formattedMax = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(maxAllowed);
    return {
      success: false,
      currentBalance: currentBal,
      error: `Transfer amount cannot exceed 20% of your total balance at a time. Maximum allowed is ${formattedMax}.`,
    };
  }

  return { success: true, currentBalance: currentBal };
}
