import redisConnection, { isRedisReady } from "../redis";
import supabaseAdmin from "./dbAdmin";
import { invalidateCachedProfile } from "./cache";

const ACTIVITY_THROTTLE_TTL_SECONDS = 86400; // 24 Hours
const ACTIVITY_THROTTLE_MS = ACTIVITY_THROTTLE_TTL_SECONDS * 1000;

// L1 In-Memory 24-Hour Throttle Map (prevents DB write storms even if Redis is offline or over quota)
const l1ActivityTouchMap = new Map<string, number>();
const MAX_L1_ACTIVITY_ENTRIES = 10000;

function isL1ActivityTouched(emailLower: string): boolean {
  const exp = l1ActivityTouchMap.get(emailLower);
  if (!exp) return false;
  if (Date.now() < exp) return true;
  l1ActivityTouchMap.delete(emailLower);
  return false;
}

function markL1ActivityTouched(emailLower: string): void {
  if (l1ActivityTouchMap.size >= MAX_L1_ACTIVITY_ENTRIES) {
    const firstKey = l1ActivityTouchMap.keys().next().value;
    if (firstKey) l1ActivityTouchMap.delete(firstKey);
  }
  l1ActivityTouchMap.set(emailLower, Date.now() + ACTIVITY_THROTTLE_MS);
}

/**
 * 24-Hour Throttled Activity Writer & 7-Day Inactivity Check
 * 1. Checks if user was inactive for 7+ days (instant lazy evaluation).
 * 2. If active, writes last_active_at to PostgreSQL at most once every 24 hours via L1 Memory + L2 Redis deduplication.
 */
export async function touchUserActivity(
  email: string,
  userProfile?: { last_active_at?: string | null; monetized?: any; monetization_clicks?: any }
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

      // 7-Day Inactivity Rule: If inactive >= 7 days and account was monetized or has progress clicks
      const wasMonetized =
        userProfile.monetized === "yes" ||
        userProfile.monetized === "true" ||
        userProfile.monetized === true;
      const hadClicks = Number(userProfile.monetization_clicks || 0) > 0;

      if (daysInactive >= 7 && (wasMonetized || hadClicks)) {
        console.warn(` User ${emailLower} inactive for ${daysInactive} days. Revoking monetization & resetting clicks...`);
        await supabaseAdmin.rpc("check_and_update_monetization_status", {
          p_email: emailLower,
        });
        await invalidateCachedProfile(emailLower);
        markL1ActivityTouched(emailLower);
        return { daysInactive, isDeMonetized: true };
      }

      // If last_active_at in DB was already updated within the last 12 hours, mark L1 touched and skip DB write
      if (nowMs - lastActiveMs < 12 * 60 * 60 * 1000) {
        markL1ActivityTouched(emailLower);
        return { daysInactive, isDeMonetized: false };
      }
    }

    // 2. Fast L1 In-Memory 24-Hour Throttling Gate (0ms, zero Redis commands)
    if (isL1ActivityTouched(emailLower)) {
      return { daysInactive, isDeMonetized: false };
    }

    // 3. L2 Redis 24-Hour Throttling Gate
    let isAlreadyTouched: string | null = null;
    if (isRedisReady()) {
      try {
        isAlreadyTouched = await redisConnection.get(throttleKey);
      } catch {}
    }

    markL1ActivityTouched(emailLower);

    if (!isAlreadyTouched) {
      if (isRedisReady()) {
        try {
          await redisConnection.set(throttleKey, "1", "EX", ACTIVITY_THROTTLE_TTL_SECONDS);
        } catch {}
      }

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
