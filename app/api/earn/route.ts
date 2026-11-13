import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { isExemptFromBarriersAndInactivity } from "../../../lib/adminHelper";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { releaseEarnLock } from "@/lib/utils/cache";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { validateEarnSecurityAndPoh } from "../../../lib/earn/pohValidator";
import { checkVelocityAndAdCache, syncPacingAndSeenSet } from "../../../lib/earn/redisSync";
import { processEarnClaim } from "../../../lib/earn/claimProcessor";
import { processMutualClaim } from "../../../lib/earn/mutualHandler";

function logToTerminal(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(message);
  }
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, {
    limit: 60,
    windowSeconds: 60,
    identifierPrefix: "earn",
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  let emailKey = "";
  let adIdToUnlock: string | null = null;
  let atomicViews = 1;
  let atomicCap = 1;
  let maxCap = 3;

  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();
    const body = await request.json();
    const { adId, token, servedAt, type, deviceId, telemetry, bonusSeconds: bodyBonusSeconds } = body;

    if (!adId || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (type !== "earn" && type !== "mutual") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    emailKey = email.toLowerCase().trim();
    const rapidClickLockKey = `lock:click:${emailKey}:${adId}:${type}`;

    if (isRedisReady()) {
      try {
        const rapidAcquired = await redisConnection.set(rapidClickLockKey, "1", "EX", 3, "NX");
        if (!rapidAcquired) {
          return NextResponse.json({ error: "Duplicate action detected. Please wait." }, { status: 429 });
        }
      } catch {}
    }

    const userId = session?.user?.sub || email;
    const now = Date.now();

    // Validate HMAC, dwell time & PoH kinematics BEFORE burning earn_token / attention_pace
    const securityResult = await validateEarnSecurityAndPoh({
      adId,
      type,
      emailKey,
      rawEmail: email,
      userId,
      token,
      servedAt,
      telemetry,
      bonusSecondsInput: bodyBonusSeconds,
      rapidClickLockKey,
    });
    if (securityResult.errorResponse) {
      return securityResult.errorResponse;
    }

    const velocityResult = await checkVelocityAndAdCache(emailKey, adId, type, now);
    if (velocityResult.errorResponse) {
      return velocityResult.errorResponse;
    }

    if (type === "earn" && velocityResult.isPlatformPost) {
      return NextResponse.json(
        {
          success: false,
          error: "This is a platform post without an earning budget. Users cannot earn from platform posts.",
        },
        { status: 400 }
      );
    }

    let updatedBalance: number | null = null;
    let liveClicks = 0;
    let earnedRateNumber = 0;
    let attentionWorthScore: number | null | undefined;

    if (type === "earn") {
      const claimResult = await processEarnClaim({
        request,
        adId,
        emailKey,
        deviceId,
        rawCpi: velocityResult.rawCpi,
        bonusSeconds: securityResult.bonusSeconds,
        attentionSharePercent: securityResult.attentionSharePercent,
        now,
        logToTerminal,
      });
      adIdToUnlock = claimResult.adIdToUnlock;
      if (claimResult.errorResponse) {
        return claimResult.errorResponse;
      }
      earnedRateNumber = claimResult.earnedRateNumber;
      updatedBalance = claimResult.updatedBalance;
      liveClicks = claimResult.liveClicks;
      atomicViews = claimResult.atomicViews;
      atomicCap = claimResult.atomicCap;
      maxCap = claimResult.maxCap ?? claimResult.atomicCap;
      attentionWorthScore = claimResult.attentionWorthScore;
    } else {
      const mutualResult = await processMutualClaim({ adId, emailKey, deviceId });
      if (mutualResult.errorResponse) {
        return mutualResult.errorResponse;
      }
      updatedBalance = mutualResult.updatedBalance;
      liveClicks = mutualResult.liveClicks;
      attentionWorthScore = mutualResult.attentionWorthScore;
    }

    await syncPacingAndSeenSet(emailKey, adId, atomicViews, atomicCap, maxCap);

    const isExemptFinal = isExemptFromBarriersAndInactivity(emailKey);
    const finalTier = computeAtwTierDetails(liveClicks, undefined, isExemptFinal, attentionWorthScore);

    return NextResponse.json({
      success: true,
      result: earnedRateNumber,
      amount: earnedRateNumber,
      balance: updatedBalance,
      clicks: liveClicks,
      atwTier: finalTier.tierCode,
      holdingCap: finalTier.isUnlimited ? null : finalTier.holdingCap,
      views: atomicViews,
      cap: atomicCap,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/earn:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  } finally {
    if (emailKey && adIdToUnlock) {
      await releaseEarnLock(emailKey, adIdToUnlock).catch(() => {});
    }
  }
}
