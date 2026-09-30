/**
 * Cloudflare Turnstile Verification Engine (Tier-2 Adaptive Human Proof).
 * 
 * Invoked on:
 * 1. User authentication/login
 * 2. High-risk ad claims where local kinematics detected synthetic signatures
 * 
 * Uses Cloudflare's official verification endpoint:
 * https://challenges.cloudflare.com/turnstile/v0/siteverify
 */

export interface TurnstileVerificationResult {
  success: boolean;
  score?: number;
  errorCodes?: string[];
  challengeTs?: string;
  hostname?: string;
}

// Cloudflare official test secret keys:
// "1x0000000000000000000000000000000AA" -> Always passes
// "2x0000000000000000000000000000000AA" -> Always fails
const DEFAULT_TEST_SECRET = "1x0000000000000000000000000000000AA";

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerificationResult> {
  if (!token || typeof token !== "string") {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const secretKey =
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
    DEFAULT_TEST_SECRET;

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500); // 3.5s timeout safety

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, errorCodes: [`http-status-${response.status}`] };
    }

    const outcome = await response.json();
    return {
      success: Boolean(outcome.success),
      errorCodes: outcome["error-codes"],
      challengeTs: outcome.challenge_ts,
      hostname: outcome.hostname,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn("⚠️ Turnstile verification timeout (3.5s limit reached)");
      // In case of network timeout to Cloudflare, fail safe or log warning
      return { success: false, errorCodes: ["timeout"] };
    }
    console.warn("⚠️ Turnstile verification fetch exception:", err?.message || err);
    return { success: false, errorCodes: ["network-error"] };
  }
}
