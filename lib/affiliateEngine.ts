import supabaseAdmin from "./utils/dbAdmin";
import redisConnection, { isRedisReady } from "./redis";
import { PRECONFIGURED_SPECIAL_ROLES } from "./adminHelper";

const AFFILIATE_BUFFER_KEY = "xea:affiliate:yield:buffer:v1";
const AFFILIATE_FLUSH_LOCK_KEY = "xea:affiliate:yield:flush_lock:v1";
const AFFILIATE_ROSTER_REDIS_KEY = "paayh:affiliates:roster:v1";
const AFFILIATE_TOTAL_POOL_SHARE = 0.20; // 20% of raw CPI shared evenly across ALL active affiliates (company keeps 30% untouched)

let l1AffiliateRoster: { emails: string[]; expiresAt: number } | null = null;

// Atomic Redis Lua script: snapshot all pending affiliate balances and clear the hash in one atomic step
// so concurrent flushes never double-credit or drop in-flight yields.
const ATOMIC_DRAIN_AFFILIATE_BUFFER_LUA = `
local vals = redis.call("HGETALL", KEYS[1])
if #vals > 0 then
  redis.call("DEL", KEYS[1])
end
return vals
`;

/**
 * Computes each active affiliate's equal share from the fixed 20% affiliate pool.
 * Examples: 2 affiliates -> 10% each; 3 affiliates -> 6.67% each; 4 affiliates -> 5% each.
 * Company's 30% platform share always remains untouched (50% earner + 20% affiliates + 30% company = 100%).
 */
export function calculateSharedAffiliateCut(rawCpi: number, affiliateCount: number): number {
  const safeCpi = Number(rawCpi);
  const safeCount = Math.floor(Number(affiliateCount));
  if (!Number.isFinite(safeCpi) || safeCpi <= 0 || !Number.isFinite(safeCount) || safeCount <= 0) {
    return 0;
  }
  return Math.round(((safeCpi * AFFILIATE_TOTAL_POOL_SHARE) / safeCount) * 100) / 100;
}

export function invalidateAffiliateRosterCache(): void {
  l1AffiliateRoster = null;
  if (isRedisReady()) {
    redisConnection.del(AFFILIATE_ROSTER_REDIS_KEY).catch(() => {});
  }
}

async function resolveActiveAffiliateEmails(): Promise<string[]> {
  const now = Date.now();
  if (l1AffiliateRoster && now < l1AffiliateRoster.expiresAt) {
    return l1AffiliateRoster.emails;
  }

  if (isRedisReady()) {
    try {
      const cached = await redisConnection.get(AFFILIATE_ROSTER_REDIS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          l1AffiliateRoster = { emails: parsed, expiresAt: now + 60_000 };
          return parsed;
        }
      }
    } catch {}
  }

  const affiliateEmails = new Set<string>(
    Object.entries(PRECONFIGURED_SPECIAL_ROLES)
      .filter(([, cfg]) => cfg.isAffiliate)
      .map(([email]) => email.toLowerCase().trim())
  );

  let loadedFromRosterTable = false;
  try {
    // O(1) tiny roster table (never scans 500M rows in public.users)
    const { data: rosterRows, error: rosterErr } = await supabaseAdmin
      .from("platform_affiliates")
      .select("email")
      .eq("is_active", true)
      .limit(100);

    if (!rosterErr && Array.isArray(rosterRows)) {
      loadedFromRosterTable = true;
      for (const r of rosterRows) {
        if (r?.email) affiliateEmails.add(String(r.email).trim().toLowerCase());
      }
    }
  } catch {}

  if (!loadedFromRosterTable) {
    try {
      const { data: dbAffiliates } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("is_affiliate", true)
        .limit(100);

      if (Array.isArray(dbAffiliates)) {
        for (const r of dbAffiliates) {
          if (r?.email) affiliateEmails.add(String(r.email).trim().toLowerCase());
        }
      }
    } catch {
      // Preconfigured emails are still guaranteed
    }
  }

  const list = Array.from(affiliateEmails);
  l1AffiliateRoster = { emails: list, expiresAt: now + 60_000 };
  if (isRedisReady() && list.length > 0) {
    redisConnection
      .set(AFFILIATE_ROSTER_REDIS_KEY, JSON.stringify(list), "EX", 300)
      .catch(() => {});
  }
  return list;
}

