import crypto from "crypto";
import { NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { env } from "@/lib/env";
import { getEarnTokenSecret, verifyHmacSignature } from "../targetingEngine";
import { getCachedProfile, setCachedProfile } from "@/lib/utils/cache";

export interface EarnSecurityCheckInput {
  adId: string;
  type: "earn" | "mutual";
  emailKey: string;
  rawEmail: string;
  userId?: string;
  resolveLegacyUserId?: () => Promise<string | null>;
  token?: unknown;
  servedAt?: unknown;
  viewToken?: unknown;
  viewStartedAt?: unknown;
  telemetry?: unknown;
  bonusSecondsInput?: unknown;
  rapidClickLockKey?: string;
}

export interface EarnSecurityCheckResult {
  errorResponse?: NextResponse;
  verifiedViewDurationMs: number;
  bonusSeconds: number;
  attentionSharePercent: number;
}

/**
 * Validates HMAC earn tokens, dwell duration, Proof-of-Human kinematics,
 * telemetry replay protection, and pacing locks.
 *
 * Critically evaluates PoH kinematics and telemetry replay BEFORE burning
 * `used:earn_token` or acquiring `lock:attention_pace`, so legitimate
 * `POH_RETRY` attempts can succeed without hitting a self-inflicted replay
 * or pacing lockout.
 */
export async function validateEarnSecurityAndPoh(
  input: EarnSecurityCheckInput
): Promise<EarnSecurityCheckResult> {
  const {
    adId,
    type,
    emailKey,
    rawEmail,
    userId,
    resolveLegacyUserId,
    token,
    servedAt,
    viewToken,
    viewStartedAt,
    telemetry,
    bonusSecondsInput,
    rapidClickLockKey,
  } = input;

  const secretKey = getEarnTokenSecret();
  const fallbackAuth0Key = env.AUTH0_SECRET || process.env.AUTH0_SECRET || "";
  if (!secretKey) {
    console.error("❌ CRITICAL: Earn token secret is not configured in production for /api/earn.");
    return {
      errorResponse: NextResponse.json({ error: "Server configuration error" }, { status: 500 }),
      verifiedViewDurationMs: 0,
      bonusSeconds: 0,
      attentionSharePercent: 0.3,
    };
  }

  const now = Date.now();
  let verifiedViewDurationMs = 0;

  // 1. Cryptographic HMAC token & dwell verification (MANDATORY for BOTH "earn" and "mutual" — C-16)
  if (!token || !servedAt) {
    return {
      errorResponse: NextResponse.json(
        { error: "Verification token and timestamp required to claim reward." },
        { status: 403 }
      ),
      verifiedViewDurationMs: 0,
      bonusSeconds: 0,
      attentionSharePercent: 0.3,
    };
  }

  {
    let resolvedLegacyUserId: string | undefined = userId;
    const getLegacyUserId = async (): Promise<string | undefined> => {
      if (resolvedLegacyUserId !== undefined) return resolvedLegacyUserId;
      if (!resolveLegacyUserId) return undefined;
      try {
        resolvedLegacyUserId = (await resolveLegacyUserId()) || undefined;
      } catch {
        resolvedLegacyUserId = undefined;
      }
      return resolvedLegacyUserId;
    };

    const primaryPayloads = [
      `${adId}:${emailKey}:${servedAt}`,
      `${adId}:${rawEmail.trim()}:${servedAt}`,
    ];
    if (resolvedLegacyUserId && resolvedLegacyUserId !== emailKey && resolvedLegacyUserId !== rawEmail.trim()) {
      primaryPayloads.unshift(`${adId}:${resolvedLegacyUserId}:${servedAt}`);
    }
    const candidateKeys = Array.from(new Set([secretKey, fallbackAuth0Key].filter(Boolean)));
    let isValidToken = verifyHmacSignature(primaryPayloads, String(token), candidateKeys);

    if (!isValidToken && resolvedLegacyUserId === undefined && resolveLegacyUserId) {
      const legacyId = await getLegacyUserId();
      if (legacyId && legacyId !== emailKey && legacyId !== rawEmail.trim()) {
        isValidToken = verifyHmacSignature([`${adId}:${legacyId}:${servedAt}`], String(token), candidateKeys);
      }
    }

    if (!isValidToken) {
      console.warn("🚨 Potential ad fraud: HMAC Token mismatch in /api/earn for user:", emailKey, "Ad:", adId);
      return {
        errorResponse: NextResponse.json(
          { error: "Cryptographic token verification failed. Reward rejected." },
          { status: 403 }
        ),
        verifiedViewDurationMs: 0,
        bonusSeconds: 0,
        attentionSharePercent: 0.3,
      };
    }

    const parsedServedAt = parseInt(String(servedAt), 10);
    const batchDuration = now - parsedServedAt;
    if (isNaN(parsedServedAt) || parsedServedAt > now + 60000 || batchDuration > 1800000) {
      return {
        errorResponse: NextResponse.json(
          { error: "Ad session expired (Max 30m). Please refresh feed." },
          { status: 400 }
        ),
        verifiedViewDurationMs: 0,
        bonusSeconds: 0,
        attentionSharePercent: 0.3,
      };
    }

    if (type === "earn") {
      // Strictly require a per-card viewport-entry HMAC token so batch wait time cannot unlock subsequent ads
      if (!viewToken || viewStartedAt === undefined || viewStartedAt === null) {
        return {
          errorResponse: NextResponse.json(
            {
              error: "Per-card view verification required. Please view the ad completely before claiming.",
              code: "VIEW_START_REQUIRED",
            },
            { status: 403 }
          ),
          verifiedViewDurationMs: 0,
          bonusSeconds: 0,
          attentionSharePercent: 0.3,
        };
      }

      const viewPayloads = [
        `view:${adId}:${emailKey}:${viewStartedAt}:${servedAt}`,
        `view:${adId}:${rawEmail.trim()}:${viewStartedAt}:${servedAt}`,
      ];
      if (resolvedLegacyUserId && resolvedLegacyUserId !== emailKey && resolvedLegacyUserId !== rawEmail.trim()) {
        viewPayloads.splice(1, 0, `view:${adId}:${resolvedLegacyUserId}:${viewStartedAt}:${servedAt}`);
      }
      let isValidViewToken = verifyHmacSignature(viewPayloads, String(viewToken), candidateKeys);
      if (!isValidViewToken && resolvedLegacyUserId === undefined && resolveLegacyUserId) {
        const legacyId = await getLegacyUserId();
        if (legacyId && legacyId !== emailKey && legacyId !== rawEmail.trim()) {
          isValidViewToken = verifyHmacSignature(
            [`view:${adId}:${legacyId}:${viewStartedAt}:${servedAt}`],
            String(viewToken),
            candidateKeys
          );
        }
      }
      if (!isValidViewToken) {
        console.warn("🚨 Invalid viewToken HMAC in /api/earn for user:", emailKey, "Ad:", adId);
        return {
          errorResponse: NextResponse.json(
            { error: "Per-card cryptographic view verification failed. Reward rejected." },
            { status: 403 }
          ),
          verifiedViewDurationMs: 0,
          bonusSeconds: 0,
          attentionSharePercent: 0.3,
        };
      }

      const parsedViewStartedAt = Number.parseInt(String(viewStartedAt), 10);
      if (
        !Number.isFinite(parsedViewStartedAt) ||
        parsedViewStartedAt > now + 15000 ||
        parsedViewStartedAt < parsedServedAt - 15000
      ) {
        return {
          errorResponse: NextResponse.json(
            { error: "Invalid card view timestamp. Please refresh feed." },
            { status: 400 }
          ),
          verifiedViewDurationMs: 0,
          bonusSeconds: 0,
          attentionSharePercent: 0.3,
        };
      }

      if (now - parsedViewStartedAt > 1800000) {
        return {
          errorResponse: NextResponse.json(
            { error: "Ad view session expired (Max 30m). Please refresh feed." },
            { status: 400 }
          ),
          verifiedViewDurationMs: 0,
          bonusSeconds: 0,
          attentionSharePercent: 0.3,
        };
      }

      // Anchor sequential attention clock against previous successful earn claim (if any)
      let lastEarnAtMs = 0;
      if (isRedisReady()) {
        try {
          const lastEarnRaw = await redisConnection.get(`user:last_earn_at:${emailKey}`);
          const parsedLastEarn = lastEarnRaw ? Number.parseInt(lastEarnRaw, 10) : NaN;
          if (Number.isFinite(parsedLastEarn) && parsedLastEarn > 0 && parsedLastEarn <= now) {
            lastEarnAtMs = parsedLastEarn;
          }
        } catch {}
      }

      const effectiveStartMs = Math.max(parsedViewStartedAt, lastEarnAtMs);
      verifiedViewDurationMs = Math.max(0, now - effectiveStartMs);

      if (verifiedViewDurationMs < 14000) {
        return {
          errorResponse: NextResponse.json(
            { error: "Minimum attention duration not met. Please view the ad completely before claiming." },
            { status: 400 }
          ),
          verifiedViewDurationMs,
          bonusSeconds: 0,
          attentionSharePercent: 0.3,
        };
      }
    } else {
      // Mutual requires minimum dwell + unified feed token burn & pacing lock (C-16)
      verifiedViewDurationMs = isNaN(batchDuration) ? 0 : batchDuration;
      if (verifiedViewDurationMs < 14000) {
        return {
          errorResponse: NextResponse.json(
            { error: "Minimum attention duration not met. Please view the ad completely before claiming." },
            { status: 400 }
          ),
          verifiedViewDurationMs,
          bonusSeconds: 0,
          attentionSharePercent: 0.3,
        };
      }
      if (isRedisReady()) {
        const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
        const unifiedTokenKey = `used:feed_token:${tokenHash}`;
        const progressBurnKey = `used:feed_progress:${tokenHash}`;
        const mutualPaceKey = `lock:attention_pace:${emailKey}`;
        const paceAcquired = await redisConnection.set(mutualPaceKey, "1", "EX", 10, "NX").catch(() => null);
        if (!paceAcquired) {
          return {
            errorResponse: NextResponse.json(
              { error: "Please view one ad at a time before claiming the next action." },
              { status: 429 }
            ),
            verifiedViewDurationMs,
            bonusSeconds: 0,
            attentionSharePercent: 0.3,
          };
        }
        const tokenFresh = await redisConnection.set(unifiedTokenKey, "1", "EX", 2100, "NX").catch(() => null);
        if (!tokenFresh) {
          return {
            errorResponse: NextResponse.json(
              { error: "This verification token has already been used.", code: "ALREADY_EARNED" },
              { status: 403 }
            ),
            verifiedViewDurationMs,
            bonusSeconds: 0,
            attentionSharePercent: 0.3,
          };
        }
        await redisConnection.set(progressBurnKey, "1", "EX", 2100, "NX").catch(() => {});
      }
    }
  }

  // 2. Earn-specific PoH kinematics BEFORE burning unified feed_token / attention_pace (C-16)
  if (type === "earn") {
    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
    const tokenBurnKey = `used:feed_token:${tokenHash}`;
    const legacyBurnKey = `used:earn_token:${tokenHash}`;
    const progressBurnKey = `used:feed_progress:${tokenHash}`;
    const globalPaceKey = `lock:attention_pace:${emailKey}`;

    // Fast read-only check so an already-burned token cannot be used for retries
    if (isRedisReady()) {
      try {
        const [alreadyBurned, alreadyBurnedLegacy] = await Promise.all([
          redisConnection.exists(tokenBurnKey),
          redisConnection.exists(legacyBurnKey),
        ]);
        if (alreadyBurned || alreadyBurnedLegacy) {
          return {
            errorResponse: NextResponse.json(
              { error: "This verification token has already been used.", code: "ALREADY_EARNED" },
              { status: 403 }
            ),
            verifiedViewDurationMs,
            bonusSeconds: 0,
            attentionSharePercent: 0.3,
          };
        }
      } catch {}
    }

    // Proof of Human: Kinematic Motor Biometrics
    let isKinematicsHuman = true;
    let kinematicScore = 0;
    let kinematicReasons: string[] = [];

    if (Array.isArray(telemetry) && telemetry.length > 0) {
      const { evaluateKinematics } = await import("@/lib/security/kinematicsEvaluator");
      const evalResult = evaluateKinematics(telemetry);
      isKinematicsHuman = evalResult.isHuman;
      kinematicScore = evalResult.score;
      kinematicReasons = evalResult.reasons;
    } else {
      isKinematicsHuman = false;
      kinematicScore = 100;
      kinematicReasons = ["No physical interaction telemetry provided (bypassed UI)"];
    }

    if (!isKinematicsHuman) {
      console.warn(
        "🚨 Proof of Human retry check in /api/earn for user:",
        emailKey,
        "Ad:",
        adId,
        "Score:",
        kinematicScore,
        "Reasons:",
        kinematicReasons
      );

      let retryCount = 1;
      if (isRedisReady()) {
        try {
          const retryKey = `user:poh_retries:${emailKey}`;
          retryCount = await redisConnection.incr(retryKey);
          if (retryCount === 1) {
            await redisConnection.expire(retryKey, 120);
          }
          // Release 3s rapid-click lock so the user can retry immediately with valid PoH
          if (rapidClickLockKey) {
            await redisConnection.del(rapidClickLockKey).catch(() => {});
          }
        } catch {}
      }

      if (retryCount >= 3) {
        const cooldownUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        if (isRedisReady()) {
          try {
            const cooldownKey = `user:cooldown:${emailKey}`;
            await redisConnection.set(
              cooldownKey,
              JSON.stringify({ cooldownUntil, cooldownType: "pacing_15m" }),
              "EX",
              900
            );
            const cachedProf = await getCachedProfile<any>(emailKey);
            if (cachedProf) {
              await setCachedProfile(emailKey, {
                ...cachedProf,
                cooldown_until: cooldownUntil,
                cooldown_type: "pacing_15m",
              });
            }
          } catch {}
        }

        return {
          errorResponse: NextResponse.json(
            {
              error: "Repeated invalid interaction attempts. Account placed on temporary pacing cooldown.",
              code: "COOLDOWN_ACTIVE",
              cooldownUntil,
              cooldownType: "pacing_15m",
            },
            { status: 403 }
          ),
          verifiedViewDurationMs,
          bonusSeconds: 0,
          attentionSharePercent: 0.3,
        };
      }

      return {
        errorResponse: NextResponse.json(
          {
            error: "Verification incomplete. Please retry the challenge or listen again.",
            code: "POH_RETRY",
            retryable: true,
            reasons: kinematicReasons,
          },
          { status: 400 }
        ),
        verifiedViewDurationMs,
        bonusSeconds: 0,
        attentionSharePercent: 0.3,
      };
    }

    // Clear retry counter on verified human interaction
    if (isRedisReady()) {
      try {
        await redisConnection.del(`user:poh_retries:${emailKey}`);
      } catch {}

      // Telemetry Replay Fingerprint Check (also before burning token/pace)
      if (Array.isArray(telemetry) && telemetry.length > 0) {
        try {
          const normalizedSig = telemetry
            .slice(0, 24)
            .map(
              (pt: any) =>
                `${Math.round(Number(pt.x || 0))},${Math.round(Number(pt.y || 0))},${Math.round(Number(pt.p || 0) * 100)}`
            )
            .join("|");
          const telemetryHash = crypto.createHash("sha256").update(normalizedSig).digest("hex").slice(0, 24);
          const telemetryReplayKey = `used:telemetry:${emailKey}:${telemetryHash}`;
          // 35m TTL (2100s) covers the 30m MAX_AD_SESSION_MS + 5m skew without 24h Redis bloat
          const isFreshTelemetry = await redisConnection.set(telemetryReplayKey, "1", "EX", 2100, "NX");
          if (!isFreshTelemetry) {
            console.warn("🚨 Telemetry replay attack blocked in /api/earn for user:", emailKey);
            if (rapidClickLockKey) {
              await redisConnection.del(rapidClickLockKey).catch(() => {});
            }
            return {
              errorResponse: NextResponse.json(
                { error: "Synthetic or replayed interaction detected.", code: "POH_RETRY", retryable: true },
                { status: 403 }
              ),
              verifiedViewDurationMs,
              bonusSeconds: 0,
              attentionSharePercent: 0.3,
            };
          }
        } catch {}
      }

      // Now that PoH & telemetry passed, enforce global pacing lock & burn anti-replay token
      try {
        const paceAcquired = await redisConnection.set(globalPaceKey, "1", "EX", 10, "NX");
        if (!paceAcquired) {
          return {
            errorResponse: NextResponse.json(
              { error: "Please view one ad at a time before claiming the next reward." },
              { status: 429 }
            ),
            verifiedViewDurationMs,
            bonusSeconds: 0,
            attentionSharePercent: 0.3,
          };
        }

        const tokenFresh = await redisConnection.set(tokenBurnKey, "1", "EX", 2100, "NX");
        if (!tokenFresh) {
          return {
            errorResponse: NextResponse.json(
              { error: "This verification token has already been used.", code: "ALREADY_EARNED" },
              { status: 403 }
            ),
            verifiedViewDurationMs,
            bonusSeconds: 0,
            attentionSharePercent: 0.3,
          };
        }
        await Promise.all([
          redisConnection.set(legacyBurnKey, "1", "EX", 2100, "NX").catch(() => {}),
          redisConnection.set(progressBurnKey, "1", "EX", 2100, "NX").catch(() => {}),
        ]);
      } catch {}
    }
  }

  const clientBonusSeconds =
    typeof bonusSecondsInput === "number" && Number.isFinite(bonusSecondsInput) ? bonusSecondsInput : 0;
  const serverMaxBonusSeconds = Math.max(0, Math.floor(verifiedViewDurationMs / 1000) - 16);
  const bonusSeconds = Math.max(0, Math.min(16, clientBonusSeconds, serverMaxBonusSeconds));
  const attentionSharePercent = 0.3 + (bonusSeconds / 16.0) * 0.2;

  return {
    verifiedViewDurationMs,
    bonusSeconds,
    attentionSharePercent,
  };
}
