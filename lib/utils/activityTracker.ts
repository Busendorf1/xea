import redisConnection from "../redis";
import supabaseAdmin from "./dbAdmin";
import { invalidateCachedProfile } from "./cache";

const ACTIVITY_THROTTLE_TTL_SECONDS = 86400; // 24 Hours

/**
 * 24-Hour Throttled Activity Writer & 7-Day Inactivity Check
 * 1. Checks if user was inactive for 7+ days (instant lazy evaluation).
 * 2. If active, writes last_active_at to PostgreSQL at most once every 24 hours via Redis deduplication.
 */
export async function touchUserActivity(
  email: string,
  userProfile?: { last_active_at?: string | null; monetized?: any }
): Promise<{ daysInactive: number; isDeMonetized: boolean }> {
  if (!email) return { daysInactive: 0, isDeMonetized: false };

  const emailLower = email.toLowerCase().trim();
  const throttleKey = `active:touch:${emailLower}`;

  let daysInactive = 0;
  const isDeMonetized = false;

  try {
    // 1. Calculate days inactive if last_active_at is provided
    if (userProfile?.last_active_at) {
      const lastActiveMs = new Date(userProfile.last_active_at).getTime();
      const nowMs = Date.now();
      daysInactive = Math.max(0, Math.floor((nowMs - lastActiveMs) / (1000 * 60 * 60 * 24)));

      // 7-Day Inactivity Rule: If inactive >= 7 days and account was monetized
      const wasMonetized =
        userProfile.monetized === "yes" ||
        userProfile.monetized === "true" ||
        userProfile.monetized === true;

      if (daysInactive >= 7 && wasMonetized) {
        console.warn(` User ${emailLower} inactive for ${daysInactive} days. Revoking monetization...`);
        await supabaseAdmin.rpc("check_and_update_monetization_status", {
          p_email: emailLower,
        });
        await invalidateCachedProfile(emailLower);
        return { daysInactive, isDeMonetized: true };
      }
    }

    // 2. 24-Hour Throttling Gate in Redis
    const isAlreadyTouched = await redisConnection.get(throttleKey);
    if (!isAlreadyTouched) {
      // Set Redis key with 24-hour TTL to prevent further DB writes today
      await redisConnection.set(throttleKey, "1", "EX", ACTIVITY_THROTTLE_TTL_SECONDS);

      // Async touch in PostgreSQL (fire-and-forget, non-blocking)
      (async () => {
        try {
          await supabaseAdmin
            .from("users")
            .update({ last_active_at: new Date().toISOString() })
            .eq("email", emailLower);
          console.log(` Updated daily activity timestamp for: ${emailLower}`);
        } catch (err) {
          console.error(` Failed to update last_active_at for ${emailLower}:`, err);
        }
      })();
    }

    return { daysInactive, isDeMonetized };
  } catch (err) {
    console.error(" Error in touchUserActivity:", err);
    return { daysInactive: 0, isDeMonetized: false };
  }
}
