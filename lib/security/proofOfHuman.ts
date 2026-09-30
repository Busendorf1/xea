import crypto from "crypto";
import { KinematicVector } from "./kinematicsEvaluator";

/**
 * Proof of Human Cryptographic Attestation Engine.
 * 
 * Seals physical motor telemetry vectors into an unforgeable HMAC-SHA256 signature,
 * binding the client's physical interaction directly to the server-issued ad impression token.
 */

export interface InteractionProofPayload {
  adId: string;
  email: string;
  servedAt: number | string;
  completedAt: number | string;
  telemetryDigest: string;
}

/**
 * Computes a deterministic SHA-256 digest of kinematic coordinate vectors.
 */
export function computeTelemetryDigest(vectors: KinematicVector[]): string {
  if (!vectors || vectors.length === 0) return "empty_telemetry";
  // Compact representation: "x,y,t|x,y,t|..."
  const rawString = vectors
    .map((v) => `${Math.round(v.x * 10) / 10},${Math.round(v.y * 10) / 10},${Math.round(v.t)}`)
    .join("|");
  return crypto.createHash("sha256").update(rawString).digest("hex");
}

/**
 * Generates an HMAC-SHA256 interaction proof token.
 */
export function generateInteractionProof(
  payload: InteractionProofPayload,
  secretKey: string
): string {
  const emailNorm = (payload.email || "").toLowerCase().trim();
  const canonicalString = `${payload.adId}:${emailNorm}:${payload.servedAt}:${payload.completedAt}:${payload.telemetryDigest}`;
  return crypto.createHmac("sha256", secretKey).update(canonicalString).digest("hex");
}

/**
 * Verifies that the provided interaction proof token matches the canonical telemetry.
 */
export function verifyInteractionProof(
  payload: InteractionProofPayload,
  proofToken: string,
  secretKey: string
): boolean {
  if (!proofToken || typeof proofToken !== "string") return false;
  const expected = generateInteractionProof(payload, secretKey);
  try {
    return crypto.timingSafeEqual(Buffer.from(proofToken, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return proofToken === expected;
  }
}
