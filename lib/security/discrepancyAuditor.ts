import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";

const REDIS_DEBITS_KEY = "audit:live:debits_kobo";
const REDIS_CREDITS_KEY = "audit:live:credits_kobo";

/**
 * High-Volume In-Flight Delta Tracking
 * Records atomic debit and credit values in Redis without touching disk.
 */
export async function recordLiveTransferDelta(amountKobo: number): Promise<void> {
  if (!isRedisReady() || amountKobo <= 0) return;
  try {
    const multi = redisConnection.multi();
    multi.incrby(REDIS_DEBITS_KEY, amountKobo);
    multi.incrby(REDIS_CREDITS_KEY, amountKobo);
    // Keep counters alive with 24-hour sliding window
    multi.expire(REDIS_DEBITS_KEY, 86400);
    multi.expire(REDIS_CREDITS_KEY, 86400);
    await multi.exec();
  } catch (err: any) {
    console.warn("⚠️ DiscrepancyAuditor: Failed to record live delta:", err?.message || err);
  }
}

/**
 * Automated Discrepancy & Circuit Breaker Trigger
 * Inspects both real-time Redis delta balance and database reconciliation metrics.
 * Automatically trips the global circuit breaker if variance is detected.
 */
export async function runAutomatedDiscrepancyCheck(): Promise<{
  healthy: boolean;
  varianceNaira: number;
  circuitBreakerTripped: boolean;
  message: string;
}> {
  try {
    // 1. Inspect live Redis in-flight balance delta
    let redisVarianceKobo = 0;
    if (isRedisReady()) {
      const [debitsRaw, creditsRaw] = await Promise.all([
        redisConnection.get(REDIS_DEBITS_KEY),
        redisConnection.get(REDIS_CREDITS_KEY),
      ]);
      const debits = parseInt(debitsRaw || "0", 10);
      const credits = parseInt(creditsRaw || "0", 10);
      redisVarianceKobo = Math.abs(debits - credits);
    }

    // 2. Fetch authoritative database reconciliation metrics
    let dbVarianceNaira = 0;
    const { data: rpcMetrics, error: rpcErr } = await supabaseAdmin.rpc("get_admin_reconciliation_metrics");
    if (!rpcErr && rpcMetrics) {
      dbVarianceNaira = parseFloat(rpcMetrics.variance_naira || "0");
    }

    const totalVarianceNaira = Math.max(dbVarianceNaira, redisVarianceKobo / 100);

    if (totalVarianceNaira > 0) {
      // 🚨 AUTOMATED CIRCUIT BREAKER ACTIVATION
      console.error(`🚨 AUTOMATED FINANCIAL VARIANCE DETECTED: ₦${totalVarianceNaira.toFixed(2)}. Activating Circuit Breaker!`);

      if (isRedisReady()) {
        await redisConnection.set("system:transfers_paused", "true");
        await redisConnection.del("admin:reconciliation:metrics_cache");
      }

      // Log in system_reconciliation_logs
      try {
        await supabaseAdmin.from("system_reconciliation_logs").insert([{
          total_debits_kobo: Math.round((rpcMetrics?.total_sent_naira || 0) * 100),
          total_credits_kobo: Math.round((rpcMetrics?.total_received_naira || 0) * 100),
          variance_kobo: Math.round(totalVarianceNaira * 100),
          status: "FLAGGED",
          notes: `AUTOMATED CIRCUIT BREAKER TRIPPED: Discrepancy of ₦${totalVarianceNaira.toFixed(2)} detected by real-time auditor.`,
        }]);
      } catch {}

      // Record in admin_audit_logs
      try {
        await supabaseAdmin.from("admin_audit_logs").insert([{
          admin_email: "SYSTEM_AUTOMATED_AUDITOR",
          action: "auto_trip_emergency_circuit_breaker",
          target_id: "system:transfers_paused",
          target_type: "circuit_breaker",
          reason: `Automated variance detected: ₦${totalVarianceNaira.toFixed(2)}`,
          new_state: { transfers_paused: true, variance: totalVarianceNaira },
        }]);
      } catch {}

      return {
        healthy: false,
        varianceNaira: totalVarianceNaira,
        circuitBreakerTripped: true,
        message: `Financial discrepancy detected (₦${totalVarianceNaira.toFixed(2)}). Circuit breaker automatically tripped.`,
      };
    }

    return {
      healthy: true,
      varianceNaira: 0,
      circuitBreakerTripped: false,
      message: "Ledger and in-flight deltas are 100% healthy and balanced.",
    };
  } catch (err: any) {
    console.error("❌ DiscrepancyAuditor: Automated audit check error:", err?.message || err);
    return {
      healthy: false,
      varianceNaira: 0,
      circuitBreakerTripped: false,
      message: err?.message || "Internal auditor error",
    };
  }
}

