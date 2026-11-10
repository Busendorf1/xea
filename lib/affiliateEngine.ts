import supabaseAdmin from "./utils/dbAdmin";
import redisConnection, { isRedisReady } from "./redis";
import { PRECONFIGURED_SPECIAL_ROLES } from "./adminHelper";

const AFFILIATE_BUFFER_KEY = "xea:affiliate:yield:buffer:v1";
const AFFILIATE_FLUSH_LOCK_KEY = "xea:affiliate:yield:flush_lock:v1";

/**
 * Ensures the preconfigured Career + Affiliate accounts (nonsom019@gmail.com, nonsom2023@gmail.com)
 * have their DB flags set, and flushes any pending shard/Redis affiliate yield into their live balance.
 */
export async function flushPendingAffiliateYield(targetEmail?: string | null): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    // 1. Drain any Redis-buffered affiliate yields into Postgres
    if (isRedisReady()) {
      try {
        const buffered = await redisConnection.hgetall(AFFILIATE_BUFFER_KEY);
        if (buffered && Object.keys(buffered).length > 0) {
          for (const [emailKey, rawVal] of Object.entries(buffered)) {
            const cleanEmail = emailKey.trim().toLowerCase();
            const delta = Math.round((Number(rawVal) || 0) * 100) / 100;
            if (delta > 0) {
              await redisConnection.hdel(AFFILIATE_BUFFER_KEY, emailKey);
              await creditSingleAffiliateDirect(cleanEmail, delta);
            }
          }
        }
      } catch {
        // Non-fatal if Redis is unavailable
      }
    }

    // 2. Call Postgres RPC to flush any sharded overflow buckets if installed
    try {
      await supabaseAdmin.rpc("flush_affiliate_yield_shards_atomic", {
        p_target_email: targetEmail ? targetEmail.trim().toLowerCase() : null,
      });
    } catch {
      // Fallback if migration hasn't been applied yet
    }
  } catch (err) {
    console.warn("[AffiliateEngine] flushPendingAffiliateYield warning:", err);
  }
}

async function creditSingleAffiliateDirect(email: string, amount: number): Promise<void> {
  if (!supabaseAdmin || amount <= 0) return;
  const cleanEmail = email.trim().toLowerCase();
  const preset = PRECONFIGURED_SPECIAL_ROLES[cleanEmail];

  // 1. Try atomic database increment RPC to eliminate read-modify-write race condition at 500M+ scale
  const { data: atomicResult, error: atomicErr } = await supabaseAdmin.rpc("increment_user_balance_atomic", {
    p_email: cleanEmail,
    p_amount: amount,
    p_source: "affiliate",
    p_is_affiliate: preset ? preset.isAffiliate : false,
    p_is_career: preset ? preset.isCareer : false,
    p_affiliate_role: preset ? preset.affiliateRole : null,
  });

  if (!atomicErr && atomicResult && (atomicResult as any).success) {
    return;
  }

  const { data: row } = await supabaseAdmin
    .from("users")
    .select("id, balance, affiliate_earned_total, is_affiliate, is_career, affiliate_role")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (!row) return;

  const nextBal = Math.round(((Number(row.balance) || 0) + amount) * 100) / 100;
  const nextAffTotal = Math.round(((Number((row as any).affiliate_earned_total) || 0) + amount) * 100) / 100;

  const updatePayload: Record<string, any> = {
    balance: nextBal,
    monetized: true,
  };

  if ("affiliate_earned_total" in row) {
    updatePayload.affiliate_earned_total = nextAffTotal;
  }
  if (preset && "is_affiliate" in row) {
    updatePayload.is_affiliate = true;
    updatePayload.is_career = preset.isCareer;
    if (!(row as any).affiliate_role) {
      updatePayload.affiliate_role = preset.affiliateRole;
    }
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update(updatePayload)
    .eq("id", row.id);

  if (error) {
    // Fallback minimal update if new columns are not yet migrated
    await supabaseAdmin
      .from("users")
      .update({ balance: nextBal, monetized: true })
      .eq("id", row.id);
  }
}

/**
 * Credits 10% of rawCpi (i.e. 20% of the platform's 50% share) to each active Affiliate account.
 * Designed for 100M+ user scale:
 *  - First attempts the lock-free SQL RPC `credit_affiliate_platform_share_atomic` (uses pg_try_advisory_xact_lock + 64-shard overflow).
 *  - Falls back to Redis HINCRBYFLOAT coalesced write-behind buffer or direct non-blocking update if RPC is not yet installed.
 */
export async function creditAffiliatePlatformShare(rawCpi: number, adId?: string | null, earnerEmail?: string | null): Promise<void> {
  if (!supabaseAdmin) return;
  const safeCpi = Number(rawCpi) > 0 ? Number(rawCpi) : 25.0;
  const perAffiliateCut = Math.round(safeCpi * 0.10 * 100) / 100;
  if (perAffiliateCut <= 0) return;

  // 1. Primary: Atomic Lock-Free PostgreSQL RPC (pg_try_advisory_xact_lock + 64-shard overflow)
  try {
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
      "credit_affiliate_platform_share_atomic",
      {
        p_raw_cpi: safeCpi,
        p_ad_id: adId || null,
        p_earner_email: earnerEmail ? earnerEmail.trim().toLowerCase() : null,
      }
    );

    if (!rpcErr && rpcRes && rpcRes.success) {
      return;
    }
  } catch {
    // Proceed to Redis / Direct fallback if RPC not yet applied
  }

  // 2. Resolve all active affiliate emails (preconfigured + DB `is_affiliate = true`)
  const affiliateEmails = new Set<string>(
    Object.entries(PRECONFIGURED_SPECIAL_ROLES)
      .filter(([, cfg]) => cfg.isAffiliate)
      .map(([email]) => email.toLowerCase())
  );

  try {
    const { data: dbAffiliates } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("is_affiliate", true)
      .limit(50);

    if (Array.isArray(dbAffiliates)) {
      for (const r of dbAffiliates) {
        if (r?.email) affiliateEmails.add(String(r.email).trim().toLowerCase());
      }
    }
  } catch {
    // `is_affiliate` column might not exist before migration; preconfigured emails are still guaranteed
  }

  // 3. High-Concurrency Coalescing via Redis + Immediate Periodic Flush
  if (isRedisReady()) {
    try {
      const pipe = redisConnection.pipeline();
      for (const email of affiliateEmails) {
        pipe.hincrbyfloat(AFFILIATE_BUFFER_KEY, email, perAffiliateCut);
      }
      await pipe.exec();

      // Acquire short 2-second coalescing lock so under 100M+ traffic spikes we flush at most once per 2s,
      // while normal traffic flushes immediately on the same request!
      const shouldFlushNow = await redisConnection.set(AFFILIATE_FLUSH_LOCK_KEY, "1", "EX", 2, "NX");

      if (shouldFlushNow === "OK" || shouldFlushNow === 1) {
        await flushPendingAffiliateYield();
      }
      return;
    } catch {
      // Fall through to direct non-blocking update if Redis fails
    }
  }

  // 4. Direct Fallback
  await Promise.allSettled(
    Array.from(affiliateEmails).map((email) =>
      creditSingleAffiliateDirect(email, perAffiliateCut)
    )
  );
}
