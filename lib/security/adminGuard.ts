import { NextRequest } from "next/server";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";

// Security Thresholds to Contain Compromised Admin Blast Radius
export const DUAL_APPROVAL_THRESHOLD_NAIRA = 50000;      // > ₦50k requires 2nd admin approval
export const MAX_ADMIN_DAILY_VELOCITY_NAIRA = 200000;    // Max ₦200k adjustments/day per admin
export const MAX_ADMIN_HOURLY_ACTIONS = 8;               // Max 8 mutation actions/hour per admin

export interface AdminVelocityResult {
  allowed: boolean;
  reason?: string;
  currentDailyTotal?: number;
}

/**
 * Enforces strict velocity and volume caps on admin operations.
 * If an admin account is compromised, the attacker is blocked from draining or creating large sums.
 */
export async function checkAdminVelocityLimit(
  adminEmail: string,
  amountNaira = 0
): Promise<AdminVelocityResult> {
  const cleanEmail = adminEmail.toLowerCase().trim();
  if (!isRedisReady()) return { allowed: true };

  const todayKey = `admin:velocity:daily:${cleanEmail}:${new Date().toISOString().slice(0, 10)}`;
  const hourKey = `admin:velocity:hourly:${cleanEmail}:${new Date().toISOString().slice(0, 13)}`;

  try {
    const [dailySumRaw, hourlyCountRaw] = await Promise.all([
      redisConnection.get(todayKey),
      redisConnection.get(hourKey),
    ]);

    const dailySum = parseFloat(dailySumRaw || "0");
    const hourlyCount = parseInt(hourlyCountRaw || "0", 10);

    // 1. Check Hourly Actions Cap
    if (hourlyCount >= MAX_ADMIN_HOURLY_ACTIONS) {
      return {
        allowed: false,
        reason: `Admin rate limit exceeded: Maximum ${MAX_ADMIN_HOURLY_ACTIONS} financial actions per hour reached. Contact system owner if emergency.`,
      };
    }

    // 2. Check Daily Cumulative Financial Volume Cap
    if (amountNaira > 0 && dailySum + amountNaira > MAX_ADMIN_DAILY_VELOCITY_NAIRA) {
      return {
        allowed: false,
        currentDailyTotal: dailySum,
        reason: `Admin daily velocity limit exceeded: Cumulative adjustments cannot exceed ₦${MAX_ADMIN_DAILY_VELOCITY_NAIRA.toLocaleString("en-NG")} per 24 hours. (Current: ₦${dailySum.toLocaleString("en-NG")}, Requested: ₦${amountNaira.toLocaleString("en-NG")}).`,
      };
    }

    // Track usage
    const multi = redisConnection.multi();
    if (amountNaira > 0) {
      multi.incrbyfloat(todayKey, amountNaira);
      multi.expire(todayKey, 86400); // 24 hours
    }
    multi.incr(hourKey);
    multi.expire(hourKey, 3600); // 1 hour
    await multi.exec();

    return { allowed: true, currentDailyTotal: dailySum + amountNaira };
  } catch (err: any) {
    console.warn("⚠️ AdminGuard: Velocity check warning:", err?.message || err);
    return { allowed: true };
  }
}

/**
 * Checks if an action requires multi-party approval (Four-Eyes Principle)
 */
export function requiresDualApproval(amountNaira: number): boolean {
  return amountNaira > DUAL_APPROVAL_THRESHOLD_NAIRA;
}

/**
 * Creates a pending dual-authorization request
 */
export async function createPendingAdminRequest(params: {
  actionType: "transfer_reversal" | "balance_adjustment" | "unpause_circuit_breaker";
  requestedBy: string;
  targetIdentifier: string;
  amountNaira?: number;
  payload?: Record<string, any>;
  reason: string;
}): Promise<{ id: string }> {
  const { actionType, requestedBy, targetIdentifier, amountNaira = 0, payload = {}, reason } = params;

  const { data, error } = await supabaseAdmin
    .from("pending_admin_requests")
    .insert([{
      action_type: actionType,
      requested_by: requestedBy.toLowerCase().trim(),
      target_identifier: targetIdentifier,
      amount_naira: amountNaira,
      payload,
      reason,
      status: "PENDING",
    }])
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create dual-authorization request");
  }

  // Record in audit logs that a dual-authorization request was initiated
  await recordAdminAuditTrail({
    adminEmail: requestedBy,
    action: `initiate_dual_auth_${actionType}`,
    targetId: data.id,
    targetType: "pending_admin_request",
    reason: `Threshold > ₦${DUAL_APPROVAL_THRESHOLD_NAIRA}: ${reason}`,
    newState: { requestId: data.id, amountNaira, targetIdentifier },
  });

  return { id: data.id };
}

/**
 * Immutable Audit Logging Helper
 */
export async function recordAdminAuditTrail(params: {
  adminEmail: string;
  action: string;
  targetId?: string;
  targetType?: string;
  reason: string;
  previousState?: any;
  newState?: any;
  req?: NextRequest;
}): Promise<void> {
  const { adminEmail, action, targetId, targetType, reason, previousState, newState, req } = params;

  let ip = "unknown";
  let userAgent = "unknown";

  if (req) {
    ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
         req.headers.get("cf-connecting-ip") || 
         req.headers.get("x-real-ip") || "unknown";
    userAgent = req.headers.get("user-agent") || "unknown";
  }

  try {
    await supabaseAdmin.from("admin_audit_logs").insert([{
      admin_email: adminEmail.toLowerCase().trim(),
      action,
      target_id: targetId || null,
      target_type: targetType || null,
      reason: reason || "Administrative action",
      previous_state: previousState || null,
      new_state: {
        ...(newState || {}),
        _security_context: { ip, user_agent: userAgent, timestamp: new Date().toISOString() },
      },
    }]);
  } catch (err: any) {
    console.error("❌ AdminGuard: Failed to insert audit log:", err?.message || err);
  }
}