/**
 * Targeted Account Security Freeze
 * Isolates a suspicious account (e.g. race condition attempts, velocity attacks)
 * without shutting down the entire platform for legitimate users.
 */
export async function freezeUserAccount(
  email: string,
  reason: string,
  durationHours = 24
): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return { success: false, message: "Email required" };

  try {
    const suspendedUntil = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

    // 1. Fast Redis lock key (sub-millisecond gateway rejection)
    if (isRedisReady()) {
      await redisConnection.set(`user:frozen:${cleanEmail}`, "true", "EX", durationHours * 3600);
    }

    // 2. Update database suspended_until timestamp
    await supabaseAdmin
      .from("users")
      .update({ suspended_until: suspendedUntil })
      .ilike("email", cleanEmail);

    // 3. Invalidate user profile cache & revoke sessions
    await invalidateCachedProfile(cleanEmail);

    // 4. Record audit log
    await supabaseAdmin.from("admin_audit_logs").insert([{
      admin_email: "SYSTEM_SECURITY_MONITOR",
      action: "auto_freeze_account",
      target_id: cleanEmail,
      target_type: "user",
      reason: `Automated Security Hold (${durationHours}h): ${reason}`,
      new_state: { suspended_until: suspendedUntil },
    }]);

    // 5. Notify user
    await supabaseAdmin.from("notifications").insert([{
      user_email: cleanEmail,
      title: "Security Hold Applied",
      message: `Your account has been temporarily placed on a security hold for ${durationHours} hours. Reason: ${reason}. Contact support if this is unexpected.`,
    }]);

    console.log(`🔒 Targeted Security Freeze applied to: ${cleanEmail} for ${durationHours}h (${reason})`);
    return { success: true, message: `Account ${cleanEmail} placed on ${durationHours}h security hold.` };
  } catch (err: any) {
    console.error(`❌ DiscrepancyAuditor: Failed to freeze account ${cleanEmail}:`, err?.message || err);
    return { success: false, message: err?.message || "Failed to freeze account" };
  }
}

/**
 * Check if a specific user account is on security hold
 */
export async function isUserAccountFrozen(email: string): Promise<{ frozen: boolean; reason?: string }> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return { frozen: false };

  // Fast Redis check (<1ms)
  if (isRedisReady()) {
    try {
      const isFrozen = await redisConnection.get(`user:frozen:${cleanEmail}`);
      if (isFrozen === "true" || isFrozen === "1") {
        return { frozen: true, reason: "Account is on security hold." };
      }
    } catch {}
  }

  // Fallback to DB suspended_until
  try {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("suspended_until")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (user?.suspended_until && new Date(user.suspended_until) > new Date()) {
      if (isRedisReady()) {
        await redisConnection.set(`user:frozen:${cleanEmail}`, "true", "EX", 3600);
      }
      return { frozen: true, reason: `Account suspended until ${new Date(user.suspended_until).toLocaleTimeString()}` };
    }
  } catch {}

  return { frozen: false };
}