/**
 * Ensures the preconfigured Career + Affiliate accounts (nonsom019@gmail.com, nonsom2023@gmail.com)
 * have their DB flags set, and flushes any pending shard/Redis affiliate yield into their live balance.
 */
export async function flushPendingAffiliateYield(targetEmail?: string | null): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    // 1. Atomically drain Redis-buffered affiliate yields into Postgres (zero double-credit race)
    if (isRedisReady()) {
      try {
        let entries: Array<[string, number]> = [];
        if (typeof (redisConnection as any).eval === "function") {
          const rawPairs = (await (redisConnection as any).eval(
            ATOMIC_DRAIN_AFFILIATE_BUFFER_LUA,
            1,
            AFFILIATE_BUFFER_KEY
          )) as string[] | null;
          if (Array.isArray(rawPairs)) {
            for (let i = 0; i < rawPairs.length; i += 2) {
              const em = String(rawPairs[i] || "").trim().toLowerCase();
              const delta = Math.round((Number(rawPairs[i + 1]) || 0) * 100) / 100;
              if (em && delta > 0) entries.push([em, delta]);
            }
          }
        } else {
          const buffered = await redisConnection.hgetall(AFFILIATE_BUFFER_KEY);
          if (buffered && Object.keys(buffered).length > 0) {
            await redisConnection.del(AFFILIATE_BUFFER_KEY);
            for (const [emailKey, rawVal] of Object.entries(buffered)) {
              const cleanEmail = emailKey.trim().toLowerCase();
              const delta = Math.round((Number(rawVal) || 0) * 100) / 100;
              if (cleanEmail && delta > 0) entries.push([cleanEmail, delta]);
            }
          }
        }

        for (const [cleanEmail, delta] of entries) {
          await creditSingleAffiliateDirect(cleanEmail, delta);
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
 * Credits a fixed 20% total pool of `rawCpi` shared evenly across ALL active Affiliate accounts
 * (`20% / N`: e.g., 2 affiliates = 10% each, 3 = 6.67% each, 4 = 5% each), keeping the company's
 * 30% platform share completely untouched (50% earner + 20% affiliates + 30% company = 100%).
 * Designed for 500M+ scale:
 *  - Primary: Lock-free SQL RPC `credit_affiliate_platform_share_atomic` reading tiny `platform_affiliates` table.
 *  - Fallback: Cached roster + Redis HINCRBYFLOAT coalesced write-behind buffer with atomic Lua drain.
 */
export async function creditAffiliatePlatformShare(rawCpi: number, adId?: string | null, earnerEmail?: string | null): Promise<void> {
  if (!supabaseAdmin) return;
  const safeCpi = Number(rawCpi) > 0 ? Number(rawCpi) : 25.0;
  if (safeCpi <= 0) return;

  // 1. Primary: Atomic Lock-Free PostgreSQL RPC (reads tiny platform_affiliates roster, divides 20% / N)
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

  // 2. Resolve cached active affiliate roster (O(1) L1/L2 cached; zero scan on public.users)
  const affiliateEmails = await resolveActiveAffiliateEmails();
  if (affiliateEmails.length === 0) return;

  const perAffiliateCut = calculateSharedAffiliateCut(safeCpi, affiliateEmails.length);
  if (perAffiliateCut <= 0) return;

  // 3. High-Concurrency Coalescing via Redis + Atomic Periodic Flush
  if (isRedisReady()) {
    try {
      const pipe = redisConnection.pipeline();
      for (const email of affiliateEmails) {
        pipe.hincrbyfloat(AFFILIATE_BUFFER_KEY, email, perAffiliateCut);
      }
      await pipe.exec();

      // Acquire short 2-second coalescing lock so under 500M+ traffic spikes we flush at most once per 2s,
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
    affiliateEmails.map((email) => creditSingleAffiliateDirect(email, perAffiliateCut))
  );
}
