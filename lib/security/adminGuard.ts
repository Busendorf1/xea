import { NextRequest } from "next/server";
import redisConnection, { isRedisReady } from "../redis";
import supabaseAdmin from "../utils/dbAdmin";

// Security Thresholds to Contain Compromised Admin Blast Radius
export const DUAL_APPROVAL_THRESHOLD_NAIRA = 50000;      // > ₦50k requires 2nd admin approval
export const MAX_ADMIN_DAILY_VELOCITY_NAIRA = 200000;    // Max ₦200k adjustments/day per admin
export const MAX_ADMIN_HOURLY_ACTIONS = 8;               // Max 8 mutation actions/hour per admin

const FINANCIAL_AUDIT_ACTIONS = [
  "adjust_user_balance",
  "dual_approved_balance_adjustment",
  "initiate_dual_auth_balance_adjustment",
  "reverse_transfer",
  "initiate_dual_auth_transfer_reversal",
];

// Atomic Lua check-and-increment prevents parallel burst bypasses against velocity caps
const ATOMIC_VELOCITY_LUA = `
local dailyKey = KEYS[1]
local hourKey = KEYS[2]
local amt = tonumber(ARGV[1])
local maxDaily = tonumber(ARGV[2])
local maxHourly = tonumber(ARGV[3])

local curDaily = tonumber(redis.call('GET', dailyKey) or '0')
local curHourly = tonumber(redis.call('GET', hourKey) or '0')

if curHourly >= maxHourly then
  return {0, 'HOURLY_LIMIT', tostring(curDaily), tostring(curHourly)}
end

if amt > 0 and (curDaily + amt) > maxDaily then
  return {0, 'DAILY_LIMIT', tostring(curDaily), tostring(curHourly)}
end

local nextDaily = curDaily
if amt > 0 then
  nextDaily = tonumber(redis.call('INCRBYFLOAT', dailyKey, amt))
  redis.call('EXPIRE', dailyKey, 86400)
end

local nextHourly = redis.call('INCR', hourKey)
redis.call('EXPIRE', hourKey, 3600)

return {1, 'OK', tostring(nextDaily), tostring(nextHourly)}
`;

export interface AdminVelocityResult {
  allowed: boolean;
  reason?: string;
  currentDailyTotal?: number;
}

async function checkAdminVelocityFromDatabase(
  cleanEmail: string,
  amountNaira: number
): Promise<AdminVelocityResult> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentLogs, error } = await supabaseAdmin
      .from("admin_audit_logs")
      .select("action, created_at, previous_state, new_state")
      .eq("admin_email", cleanEmail)
      .in("action", FINANCIAL_AUDIT_ACTIONS)
      .gte("created_at", oneDayAgo)
      .limit(200);

    if (error) {
      return {
        allowed: false,
        reason: "Unable to verify admin velocity limits (security control unavailable). Retry shortly.",
      };
    }

    const rows = recentLogs || [];
    const hourlyCount = rows.filter((r: any) => r.created_at && r.created_at >= oneHourAgo).length;
    if (hourlyCount >= MAX_ADMIN_HOURLY_ACTIONS) {
      return {
        allowed: false,
        reason: `Admin rate limit exceeded: Maximum ${MAX_ADMIN_HOURLY_ACTIONS} financial actions per hour reached. Contact system owner if emergency.`,
      };
    }

    const dailySum = rows.reduce((sum: number, r: any) => {
      const prevBal = Number(r.previous_state?.balance);
      const nextBal = Number(r.new_state?.balance);
      const explicitAmt = Number(r.new_state?.amountNaira ?? r.previous_state?.amount ?? 0);
      if (Number.isFinite(prevBal) && Number.isFinite(nextBal)) {
        return sum + Math.abs(nextBal - prevBal);
      }
      return sum + (Number.isFinite(explicitAmt) ? Math.abs(explicitAmt) : 0);
    }, 0);

    if (amountNaira > 0 && dailySum + amountNaira > MAX_ADMIN_DAILY_VELOCITY_NAIRA) {
      return {
        allowed: false,
        currentDailyTotal: dailySum,
        reason: `Admin daily velocity limit exceeded: Cumulative adjustments cannot exceed ₦${MAX_ADMIN_DAILY_VELOCITY_NAIRA.toLocaleString("en-NG")} per 24 hours. (Current: ₦${dailySum.toLocaleString("en-NG")}, Requested: ₦${amountNaira.toLocaleString("en-NG")}).`,
      };
    }

    return { allowed: true, currentDailyTotal: dailySum + amountNaira };
  } catch (dbErr: any) {
    console.error("❌ AdminGuard DB fallback error:", dbErr?.message || dbErr);
    return {
      allowed: false,
      reason: "Unable to verify admin velocity limits (security control unavailable). Retry shortly.",
    };
  }
}

/**
 * Enforces strict velocity and volume caps on admin operations.
 * Uses atomic Redis Lua evaluation with fail-safe PostgreSQL audit-log fallback when Redis is offline.
 */
export async function checkAdminVelocityLimit(
  adminEmail: string,
  amountNaira = 0
): Promise<AdminVelocityResult> {
  const cleanEmail = adminEmail.toLowerCase().trim();
  const safeAmount = Number.isFinite(amountNaira) && amountNaira > 0 ? amountNaira : 0;

  if (!isRedisReady()) {
    return await checkAdminVelocityFromDatabase(cleanEmail, safeAmount);
  }

  const todayKey = `admin:velocity:daily:${cleanEmail}:${new Date().toISOString().slice(0, 10)}`;
  const hourKey = `admin:velocity:hourly:${cleanEmail}:${new Date().toISOString().slice(0, 13)}`;

  try {
    const evalRes = (await redisConnection.eval(
      ATOMIC_VELOCITY_LUA,
      2,
      todayKey,
      hourKey,
      String(safeAmount),
      String(MAX_ADMIN_DAILY_VELOCITY_NAIRA),
      String(MAX_ADMIN_HOURLY_ACTIONS)
    )) as [number, string, string, string];

    const allowedFlag = Number(evalRes?.[0] || 0);
    const code = String(evalRes?.[1] || "");
    const dailyTotal = parseFloat(String(evalRes?.[2] || "0")) || 0;

    if (allowedFlag !== 1) {
      if (code === "HOURLY_LIMIT") {
        return {
          allowed: false,
          currentDailyTotal: dailyTotal,
          reason: `Admin rate limit exceeded: Maximum ${MAX_ADMIN_HOURLY_ACTIONS} financial actions per hour reached. Contact system owner if emergency.`,
        };
      }
      return {
        allowed: false,
        currentDailyTotal: dailyTotal,
        reason: `Admin daily velocity limit exceeded: Cumulative adjustments cannot exceed ₦${MAX_ADMIN_DAILY_VELOCITY_NAIRA.toLocaleString("en-NG")} per 24 hours. (Current: ₦${dailyTotal.toLocaleString("en-NG")}, Requested: ₦${safeAmount.toLocaleString("en-NG")}).`,
      };
    }

    return { allowed: true, currentDailyTotal: dailyTotal };
  } catch (err: any) {
    console.warn("⚠️ AdminGuard Redis Lua warning, falling back to DB velocity check:", err?.message || err);
    return await checkAdminVelocityFromDatabase(cleanEmail, safeAmount);
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
