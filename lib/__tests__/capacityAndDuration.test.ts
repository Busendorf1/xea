import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  extractMp4DurationSeconds,
  extractWebmDurationSeconds,
  extractVideoDurationSeconds,
} from "../utils/faststart";
import {
  CAPACITY_LADDER,
  assessAdDeliveryCapacity,
  quantizeDeliverableCapacity,
} from "../ads/capacityEstimator";
import {
  MAX_FREQUENCY_CAP,
  SLIDER_MAX_FREQUENCY_CAP,
  clampFrequencyCap,
  computeAudienceDailyViewSummary,
  freqCapToSliderPos,
  sliderPosToFreqCap,
} from "../ads/frequencyCap";
import {
  CLICKS_PER_ATW_STEP,
  MONETIZATION_REQUIRED_CLICKS,
  computeAtwTierDetails,
  computeRatingBonusClicks,
} from "../attentionTierEngine";

/**
 * Synthesizes a minimal ISO-BMFF MP4 buffer with [ftyp][moov -> mvhd][mdat]
 * so server duration enforcement can be tested deterministically without external videos.
 */
function buildMinimalMp4Buffer(durationSeconds: number, timescale = 1000, version: 0 | 1 = 0): Buffer {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x10,
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
    0x00, 0x00, 0x02, 0x00,
  ]);

  const mvhdPayloadSize = version === 0 ? 100 : 112;
  const mvhdSize = 8 + mvhdPayloadSize;
  const mvhd = Buffer.alloc(mvhdSize);
  mvhd.writeUInt32BE(mvhdSize, 0);
  mvhd.write("mvhd", 4, "ascii");
  mvhd.writeUInt8(version, 8);
  const rawDuration = Math.round(durationSeconds * timescale);
  if (version === 0) {
    mvhd.writeUInt32BE(timescale, 20);
    mvhd.writeUInt32BE(rawDuration, 24);
  } else {
    mvhd.writeUInt32BE(timescale, 28);
    mvhd.writeBigUInt64BE(BigInt(rawDuration), 32);
  }

  const moovSize = 8 + mvhdSize;
  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(moovSize, 0);
  moovHeader.write("moov", 4, "ascii");

  const mdat = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74]);
  return Buffer.concat([ftyp, moovHeader, mvhd, mdat]);
}

function encodeEbmlSize(size: number): Buffer {
  if (size < 0x7f) return Buffer.from([0x80 | size]);
  if (size < 0x3fff) return Buffer.from([0x40 | (size >> 8), size & 0xff]);
  throw new Error("Test helper supports sizes < 16KB");
}

function buildMinimalWebmBuffer(
  durationSeconds: number,
  timestampScaleNs = 1_000_000,
  floatBytes: 4 | 8 = 8,
  unknownSegmentSize = false
): Buffer {
  // EBML Header (0x1A45DFA3)
  const ebmlHeaderPayload = Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]); // DocType="webm"
  const ebmlHeader = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    encodeEbmlSize(ebmlHeaderPayload.length),
    ebmlHeaderPayload,
  ]);

  // TimestampScale (0x2AD7B1) as 4-byte uint
  const scaleBuf = Buffer.alloc(4);
  scaleBuf.writeUInt32BE(timestampScaleNs, 0);
  const scaleElem = Buffer.concat([
    Buffer.from([0x2a, 0xd7, 0xb1]),
    encodeEbmlSize(4),
    scaleBuf,
  ]);

  // Duration (0x4489) as float32 or float64 in TimestampScale ticks
  const ticks = (durationSeconds * 1e9) / timestampScaleNs;
  const durBuf = Buffer.alloc(floatBytes);
  if (floatBytes === 4) durBuf.writeFloatBE(ticks, 0);
  else durBuf.writeDoubleBE(ticks, 0);
  const durElem = Buffer.concat([
    Buffer.from([0x44, 0x89]),
    encodeEbmlSize(floatBytes),
    durBuf,
  ]);

  const infoPayload = Buffer.concat([scaleElem, durElem]);
  const infoElem = Buffer.concat([
    Buffer.from([0x15, 0x49, 0xa9, 0x66]),
    encodeEbmlSize(infoPayload.length),
    infoPayload,
  ]);

  // Minimal Cluster stub
  const clusterStub = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x81, 0x00]);
  const segPayload = Buffer.concat([infoElem, clusterStub]);
  const segSizeBuf = unknownSegmentSize
    ? Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    : encodeEbmlSize(segPayload.length);

  return Buffer.concat([
    ebmlHeader,
    Buffer.from([0x18, 0x53, 0x80, 0x67]),
    segSizeBuf,
    segPayload,
  ]);
}

function createCountMockSupabase(
  counts: {
    global: number;
    country?: number;
    strict?: number;
  },
  extra?: {
    activeAdRow?: Record<string, any> | null;
    approvedAdRow?: Record<string, any> | null;
  }
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "users") {
        const filters = {
          hasCountry: false,
          hasStrict: false,
        };
        const builder: any = {
          select: vi.fn(() => builder),
          or: vi.fn(() => builder),
          ilike: vi.fn((col: string) => {
            if (col === "country") filters.hasCountry = true;
            else filters.hasStrict = true;
            return builder;
          }),
          overlaps: vi.fn(() => {
            filters.hasStrict = true;
            return builder;
          }),
          maybeSingle: vi.fn(async () => ({
            data: { ad_account_status: "active", country: "Nigeria", wallet_pin_hash: "hashed" },
            error: null,
          })),
          then: (resolve: any) => {
            let count = counts.global;
            if (filters.hasStrict && counts.strict !== undefined) {
              count = counts.strict;
            } else if (filters.hasCountry && counts.country !== undefined) {
              count = counts.country;
            }
            return Promise.resolve({ count, data: null, error: null }).then(resolve);
          },
        };
        return builder;
      }
      if (table === "addsactive" && extra?.activeAdRow !== undefined) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: extra.activeAdRow, error: null })),
        };
      }
      if (table === "adds" && extra?.approvedAdRow !== undefined) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: extra.approvedAdRow, error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => ({ data: [], error: null })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        upsert: vi.fn(async () => ({ error: null })),
        insert: vi.fn(async () => ({ error: null })),
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
    }),
  };
}

describe("Monetization 500 threshold, 180s Video Enforcement, & Opaque Capacity Capping", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("enforces 500 monetization threshold and 500-click ATW step progression", () => {
    expect(CLICKS_PER_ATW_STEP).toBe(500);
    expect(MONETIZATION_REQUIRED_CLICKS).toBe(500);
    expect(computeRatingBonusClicks(0.1)).toBe(0);
    expect(computeRatingBonusClicks(0.2)).toBe(50);

    const beforeUnlock = computeAtwTierDetails(499, "ATW1", false, 0.1);
    expect(beforeUnlock.tierCode).toBe("ATW1");
    expect(beforeUnlock.clicksRemaining).toBe(1);

    const at500 = computeAtwTierDetails(500, "ATW1", false, 0.1);
    expect(at500.tierCode).toBe("ATW1");
    expect(at500.nextTierCode).toBe("ATW2");
    expect(at500.clicksRemaining).toBe(500);

    const at1000 = computeAtwTierDetails(1000, "ATW1", false, 0.1);
    expect(at1000.tierCode).toBe("ATW2");
    expect(at1000.holdingCap).toBe(60000);
  });

  it("extracts exact duration from MP4 v0 and v1 mvhd atoms", () => {
    const v0Short = buildMinimalMp4Buffer(179, 1000, 0);
    const v0Long = buildMinimalMp4Buffer(181, 600, 0);
    const v1Exact = buildMinimalMp4Buffer(180, 1000, 1);

    expect(extractMp4DurationSeconds(v0Short)).toBeCloseTo(179, 1);
    expect(extractMp4DurationSeconds(v0Long)).toBeCloseTo(181, 1);
    expect(extractMp4DurationSeconds(v1Exact)).toBeCloseTo(180, 1);
    expect(extractMp4DurationSeconds(Buffer.from("not-an-mp4"))).toBeNull();
  });

  it("POST /api/campaigns/upload-video rejects videos longer than 180 seconds with HTTP 400", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("advertiser@paayh.com"),
    }));
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/utils/faststart", async () => await import("../utils/faststart"));
    vi.doMock("@/lib/utils/cdnUrl", async () => await import("../utils/cdnUrl"));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        storage: {
          from: vi.fn(() => ({
            upload: vi.fn().mockResolvedValue({ error: null }),
            getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.paayh.com/v.mp4" } })),
          })),
        },
      },
    }));

    const { POST } = await import("../../app/api/campaigns/upload-video/route");

    const overLimitBuf = buildMinimalMp4Buffer(185, 1000, 0);
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(overLimitBuf)], "long.mp4", { type: "video/mp4" })
    );
    formData.append("bucket", "ad-media");

    const req = new NextRequest("http://localhost/api/campaigns/upload-video", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("180 seconds");
    expect(json.maxDurationSeconds).toBe(180);

    // Within 180s succeeds
    const validBuf = buildMinimalMp4Buffer(180, 1000, 0);
    const okForm = new FormData();
    okForm.append(
      "file",
      new File([new Uint8Array(validBuf)], "ok.mp4", { type: "video/mp4" })
    );
    okForm.append("bucket", "ad-media");
    const okRes = await POST(
      new NextRequest("http://localhost/api/campaigns/upload-video", {
        method: "POST",
        body: okForm,
      })
    );
    expect(okRes.status).toBe(200);
  });

  it("caps 1,000,000 impression orders on a 10,000-user platform without leaking user counts", async () => {
    const supabaseMock = createCountMockSupabase({
      global: 10_000,
      country: 4_000,
      strict: 1_500,
    });

    const assessment = await assessAdDeliveryCapacity(supabaseMock, {
      requestedImpressions: 1_000_000,
      userFrequencyCap: 5,
      campaignDays: 7,
      targetingAll: false,
      country: "Nigeria",
      interest: ["Tech"],
      advertiserEmail: "brand@shopify.com",
    });

    expect(assessment.telemetryAvailable).toBe(true);
    expect(assessment.allowed).toBe(false);
    expect(assessment.status).toBe("capped");
    expect(assessment.maxOrderableImpressions).toBeGreaterThanOrEqual(25_000);
    expect(assessment.maxOrderableImpressions).toBeLessThanOrEqual(50_000);
    expect(CAPACITY_LADDER).toContain(assessment.maxOrderableImpressions);

    // Verify no user count is ever exposed (exclude echoed requestedImpressions)
    const { requestedImpressions: _ignoredReq, ...publicFields } = assessment;
    const serialized = JSON.stringify(publicFields);
    expect(serialized).not.toContain("10000");
    expect(serialized).not.toContain("10,000");
    expect(serialized).not.toContain("4000");
    expect(serialized).not.toContain("1500");
    expect(serialized.toLowerCase()).not.toContain("user_count");
  });

  it("recognizes Rollover Broadening headroom when strict tier is smaller than requested", async () => {
    const supabaseMock = createCountMockSupabase({
      global: 10_000,
      country: 2_000,
      strict: 300,
    });

    const assessment = await assessAdDeliveryCapacity(supabaseMock, {
      requestedImpressions: 25_000,
      userFrequencyCap: 5,
      campaignDays: 7,
      targetingAll: false,
      country: "Nigeria",
      state: "Lagos",
      interest: ["Fintech"],
      advertiserEmail: "brand@amazon.com",
    });

    expect(assessment.telemetryAvailable).toBe(true);
    expect(assessment.allowed).toBe(true);
    expect(assessment.status).toBe("broadened_needed");
    expect(assessment.broadeningApplied).toBe(true);
    expect(assessment.strictTierImpressions).toBeLessThan(25_000);
    expect(assessment.maxOrderableImpressions).toBeGreaterThanOrEqual(25_000);
  });

  it("quantizeDeliverableCapacity only returns values from the coarse obfuscated ladder", () => {
    for (const raw of [0, 300, 580, 12_345, 59_500, 1_400_000]) {
      const q = quantizeDeliverableCapacity(raw, 0.85);
      expect(CAPACITY_LADDER).toContain(q);
      expect(q).toBeLessThanOrEqual(Math.floor(raw * 0.85));
    }
  });

  it("blocks over-capacity campaign submission and boosts in API routes", async () => {
    const supabaseMock = createCountMockSupabase({ global: 500, country: 200, strict: 100 });
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("amazon@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/services/cleanupService", () => ({
      cleanupExpiredApprovedCampaigns: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedUserCampaigns: vi.fn().mockResolvedValue(undefined),
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));

    const { POST: submitPost } = await import("../../app/api/campaigns/submit/route");
    const res = await submitPost(
      new NextRequest("http://localhost/api/campaigns/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adData: {
            adType: "business",
            impressions: 1_000_000,
            campaignDays: 7,
            userFrequencyCap: 5,
            costPerImpression: 45,
            totalCost: 45_000_000,
            adMediaType: "text",
            adContent: "Enterprise campaign launch",
          },
        }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.capacityCapped).toBe(true);
    expect(json.maxOrderableImpressions).toBeLessThan(1_000_000);
  });

  it("extracts WebM/EBML durations (float32/float64, unknown Segment size) and enforces <= 180s + fail-closed uploads", async () => {
    const webm120 = buildMinimalWebmBuffer(120, 1_000_000, 8, false);
    const webm185 = buildMinimalWebmBuffer(185, 500_000, 4, true);

    expect(Math.round(extractWebmDurationSeconds(webm120)!)).toBe(120);
    expect(Math.round(extractWebmDurationSeconds(webm185)!)).toBe(185);
    expect(extractVideoDurationSeconds(webm120).container).toBe("webm");

    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("creator@paayh.com"),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        storage: {
          from: () => ({
            upload: uploadMock,
            getPublicUrl: (name: string) => ({
              data: { publicUrl: `https://cdn.example.com/ad-media/${name}` },
            }),
          }),
        },
      },
    }));

    const { POST: uploadVideoPost } = await import("../../app/api/campaigns/upload-video/route");

    // 1. WebM > 180s rejected with "rejected" and "180 seconds"
    const tooLongForm = new FormData();
    tooLongForm.append(
      "file",
      new File([new Uint8Array(webm185)], "too-long.webm", { type: "video/webm" })
    );
    tooLongForm.append("bucket", "ad-media");
    const longRes = await uploadVideoPost(
      new NextRequest("http://localhost/api/campaigns/upload-video", {
        method: "POST",
        body: tooLongForm,
      })
    );
    const longJson = await longRes.json();
    expect(longRes.status).toBe(400);
    expect(longJson.error).toContain("180 seconds");
    expect(longJson.error.toLowerCase()).toContain("rejected");
    expect(uploadMock).not.toHaveBeenCalled();

    // 2. Spoofed/unparseable binary payload fails closed (rejected, no storage upload)
    const spoofedForm = new FormData();
    spoofedForm.append(
      "file",
      new File([new Uint8Array(Buffer.from("NOT_A_REAL_VIDEO_BINARY_HEADER"))], "spoof.mp4", {
        type: "video/mp4",
      })
    );
    spoofedForm.append("bucket", "ad-media");
    const spoofRes = await uploadVideoPost(
      new NextRequest("http://localhost/api/campaigns/upload-video", {
        method: "POST",
        body: spoofedForm,
      })
    );
    const spoofJson = await spoofRes.json();
    expect(spoofRes.status).toBe(400);
    expect(spoofJson.error.toLowerCase()).toContain("rejected");
    expect(spoofJson.error).toContain("180 seconds");
    expect(uploadMock).not.toHaveBeenCalled();

    // 3. Valid <= 180s WebM passes with video/webm contentType and without faststart remuxing
    const okForm = new FormData();
    okForm.append(
      "file",
      new File([new Uint8Array(webm120)], "valid.webm", { type: "video/webm" })
    );
    okForm.append("bucket", "ad-media");
    const okRes = await uploadVideoPost(
      new NextRequest("http://localhost/api/campaigns/upload-video", {
        method: "POST",
        body: okForm,
      })
    );
    const okJson = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(okJson.faststartApplied).toBe(false);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][2]?.contentType).toBe("video/webm");
  });

  it("blocks over-capacity requests with capacityCapped on /api/campaigns/boost", async () => {
    const supabaseMock = createCountMockSupabase(
      { global: 500, country: 200, strict: 100 },
      {
        activeAdRow: {
          id: "ad-boost-1",
          user_email: "amazon@paayh.com",
          ad_type: "business",
          impressions: 1000,
          impression_count: 100,
          cost_per_impression: 45,
          campaign_days: 7,
          user_frequency_cap: 5,
          targeting_all: true,
          admin_statement: `APPROVED:${new Date().toISOString()}`,
          is_paused: false,
        },
      }
    );

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("amazon@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({ PayoutProvider: {} }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      spendWalletBalanceAtomic: vi.fn(),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/security/walletPinHelper", () => ({
      verifyTransactionPin: vi.fn().mockResolvedValue({ valid: true }),
      resolveStoredWalletPinHash: vi.fn().mockReturnValue("hashed"),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
      isRedisReady: () => false,
    }));

    const { POST: boostPost } = await import("../../app/api/campaigns/boost/route");
    const res = await boostPost(
      new NextRequest("http://localhost/api/campaigns/boost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adId: "ad-boost-1",
          additionalImpressions: 1_000_000,
          paymentMethod: "wallet",
        }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.capacityCapped).toBe(true);
    expect(json.maxOrderableImpressions).toBeLessThan(1_000_000);
  });

  it("blocks over-capacity ad and publish_ad orders with capacityCapped on /api/payments/initialize", async () => {
    const approvedRow = {
      ad_type: "business",
      impressions: 1_000_000,
      cost_per_impression: 45,
      total_cost: 45_000_000,
      product_cta_link: null,
      product_cta_type: "Comment",
      is_bidded: false,
      bid_price: null,
      is_admin_post: false,
      admin_statement: `APPROVED:${new Date().toISOString()}`,
      user_email: "amazon@paayh.com",
      targeting_all: true,
      country: null,
      state: null,
      province: null,
      gender: null,
      age_range: null,
      employment_status: null,
      industry: [],
      interest: [],
      lifestyle: [],
      behavior: [],
      personality: [],
      campaign_days: 7,
      user_frequency_cap: 5,
    };

    const supabaseMock = createCountMockSupabase(
      { global: 500, country: 200, strict: 100 },
      { approvedAdRow: approvedRow }
    );

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("amazon@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({ PayoutProvider: {} }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
    }));

    const { POST: initPost } = await import("../../app/api/payments/initialize/route");

    // 1. Direct "ad" payment
    const adRes = await initPost(
      new NextRequest("http://localhost/api/payments/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "ad",
          amount: 45_000_000,
          metadata: {
            adData: {
              adType: "business",
              impressions: 1_000_000,
              costPerImpression: 45,
              campaignDays: 7,
              userFrequencyCap: 5,
              targetingAll: true,
            },
          },
        }),
      })
    );
    const adJson = await adRes.json();
    expect(adRes.status).toBe(400);
    expect(adJson.capacityCapped).toBe(true);
    expect(adJson.maxOrderableImpressions).toBeLessThan(1_000_000);

    // 2. Approved "publish_ad" payment
    const pubRes = await initPost(
      new NextRequest("http://localhost/api/payments/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "publish_ad",
          amount: 45_000_000,
          metadata: { adId: "approved-ad-1" },
        }),
      })
    );
    const pubJson = await pubRes.json();
    expect(pubRes.status).toBe(400);
    expect(pubJson.capacityCapped).toBe(true);
    expect(pubJson.maxOrderableImpressions).toBeLessThan(1_000_000);
  });

  it("blocks over-capacity ad and publish_ad orders with capacityCapped on /api/payments/wallet-pay before wallet deduction", async () => {
    const approvedRow = {
      id: "approved-ad-wallet-1",
      ad_type: "business",
      impressions: 1_000_000,
      cost_per_impression: 45,
      total_cost: 45_000_000,
      product_cta_link: null,
      product_cta_type: "Comment",
      is_bidded: false,
      bid_price: null,
      is_admin_post: false,
      admin_statement: `APPROVED:${new Date().toISOString()}`,
      user_email: "amazon@paayh.com",
      targeting_all: true,
      country: null,
      state: null,
      province: null,
      gender: null,
      age_range: null,
      employment_status: null,
      industry: [],
      interest: [],
      lifestyle: [],
      behavior: [],
      personality: [],
      campaign_days: 7,
      user_frequency_cap: 5,
    };

    const supabaseMock = createCountMockSupabase(
      { global: 500, country: 200, strict: 100 },
      { approvedAdRow: approvedRow }
    );
    const spendSpy = vi.fn();

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("amazon@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({ PayoutProvider: {} }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
    }));
    vi.doMock("@/lib/security/walletPinHelper", () => ({
      verifyTransactionPin: vi.fn().mockResolvedValue({ valid: true }),
      resolveStoredWalletPinHash: vi.fn().mockReturnValue("hashed"),
    }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      spendWalletBalanceAtomic: spendSpy,
      refundWalletDeductionAtomic: vi.fn(),
    }));

    const { POST: walletPayPost } = await import("../../app/api/payments/wallet-pay/route");

    // 1. Direct "ad" wallet-pay
    const adRes = await walletPayPost(
      new NextRequest("http://localhost/api/payments/wallet-pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "ad",
          amount: 45_000_000,
          pin: "1234",
          metadata: {
            adData: {
              adType: "business",
              impressions: 1_000_000,
              costPerImpression: 45,
              campaignDays: 7,
              userFrequencyCap: 5,
              targetingAll: true,
            },
          },
        }),
      })
    );
    const adJson = await adRes.json();
    expect(adRes.status).toBe(400);
    expect(adJson.capacityCapped).toBe(true);
    expect(adJson.maxOrderableImpressions).toBeLessThan(1_000_000);

    // 2. Approved "publish_ad" wallet-pay
    const pubRes = await walletPayPost(
      new NextRequest("http://localhost/api/payments/wallet-pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "publish_ad",
          amount: 45_000_000,
          pin: "1234",
          metadata: { adId: "approved-ad-wallet-1" },
        }),
      })
    );
    const pubJson = await pubRes.json();
    expect(pubRes.status).toBe(400);
    expect(pubJson.capacityCapped).toBe(true);
    expect(pubJson.maxOrderableImpressions).toBeLessThan(1_000_000);
    expect(spendSpy).not.toHaveBeenCalled();
  });

  it("rejects video extensions on /api/campaigns/upload-url to prevent 180s duration bypass", async () => {
    const createSignedUploadUrlMock = vi.fn();
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("creator@paayh.com"),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        storage: {
          from: () => ({
            createSignedUploadUrl: createSignedUploadUrlMock,
            getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example.com/ad-media/x.jpg" } }),
          }),
        },
      },
    }));

    const { POST: uploadUrlPost } = await import("../../app/api/campaigns/upload-url/route");

    for (const fileName of ["long.mp4", "clip.webm", "movie.mov"]) {
      const res = await uploadUrlPost(
        new NextRequest("http://localhost/api/campaigns/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bucket: "ad-media", fileName }),
        })
      );
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain("/api/campaigns/upload-video");
      expect(json.error).toContain("180 seconds");
    }
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it("enforces capacityCapped rejection on legacy /api/adsubmit route", async () => {
    const db = createCountMockSupabase({ global: 10_000, country: 4_000, strict: 800 });
    const insertSpy = vi.fn();
    const mockDb = {
      from: (table: string) => {
        if (table === "users") {
          return {
            select: (cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.head) return db.from(table).select(cols, opts);
              return {
                ilike: () => ({
                  maybeSingle: async () => ({ data: { ad_account_status: "active", country: "Nigeria" }, error: null }),
                }),
              };
            },
          };
        }
        if (table === "adds") {
          return { insert: insertSpy };
        }
        return db.from(table);
      },
    };

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("brand@shopify.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockDb }));
    vi.doMock("../../../lib/ads/pricingEnforcement", () => ({
      validateAndComputeAdPricing: vi.fn().mockResolvedValue({
        ok: true,
        adCategory: "business",
        impressionsCount: 1_000_000,
        effectiveRate: 45,
        computedTotalCost: 45_000_000,
        isBidded: false,
        isAdminFreePost: false,
        currency: "NGN",
      }),
    }));

    const { POST: adsubmitPost } = await import("../../app/api/adsubmit/route");
    const res = await adsubmitPost(
      new NextRequest("http://localhost/api/adsubmit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adType: "business",
          impressions: 1_000_000,
          campaignDays: 7,
          userFrequencyCap: 5,
          costPerImpression: 45,
          totalCost: 45_000_000,
          adContent: "Legacy route over-cap test",
        }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.capacityCapped).toBe(true);
    expect(json.maxOrderableImpressions).toBeLessThan(1_000_000);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("wires check_capacity and assessAdDeliveryCapacityEdge into web Edge Functions", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const campaignsIndex = fs.readFileSync(path.join(root, "supabase/functions/campaigns-action/index.ts"), "utf8");
    const campaignsManage = fs.readFileSync(path.join(root, "supabase/functions/campaigns-action/manage.ts"), "utf8");
    const paymentAct = fs.readFileSync(path.join(root, "supabase/functions/_shared/paymentActivation.ts"), "utf8");
    const paymentHandlers = fs.readFileSync(path.join(root, "supabase/functions/payments-action/handlers.ts"), "utf8");

    expect(campaignsIndex).toContain('action === "check_capacity"');
    expect(campaignsManage).toContain("assessAdDeliveryCapacityEdge");
    expect(campaignsManage).toContain("capacityCapped: true");
    expect(paymentAct).toContain("assessAdDeliveryCapacityEdge");
    expect(paymentAct).toContain("capacityCapped: true");
    expect(paymentHandlers).toContain("validation.capacityCapped");
  });

  it("allows 100,000 attentions on 20,000 users with 5x frequency cap without double-discounting", async () => {
    const supabaseMock = createCountMockSupabase({
      global: 20_000,
      country: 20_000,
      strict: 20_000,
    });

    const assessment = await assessAdDeliveryCapacity(supabaseMock, {
      requestedImpressions: 100_000,
      userFrequencyCap: 5,
      campaignDays: 5,
      targetingAll: true,
      advertiserEmail: "brand@paayh.com",
    });

    expect(assessment.telemetryAvailable).toBe(true);
    expect(assessment.allowed).toBe(true);
    expect(assessment.maxOrderableImpressions).toBeGreaterThanOrEqual(100_000);
  });

  it("uses O(1) get_ad_capacity_counts RPC fast-path and L1 cache without scanning public.users", async () => {
    const rpcSpy = vi.fn(async () => ({
      data: {
        available: true,
        global_users: 20_000,
        country_users: 10_000,
        strict_users: 5_000,
      },
      error: null,
    }));
    const fromSpy = vi.fn(() => {
      throw new Error("Should not scan public.users when RPC succeeds");
    });
    const rpcClient = { rpc: rpcSpy, from: fromSpy };

    const first = await assessAdDeliveryCapacity(rpcClient, {
      requestedImpressions: 5_000,
      userFrequencyCap: 5,
      campaignDays: 7,
      country: "Nigeria",
      interest: ["Tech"],
      advertiserEmail: "brand@paayh.com",
    });
    // Simulate slider drag changing requestedImpressions and campaignDays with same filters
    const second = await assessAdDeliveryCapacity(rpcClient, {
      requestedImpressions: 10_000,
      userFrequencyCap: 7,
      campaignDays: 14,
      country: "Nigeria",
      interest: ["Tech"],
      advertiserEmail: "brand@paayh.com",
    });

    expect(first.telemetryAvailable).toBe(true);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith(
      "get_ad_capacity_counts",
      expect.objectContaining({
        p_country: "nigeria",
        p_interest: ["tech"],
      })
    );
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("uses concise <100 copy and escapes LIKE wildcards in fallback queries", async () => {
    const ilikeArgs: Array<{ col: string; pattern: string }> = [];
    const fallbackClient = {
      from: vi.fn(() => {
        const builder: any = {
          select: vi.fn(() => builder),
          or: vi.fn(() => builder),
          ilike: vi.fn((col: string, pattern: string) => {
            ilikeArgs.push({ col, pattern });
            return builder;
          }),
          overlaps: vi.fn(() => builder),
          then: (resolve: any) =>
            Promise.resolve({ count: 30, data: null, error: null }).then(resolve),
        };
        return builder;
      }),
    };

    const res = await assessAdDeliveryCapacity(fallbackClient, {
      requestedImpressions: 100,
      userFrequencyCap: 1,
      campaignDays: 1,
      targetingAll: false,
      country: "100%_test",
      state: "a_b%c\\d",
      advertiserEmail: "brand@paayh.com",
    });

    expect(res.allowed).toBe(false);
    expect(res.status).toBe("capped");
    expect(res.message).not.toContain("Targeting capacity is below 500 attentions");
    expect(res.message).not.toContain("Current setup can deliver up to");
    expect(res.message.toLowerCase()).toContain("under 100 active attentions");
    expect(res.message.toLowerCase()).toContain("frequency");
    expect(ilikeArgs.some((a) => a.col === "country" && a.pattern === "100\\%\\_test")).toBe(true);
    expect(ilikeArgs.some((a) => a.col === "state" && a.pattern === "%a\\_b\\%c\\\\d%")).toBe(true);
  });

  it("removes [500,1000,2500,5000] preset buttons, fits capacity containers to content, and ships 500M RPC SQL", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const step2Src = fs.readFileSync(path.join(root, "components/Ad/Step2Budget.tsx"), "utf8");
    const step4Src = fs.readFileSync(path.join(root, "components/Ad/Step4Summary.tsx"), "utf8");
    const boosterSrc = fs.readFileSync(path.join(root, "components/MyAds/CampaignBoosterModal.tsx"), "utf8");
    const scaleSql = fs.readFileSync(
      path.join(root, "supabase/migrations/20261114190000_500m_scale_ad_capacity_stats_and_indexes.sql"),
      "utf8"
    );

    expect(step2Src).not.toContain("[500, 1000, 2500, 5000]");
    expect(step2Src).toContain('width: "fit-content"');
    expect(step2Src).toContain('display: "inline-flex"');
    expect(step4Src).toContain('width: "fit-content"');
    expect(step4Src).toContain('display: "inline-flex"');
    expect(boosterSrc).toContain('width: "fit-content"');
    expect(boosterSrc).toContain('display: "inline-flex"');
    expect(scaleSql).toContain("CREATE TABLE IF NOT EXISTS public.ad_capacity_stats");
    expect(scaleSql).toContain("get_ad_capacity_counts");
    expect(scaleSql).toContain("refresh_ad_capacity_stats");
    expect(scaleSql).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(scaleSql).not.toMatch(/^\s*COMMIT\s*;/m);
    expect(scaleSql).not.toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i);
    expect(scaleSql).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_country_gender");
    expect(scaleSql).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_last_active_at");
    expect(scaleSql).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_created_at_no_last_active");
    expect(scaleSql).toContain("SET search_path = pg_catalog, public");
    expect(scaleSql).not.toContain("SET LOCAL statement_timeout");
    expect(scaleSql).not.toContain("ON public.users (COALESCE(last_active_at, created_at)");
    expect(scaleSql).not.toContain("ELSIF p_industry");

    const fnStart = scaleSql.indexOf("CREATE OR REPLACE FUNCTION public.get_ad_capacity_counts");
    const fnEnd = scaleSql.indexOf("CREATE OR REPLACE FUNCTION public.run_database_cleanup_cron");
    const getCountsSection = scaleSql.slice(fnStart, fnEnd);
    expect(getCountsSection).not.toContain("FROM public.users");

    const cronSrc = fs.readFileSync(path.join(root, "app/api/cron/database-cleanup/route.ts"), "utf8");
    expect(cronSrc).toContain('rpc("refresh_ad_capacity_stats")');
  });

  it("shares L1 cache across separate client instances with the same supabaseUrl, ignores default ageRange [18,65] for strict messaging, and applies independent overlaps filters", async () => {
    let rpcCalls = 0;
    const makeClient = () => ({
      supabaseUrl: "https://example-project.supabase.co",
      rpc: vi.fn(async () => {
        rpcCalls += 1;
        return {
          data: {
            available: true,
            global_users: 20_000,
            country_users: 20_000,
            strict_users: 20_000,
          },
          error: null,
        };
      }),
    });

    const first = await assessAdDeliveryCapacity(makeClient(), {
      requestedImpressions: 100_000,
      userFrequencyCap: 5,
      campaignDays: 7,
      targetingAll: false,
      ageRange: [18, 65],
      advertiserEmail: "brand@paayh.com",
    });
    const second = await assessAdDeliveryCapacity(makeClient(), {
      requestedImpressions: 80_000,
      userFrequencyCap: 5,
      campaignDays: 7,
      targetingAll: false,
      ageRange: [18, 65],
      advertiserEmail: "brand@paayh.com",
    });

    expect(rpcCalls).toBe(1);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(first.message).not.toContain("Strict filters reach");

    const overlappedCols: string[] = [];
    const fallbackClient = {
      from: vi.fn(() => {
        const builder: any = {
          select: vi.fn(() => builder),
          or: vi.fn(() => builder),
          ilike: vi.fn(() => builder),
          overlaps: vi.fn((col: string) => {
            overlappedCols.push(col);
            return builder;
          }),
          then: (resolve: any) =>
            Promise.resolve({ count: 5_000, data: null, error: null }).then(resolve),
        };
        return builder;
      }),
    };

    await assessAdDeliveryCapacity(fallbackClient, {
      requestedImpressions: 1_000,
      userFrequencyCap: 2,
      campaignDays: 3,
      targetingAll: false,
      interest: ["tech"],
      industry: ["software"],
    });
    expect(overlappedCols).toContain("interest");
    expect(overlappedCols).toContain("industry");
  });

  it("allows 501+ attentions on a pre-launch small active pool when duration and frequency cap provide capacity (no artificial 500 ladder cliff)", async () => {
    // 8 active users (7 non-owner) at userFrequencyCap = 100 over 17+ days produces
    // stage2Raw = floor(7 * 102 * 0.95) = 678, buffered ~= 542..610 across [0.80, 0.90].
    // Previously CAPACITY_LADDER jumped from 500 -> 1,000 and floored buffered 590 down to 500!
    const rpcClient = {
      supabaseUrl: "https://small-pool-501.supabase.co",
      rpc: vi.fn(async () => ({
        data: {
          available: true,
          global_users: 8,
          country_users: 8,
          strict_users: 8,
        },
        error: null,
      })),
    };

    const res501 = await assessAdDeliveryCapacity(rpcClient, {
      requestedImpressions: 501,
      userFrequencyCap: 100,
      campaignDays: 17,
      targetingAll: true,
      advertiserEmail: "brand@paayh.com",
    });

    expect(res501.telemetryAvailable).toBe(true);
    expect(res501.allowed).toBe(true);
    expect(res501.status).toBe("optimal");
    expect(res501.maxOrderableImpressions).toBeGreaterThanOrEqual(525);
    expect(res501.maxOrderableImpressions).toBeLessThan(1_000);
    expect(CAPACITY_LADDER).toContain(res501.maxOrderableImpressions);
    // Privacy: exact user count (7 or 8) must never appear in response payload or message
    const serialized = JSON.stringify(res501);
    expect(serialized).not.toMatch(/\b[78]\s*(users|people|accounts)\b/i);

    // Increasing frequency cap on a mid-tier audience unlocks intermediate tiers (525..950)
    const cap1 = await assessAdDeliveryCapacity(rpcClient, {
      requestedImpressions: 501,
      userFrequencyCap: 1,
      campaignDays: 1,
      targetingAll: true,
      advertiserEmail: "brand@paayh.com",
    });
    expect(cap1.allowed).toBe(false);
    expect(cap1.maxOrderableImpressions).toBe(0);
    expect(res501.maxOrderableImpressions).toBeGreaterThan(cap1.maxOrderableImpressions);

    // Mid-ladder quantization checks in [500..999] and [1_000..2_499]
    expect(quantizeDeliverableCapacity(521, 1)).toBe(510);
    expect(quantizeDeliverableCapacity(678, 0.8714)).toBe(575);
    expect(quantizeDeliverableCapacity(590, 1)).toBe(575);
    expect(quantizeDeliverableCapacity(847, 1)).toBe(800);
    expect(quantizeDeliverableCapacity(1_380, 1)).toBe(1_250);

    // 15-day duration with cap=100 on 8 active users (buffered ~521 at 0.8714) also unlocks 501 via 510 tier
    const res15d = await assessAdDeliveryCapacity(rpcClient, {
      requestedImpressions: 501,
      userFrequencyCap: 100,
      campaignDays: 15,
      targetingAll: true,
      advertiserEmail: "brand@paayh.com",
    });
    expect(res15d.allowed).toBe(true);
    expect(res15d.maxOrderableImpressions).toBeGreaterThanOrEqual(501);
  });

  it("allows /api/campaigns/boost to push remaining+additional to 501 when maxOrderableImpressions > 500, and updates/clamps frequency cap cleanly", async () => {
    const mockDb = createCountMockSupabase(
      { global: 8, country: 8, strict: 8 },
      {
        activeAdRow: {
          id: "ad-boost-501",
          user_email: "amazon@paayh.com",
          ad_type: "business",
          impressions: 500,
          impression_count: 0,
          cost_per_impression: 45,
          campaign_days: 17,
          user_frequency_cap: 100,
          targeting_all: true,
          admin_statement: `APPROVED:${new Date().toISOString()}`,
          is_paused: false,
        },
      }
    );

    const updatedPayloads: Array<{ table: string; payload: any }> = [];
    const baseFrom = mockDb.from;
    const supabaseMock = {
      ...mockDb,
      from: (table: string) => {
        if (table === "adds" || table === "addsactive" || table === "payments") {
          const inner: any = {
            select: () => baseFrom(table).select(),
            update: (payload: any) => {
              updatedPayloads.push({ table, payload });
              return { eq: async () => ({ error: null }) };
            },
            insert: async () => ({ error: null }),
          };
          return inner;
        }
        if (table === "users") {
          return {
            select: (cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.head) return baseFrom(table).select(cols, opts);
              return {
                ilike: () => ({
                  maybeSingle: async () => ({
                    data: { country: "Nigeria", wallet_pin_hash: "hashed", passphrase: null },
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        return baseFrom(table);
      },
    };

    const spendSpy = vi.fn().mockResolvedValue({ success: true, newBalance: 100_000 });
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("amazon@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({ PayoutProvider: {} }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      spendWalletBalanceAtomic: spendSpy,
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
      invalidateSharedHighlightsPool: vi.fn(),
    }));
    vi.doMock("@/lib/security/walletPinHelper", () => ({
      verifyTransactionPin: vi.fn().mockResolvedValue({ valid: true }),
      resolveStoredWalletPinHash: vi.fn().mockReturnValue("hashed"),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
      isRedisReady: () => false,
    }));

    const { POST: boostPost } = await import("../../app/api/campaigns/boost/route");
    const okRes = await boostPost(
      new NextRequest("http://localhost/api/campaigns/boost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adId: "ad-boost-501",
          additionalImpressions: 1,
          userFrequencyCap: 250,
          paymentMethod: "wallet",
          pin: "1234",
        }),
      })
    );
    const okJson = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(okJson.success).toBe(true);
    expect(okJson.capacityCapped).toBeUndefined();
    expect(spendSpy).toHaveBeenCalledTimes(1);
    const activeUpdate = updatedPayloads.find((u) => u.table === "addsactive")?.payload;
    expect(activeUpdate).toBeDefined();
    expect(activeUpdate.impressions).toBe(501);
    expect(activeUpdate.user_frequency_cap).toBe(250);

    // Still enforces cap when remaining + add exceeds maxOrderableImpressions
    const cappedRes = await boostPost(
      new NextRequest("http://localhost/api/campaigns/boost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adId: "ad-boost-501",
          additionalImpressions: 500,
          userFrequencyCap: 100,
          paymentMethod: "wallet",
          pin: "1234",
        }),
      })
    );
    const cappedJson = await cappedRes.json();
    expect(cappedRes.status).toBe(400);
    expect(cappedJson.capacityCapped).toBe(true);
    expect(cappedJson.maxOrderableImpressions).toBeGreaterThanOrEqual(525);
    expect(cappedJson.maxOrderableImpressions).toBeLessThan(1_000);
  });

  it("keeps web/mobile edge CAPACITY_LADDER, frequency cap 20,000x slider / 5,000,000 manual cap, Cap-to boost helpers, and 12-arg RPC overload drop in sync", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const mobileRoot = path.resolve(root, "..", "Desktop", "xea-mobile");

    const webEdgeCapacity = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/adCapacity.ts"),
      "utf8"
    );
    const webManageEdge = fs.readFileSync(
      path.join(root, "supabase/functions/campaigns-action/manage.ts"),
      "utf8"
    );
    const webBoosterModal = fs.readFileSync(
      path.join(root, "components/MyAds/CampaignBoosterModal.tsx"),
      "utf8"
    );
    const webMigration19 = fs.readFileSync(
      path.join(root, "supabase/migrations/20261114190000_500m_scale_ad_capacity_stats_and_indexes.sql"),
      "utf8"
    );
    const webMigration21 = fs.readFileSync(
      path.join(root, "supabase/migrations/20261114210000_drop_legacy_get_ad_capacity_counts_overload.sql"),
      "utf8"
    );

    const webPaymentActivation = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/paymentActivation.ts"),
      "utf8"
    );
    const webProcessPayment = fs.readFileSync(
      path.join(root, "lib/payment/processPayment.ts"),
      "utf8"
    );
    const webCapacityHook = fs.readFileSync(
      path.join(root, "lib/hooks/useAdCapacityCheck.ts"),
      "utf8"
    );

    expect(webEdgeCapacity).toContain("510,");
    expect(webEdgeCapacity).toContain("525,");
    expect(webEdgeCapacity).toContain("575,");
    expect(webManageEdge).toContain("Math.min(5_000_000,");
    expect(webManageEdge).toContain("user_frequency_cap: normalizedBoostFreqCap");
    expect(webManageEdge).not.toContain("Math.min(10,");
    expect(webPaymentActivation).toContain("user_frequency_cap: normalizedFreqCap");
    expect(webProcessPayment).toContain("ad.impressions || 100");
    expect(webCapacityHook).toContain("setCapacity(null)");
    expect(webBoosterModal).toContain("FREQUENCY_CAP_SLIDER_MAX_POS");
    expect(webBoosterModal).toContain("Approximate Daily View");
    expect(webBoosterModal).toContain("Use +");
    expect(webBoosterModal).toContain("Custom extra attentions");
    expect(webBoosterModal).toContain("checkingBoostCapacity");
    expect(webBoosterModal).toContain("90 - currentCampaignDays");
    expect(webMigration19).toContain("DROP FUNCTION IF EXISTS public.get_ad_capacity_counts");
    expect(webMigration21).toContain("DROP FUNCTION IF EXISTS public.get_ad_capacity_counts");

    if (fs.existsSync(mobileRoot)) {
      const mobileEdgeCapacity = fs.readFileSync(
        path.join(mobileRoot, "supabase/functions/_shared/adCapacity.ts"),
        "utf8"
      );
      const mobileFreqSlider = fs.readFileSync(
        path.join(mobileRoot, "components/campaigns/FrequencySlider.tsx"),
        "utf8"
      );
      const mobileBoosterModal = fs.readFileSync(
        path.join(mobileRoot, "components/campaigns/BoosterModal.tsx"),
        "utf8"
      );
      const mobileCampaignsEdge = fs.readFileSync(
        path.join(mobileRoot, "supabase/functions/campaigns-action/index.ts"),
        "utf8"
      );
      const mobilePaymentsEdge = fs.readFileSync(
        path.join(mobileRoot, "supabase/functions/payments-action/index.ts"),
        "utf8"
      );
      const mobileMigration21 = fs.readFileSync(
        path.join(mobileRoot, "supabase/migrations/20261114210000_drop_legacy_get_ad_capacity_counts_overload.sql"),
        "utf8"
      );

      expect(mobileEdgeCapacity).toContain("100,");
      expect(mobileEdgeCapacity).toContain("510,");
      expect(mobileEdgeCapacity).toContain("525,");
      expect(mobileEdgeCapacity).toContain("Math.min(90,");
      expect(mobileEdgeCapacity).not.toContain("Current setup can deliver");
      expect(mobileFreqSlider).toContain("max = SLIDER_MAX_FREQUENCY_CAP");
      expect(mobileFreqSlider).toContain("APPROXIMATE DAILY VIEW");
      expect(mobileBoosterModal).toContain("Use +");
      expect(mobileBoosterModal).toContain("<FrequencySlider");
      expect(mobileBoosterModal).toContain("userFrequencyCap: parsedFreqCap");
      expect(mobileCampaignsEdge).toContain("Number(campaign.impressions || MIN_AD_ATTENTIONS)");
      expect(mobileCampaignsEdge).toContain("normalizedBoostFreqCap");
      expect(mobileCampaignsEdge).toContain("MAX_AD_DURATION_DAYS");
      expect(mobilePaymentsEdge).toContain("user_frequency_cap = Math.max");
      expect(mobilePaymentsEdge).toContain("MAX_AD_DURATION_DAYS");
      expect(mobileMigration21).toContain("DROP FUNCTION IF EXISTS public.get_ad_capacity_counts");
    }
    expect(webEdgeCapacity).toContain("100,");
    expect(webEdgeCapacity).toContain("Math.min(90,");
    expect(webEdgeCapacity).not.toContain("Current setup can deliver");
  });

  it("web Edge Functions (manage.ts & paymentActivation.ts) compile without undeclared identifiers and execute boost / additional_impressions validation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const ts = await import("typescript");
    const root = process.cwd();

    const managePath = path.join(root, "supabase/functions/campaigns-action/manage.ts");
    const paymentActivationPath = path.join(root, "supabase/functions/_shared/paymentActivation.ts");
    const adCapacityPath = path.join(root, "supabase/functions/_shared/adCapacity.ts");

    const program = ts.createProgram([managePath, paymentActivationPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
    });
    const undeclared = [managePath, paymentActivationPath]
      .flatMap((file) => program.getSemanticDiagnostics(program.getSourceFile(file)))
      .filter((d) => d.code === 2304 && !String(d.messageText).includes("'Deno'"))
      .map((d) => `${path.basename(d.file?.fileName || "")}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
    expect(undeclared).toEqual([]);

    const loadTs = (fullPath: string, mocks: Record<string, unknown> = {}) => {
      const src = fs.readFileSync(fullPath, "utf8");
      const out = ts.transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      });
      const mod: { exports: Record<string, any> } = { exports: {} };
      const customRequire = (id: string) => {
        if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
        throw new Error(`Unexpected require in edge test: ${id}`);
      };
      const fn = new Function("exports", "require", "module", out.outputText);
      fn(mod.exports, customRequire, mod);
      return mod.exports;
    };

    const prevDeno = (globalThis as any).Deno;
    (globalThis as any).Deno = { env: { get: () => "web-edge-test-secret" } };
    try {
      const adCapacityMod = loadTs(adCapacityPath);
      const adPricingStub = {
        MIN_AD_ATTENTIONS: 100,
        MAX_AD_DURATION_DAYS: 90,
        applyProductSalesSubsidyEdge: (r: number) => r,
        getLocalizedAdFloorRateEdge: () => 25,
        getUserCurrencyEdge: () => "NGN",
        isVerifiedSubscriberProductLinkEdge: async () => false,
        resolveUserPricingCountryEdge: async () => "NG",
        validateAndComputeAdPricingEdge: async () => ({ ok: true, computedTotalCost: 12500 }),
      };
      const corsStub = {
        isAdminEmail: () => false,
        sanitizeCsvArray: (v: unknown) => v,
        jsonResponse: (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
        errorResponse: (message: string, status = 400, extra: Record<string, unknown> = {}) =>
          new Response(JSON.stringify({ error: message, ...extra }), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
      };

      const paymentActivationMod = loadTs(paymentActivationPath, {
        "./atwEngine.ts": { computeAtwTierDetails: () => ({}) },
        "./adCapacity.ts": adCapacityMod,
        "./cors.ts": corsStub,
        "./adPricing.ts": adPricingStub,
      });

      const insertedPayments: any[] = [];
      const updatedAddsActive: any[] = [];
      const adRow = {
        id: "web-ad-501",
        user_email: "brand@paayh.com",
        ad_type: "individual",
        impressions: 500,
        impression_count: 0,
        campaign_days: 17,
        user_frequency_cap: 1,
        cost_per_impression: 25,
        bid_price: 25,
        total_cost: 12500,
        targeting_all: true,
        is_paused: false,
        is_bidded: false,
      };
      const mockSupabase = {
        supabaseUrl: "https://web-edge-runtime.supabase.co",
        async rpc(name: string) {
          if (name === "get_ad_capacity_counts") {
            return { data: { available: true, global_users: 8, country_users: 8, strict_users: 8 }, error: null };
          }
          return { data: null, error: null };
        },
        from(table: string) {
          const builder: any = {
            select() { return builder; },
            eq() { return builder; },
            ilike() { return builder; },
            in() { return builder; },
            async maybeSingle() {
              if (table === "addsactive") return { data: { ...adRow }, error: null };
              if (table === "users") return { data: { ad_account_status: "active", balance: 100000 }, error: null };
              return { data: null, error: null };
            },
            update(payload: any) {
              if (table === "addsactive") updatedAddsActive.push(payload);
              return builder;
            },
            async insert(rows: any[]) {
              if (table === "payments") insertedPayments.push(...rows);
              return { data: rows, error: null };
            },
            then(resolve: any) {
              return Promise.resolve({ count: 0, data: null, error: null }).then(resolve);
            },
          };
          return builder;
        },
      };

      const manageMod = loadTs(managePath, {
        "../_shared/cors.ts": corsStub,
        "../_shared/adCapacity.ts": adCapacityMod,
        "../_shared/paymentActivation.ts": {
          deductWalletAtomic: async () => ({ success: true, newBalance: 99875 }),
          refundWalletAtomic: async () => ({ success: true }),
        },
        "../_shared/payoutProvider.ts": {
          initializePayment: async () => ({
            success: true,
            authorization_url: "https://checkout.kora.test/web-boost",
            reference: "kora_web_boost_1",
            provider: "kora",
          }),
        },
        "../_shared/urlValidation.ts": { validateSafeMediaUrl: () => true, validateSafeUrl: () => true },
        "../_shared/walletPin.ts": { verifyTransactionPinEdge: async () => ({ valid: true }) },
        "./analytics.ts": { buildEdgeCampaignAnalyticsPayload: () => ({}), computeAdSpendMetricsEdge: () => ({}) },
        "../_shared/adPricing.ts": adPricingStub,
      });

      const cardRes: Response = await manageMod.handleBoostCampaignOrHighlight(
        mockSupabase,
        "brand@paayh.com",
        "boost_ad",
        {
          adId: "web-ad-501",
          additionalImpressions: 5,
          userFrequencyCap: 100,
          paymentMethod: "card",
        }
      );
      const cardJson = await cardRes.json();
      expect(cardRes.status).toBe(200);
      expect(cardJson.success).toBe(true);
      expect(insertedPayments[0]?.metadata?.additional_impressions).toBe(5);
      expect(insertedPayments[0]?.metadata?.user_frequency_cap).toBe(100);

      const walletRes: Response = await manageMod.handleBoostCampaignOrHighlight(
        mockSupabase,
        "brand@paayh.com",
        "boost_ad",
        {
          adId: "web-ad-501",
          additionalImpressions: 5,
          userFrequencyCap: 100,
          paymentMethod: "wallet",
          pin: "1234",
        }
      );
      const walletJson = await walletRes.json();
      expect(walletRes.status).toBe(200);
      expect(walletJson.success).toBe(true);
      expect(updatedAddsActive[0]?.impressions).toBe(505);
      expect(updatedAddsActive[0]?.user_frequency_cap).toBe(100);

      const validation = await paymentActivationMod.validatePayableResource(
        mockSupabase,
        {
          userEmail: "brand@paayh.com",
          payType: "boost_campaign",
          metadata: {
            ad_id: "web-ad-501",
            additional_impressions: 2000,
            additional_days: 0,
            user_frequency_cap: 100,
          },
        }
      );
      expect(validation.valid).toBe(false);
      expect(validation.capacityCapped).toBe(true);
      expect(validation.maxOrderableImpressions).toBeLessThan(2500);
    } finally {
      if (prevDeno === undefined) delete (globalThis as any).Deno;
      else (globalThis as any).Deno = prevDeno;
    }
  }, 30_000);

  it("treats mobile gender='both' as a wildcard rather than a literal filter", async () => {
    let capturedGender: string | null | undefined = "unset";
    const mockSb = {
      async rpc(fnName: string, params: Record<string, any>) {
        if (fnName === "get_ad_capacity_counts") {
          capturedGender = params.p_gender;
          return {
            data: { available: true, global_users: 5_000, country_users: 2_000, strict_users: 2_000 },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    const res = await assessAdDeliveryCapacity(mockSb, {
      requestedImpressions: 500,
      userFrequencyCap: 1,
      campaignDays: 5,
      country: "Nigeria",
      gender: "both",
      advertiserEmail: "brand@paayh.com",
    });
    expect(capturedGender).toBeNull();
    expect(res.status).toBe("optimal");
    expect(res.allowed).toBe(true);
    expect(res.strictTierImpressions).toBeGreaterThanOrEqual(500);
  });

  it("enforces capacity on /api/campaigns/boost and web Edge boost when additionalImpressions=0 and freqCap or targeting narrows", async () => {
    const { isConcreteTargetingValue } = await import("../ads/capacityEstimator");
    expect(isConcreteTargetingValue("both")).toBe(false);
    expect(isConcreteTargetingValue("everyone")).toBe(false);
    expect(isConcreteTargetingValue("All Locations")).toBe(false);
    expect(isConcreteTargetingValue("Nigeria")).toBe(true);
    expect(isConcreteTargetingValue("Female")).toBe(true);

    const prevDeno = (globalThis as any).Deno;
    (globalThis as any).Deno = {
      env: { get: () => "" },
    };

    try {
      const mockDb = createCountMockSupabase(
        { global: 20, country: 20, strict: 20 },
        {
          activeAdRow: {
            id: "ad-boost-zero-add",
            user_email: "amazon@paayh.com",
            ad_type: "business",
            impressions: 1000,
            impression_count: 100,
            cost_per_impression: 45,
            campaign_days: 5,
            user_frequency_cap: 10,
            targeting_all: true,
            admin_statement: `APPROVED:${new Date().toISOString()}`,
            is_paused: false,
          },
        }
      );

      vi.resetModules();
      vi.doMock("@/lib/authHelper", () => ({
        getAuthenticatedEmail: vi.fn().mockResolvedValue("amazon@paayh.com"),
        isAdminEmail: vi.fn().mockReturnValue(false),
      }));
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockDb }));
      vi.doMock("@/lib/payment/payoutProvider", () => ({ PayoutProvider: {} }));
      vi.doMock("@/lib/services/payoutSettlementService", () => ({
        spendWalletBalanceAtomic: vi.fn().mockResolvedValue({ success: true, newBalance: 100_000 }),
      }));
      vi.doMock("@/lib/utils/cache", () => ({
        invalidateCachedProfile: vi.fn(async () => {}),
        invalidateCachedUserCampaigns: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/security/walletPinHelper", () => ({
        verifyTransactionPin: vi.fn().mockResolvedValue({ valid: true }),
        resolveStoredWalletPinHash: vi.fn().mockReturnValue("hashed"),
      }));
      vi.doMock("@/lib/redis", () => ({
        default: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
        isRedisReady: () => false,
      }));

      const { POST: boostPost } = await import("../../app/api/campaigns/boost/route");
      const zeroAddCappedRes = await boostPost(
        new NextRequest("http://localhost/api/campaigns/boost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            adId: "ad-boost-zero-add",
            additionalImpressions: 0,
            newCostPerImpression: 50,
            userFrequencyCap: 1,
            country: "Nigeria",
            paymentMethod: "wallet",
            pin: "1234",
          }),
        })
      );
      const zeroAddJson = await zeroAddCappedRes.json();
      expect(zeroAddCappedRes.status).toBe(400);
      expect(zeroAddJson.capacityCapped).toBe(true);
      expect(zeroAddJson.maxOrderableImpressions).toBeLessThan(900);

      // Web Edge Functions manage.ts & paymentActivation.ts also check capacity when addImp=0 & freqCap lowered
      const fs = await import("fs");
      const path = await import("path");
      const root = path.resolve(process.cwd());
      const ts = await import("typescript");
      const loadTs = (filePath: string, mocks: Record<string, any>) => {
        const src = fs.readFileSync(filePath, "utf8");
        const js = ts.transpileModule(src, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
          },
        }).outputText;
        const mod = { exports: {} as any };
        const reqFn = (specifier: string) => {
          if (specifier in mocks) return mocks[specifier];
          throw new Error(`Unexpected import in test: ${specifier}`);
        };
        const fn = new Function("exports", "require", "module", js);
        fn(mod.exports, reqFn, mod);
        return mod.exports;
      };

      const adCapacityMod = loadTs(path.join(root, "supabase/functions/_shared/adCapacity.ts"), {});
      const corsStub = {
        isAdminEmail: () => false,
        sanitizeCsvArray: (v: unknown) => v,
        jsonResponse: (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
        errorResponse: (message: string, status = 400, extra: Record<string, unknown> = {}) =>
          new Response(JSON.stringify({ error: message, ...extra }), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
      };
      const adPricingStub = {
        MAX_AD_DURATION_DAYS: 90,
        MIN_AD_ATTENTIONS: 100,
        applyProductSalesSubsidyEdge: (v: number) => v,
        getLocalizedAdFloorRateEdge: () => 25,
        getUserCurrencyEdge: () => "NGN",
        isVerifiedSubscriberProductLinkEdge: async () => false,
        resolveUserPricingCountryEdge: async () => "Nigeria",
        validateAndComputeAdPricingEdge: async () => ({ ok: true }),
      };

      const adRow = {
        id: "web-ad-zero-add",
        user_email: "brand@paayh.com",
        ad_type: "individual",
        impressions: 1000,
        impression_count: 100,
        campaign_days: 5,
        user_frequency_cap: 10,
        cost_per_impression: 25,
        bid_price: 25,
        total_cost: 25000,
        targeting_all: true,
        is_paused: false,
        is_bidded: false,
      };
      const edgeSupabase = {
        supabaseUrl: "https://web-edge-zero-add.supabase.co",
        async rpc(name: string) {
          if (name === "get_ad_capacity_counts") {
            return { data: { available: true, global_users: 20, country_users: 20, strict_users: 20 }, error: null };
          }
          return { data: null, error: null };
        },
        from(table: string) {
          const builder: any = {
            select() { return builder; },
            eq() { return builder; },
            ilike() { return builder; },
            in() { return builder; },
            async maybeSingle() {
              if (table === "addsactive") return { data: { ...adRow }, error: null };
              if (table === "users") return { data: { ad_account_status: "active", balance: 100000 }, error: null };
              return { data: null, error: null };
            },
            update() { return builder; },
            async insert(rows: any[]) { return { data: rows, error: null }; },
            then(resolve: any) { return Promise.resolve({ count: 0, data: null, error: null }).then(resolve); },
          };
          return builder;
        },
      };

      const paymentActivationMod = loadTs(
        path.join(root, "supabase/functions/_shared/paymentActivation.ts"),
        {
          "./atwEngine.ts": { computeAtwTierDetails: () => ({}) },
          "./adCapacity.ts": adCapacityMod,
          "./cors.ts": corsStub,
          "./adPricing.ts": adPricingStub,
        }
      );
      const manageMod = loadTs(
        path.join(root, "supabase/functions/campaigns-action/manage.ts"),
        {
          "../_shared/cors.ts": corsStub,
          "../_shared/adCapacity.ts": adCapacityMod,
          "../_shared/paymentActivation.ts": {
            deductWalletAtomic: async () => ({ success: true, newBalance: 99000 }),
            refundWalletAtomic: async () => ({ success: true }),
          },
          "../_shared/payoutProvider.ts": { initializePayment: async () => ({ success: false }) },
          "../_shared/urlValidation.ts": { validateSafeMediaUrl: () => true, validateSafeUrl: () => true },
          "../_shared/walletPin.ts": { verifyTransactionPinEdge: async () => ({ valid: true }) },
          "./analytics.ts": { buildEdgeCampaignAnalyticsPayload: () => ({}), computeAdSpendMetricsEdge: () => ({}) },
          "../_shared/adPricing.ts": adPricingStub,
        }
      );

      const manageZeroRes: Response = await manageMod.handleBoostCampaignOrHighlight(
        edgeSupabase,
        "brand@paayh.com",
        "boost_ad",
        {
          adId: "web-ad-zero-add",
          additionalImpressions: 0,
          newCostPerImpression: 30,
          userFrequencyCap: 1,
          country: "Nigeria",
          paymentMethod: "wallet",
          pin: "1234",
        }
      );
      const manageZeroJson = await manageZeroRes.json();
      expect(manageZeroRes.status).toBe(400);
      expect(manageZeroJson.capacityCapped).toBe(true);

      const payActZeroRes = await paymentActivationMod.validatePayableResource(edgeSupabase, {
        userEmail: "brand@paayh.com",
        payType: "boost_campaign",
        metadata: {
          ad_id: "web-ad-zero-add",
          additional_impressions: 0,
          newCostPerImpression: 30,
          user_frequency_cap: 1,
          country: "Nigeria",
        },
      });
      expect(payActZeroRes.valid).toBe(false);
      expect(payActZeroRes.capacityCapped).toBe(true);

      // Web CampaignBoosterModal & useAdCapacityCheck support addImpressions=0 checks, optimal/unavailable UI, and Retry
      const webBoosterSrc = fs.readFileSync(path.join(root, "components/MyAds/CampaignBoosterModal.tsx"), "utf8");
      const webHookSrc = fs.readFileSync(path.join(root, "lib/hooks/useAdCapacityCheck.ts"), "utf8");
      expect(webBoosterSrc).toContain("shouldCheckBoostCapacity");
      expect(webBoosterSrc).toContain("retryBoostCapacityCheck");
      expect(webBoosterSrc).toContain("boostCapacity.status === \"optimal\"");
      expect(webBoosterSrc).toContain("boostCapacity.status === \"unavailable\"");
      expect(webHookSrc).toContain("status: \"unavailable\"");
      expect(webHookSrc).toContain("retryCapacityCheck");
    } finally {
      if (prevDeno === undefined) delete (globalThis as any).Deno;
      else (globalThis as any).Deno = prevDeno;
    }
  });

  it("supports 20,000x frequency cap slider scale, manual caps >20,000x (up to 5,000,000x), and accurate approximate daily view math", async () => {
    // 1. Non-linear slider mapping covers 1..20,000x smoothly while keeping 1..25x responsive
    expect(SLIDER_MAX_FREQUENCY_CAP).toBe(20_000);
    expect(MAX_FREQUENCY_CAP).toBe(5_000_000);
    expect(sliderPosToFreqCap(0)).toBe(1);
    expect(sliderPosToFreqCap(250)).toBe(25);
    expect(sliderPosToFreqCap(500)).toBe(250);
    expect(sliderPosToFreqCap(750)).toBe(2_500);
    expect(sliderPosToFreqCap(1_000)).toBe(20_000);
    expect(freqCapToSliderPos(20_000)).toBe(1_000);
    // Manual values above 20,000 pin cleanly at slider end without truncating stored value
    expect(freqCapToSliderPos(50_000)).toBe(1_000);
    expect(clampFrequencyCap(50_000)).toBe(50_000);
    expect(clampFrequencyCap(10_000_000)).toBe(5_000_000);
    expect(clampFrequencyCap(0)).toBe(1);

    // 2. Approximate daily view pace math for advertiser decision-making
    const s20k = computeAudienceDailyViewSummary(100_000, 10, 20_000);
    expect(s20k.approxDailyAttentions).toBe(10_000);
    expect(s20k.maxViewsPerViewerPerDay).toBe(2_000);
    expect(s20k.minUniqueAudience).toBe(5);

    const sManual50k = computeAudienceDailyViewSummary(200_000, 10, 50_000);
    expect(sManual50k.frequencyCap).toBe(50_000);
    expect(sManual50k.approxDailyAttentions).toBe(20_000);
    expect(sManual50k.maxViewsPerViewerPerDay).toBe(5_000);
    expect(sManual50k.minUniqueAudience).toBe(4);

    // 3. Capacity estimator unlocks high-repeat capacity when userFrequencyCap > 100 (e.g. 20,000x / 50,000x)
    const makeSmallPoolClient = (poolSize: number) =>
      ({
        supabaseUrl: `https://high-freq-pool-${poolSize}.supabase.co`,
        async rpc() {
          return {
            data: { available: true, global_users: poolSize, country_users: poolSize, strict_users: poolSize },
            error: null,
          };
        },
        from() {
          return {
            select() {
              return this;
            },
            gte() {
              return this;
            },
            eq() {
              return this;
            },
            then(resolve: (val: unknown) => unknown) {
              return Promise.resolve(resolve({ count: poolSize, data: [], error: null }));
            },
          };
        },
      }) as any;

    const pool10 = makeSmallPoolClient(10);
    const res20k = await assessAdDeliveryCapacity(pool10, {
      requestedImpressions: 150_000,
      userFrequencyCap: 20_000,
      campaignDays: 10,
      targetingAll: true,
    });
    expect(res20k.allowed).toBe(true);
    expect(res20k.maxOrderableImpressions).toBeGreaterThanOrEqual(150_000);

    const res50k = await assessAdDeliveryCapacity(pool10, {
      requestedImpressions: 350_000,
      userFrequencyCap: 50_000,
      campaignDays: 10,
      targetingAll: true,
    });
    expect(res50k.allowed).toBe(true);
    expect(res50k.maxOrderableImpressions).toBeGreaterThanOrEqual(350_000);

    // 4. Zod validation schema allows up to 5,000,000x and rejects above 5,000,000
    const { adAudienceSchema } = await import("../validationSchemas");
    expect(adAudienceSchema.safeParse({ impressions: 100, campaignDays: 7, userFrequencyCap: 20_000 }).success).toBe(true);
    expect(adAudienceSchema.safeParse({ impressions: 100, campaignDays: 7, userFrequencyCap: 50_000 }).success).toBe(true);
    expect(adAudienceSchema.safeParse({ impressions: 100, campaignDays: 7, userFrequencyCap: 5_000_000 }).success).toBe(true);
    expect(adAudienceSchema.safeParse({ impressions: 100, campaignDays: 7, userFrequencyCap: 5_000_001 }).success).toBe(false);
  });

  it("allows 3,750 attentions over 90 days at 550x frequency cap on a 10-user DB (min 7 unique viewers)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    // 1. Approximate Daily View math matches UI expectation (ceil(3750 / 550) = 7 unique viewers)
    const dailyView = computeAudienceDailyViewSummary(3_750, 90, 550);
    expect(dailyView.minUniqueAudience).toBe(7);
    expect(dailyView.frequencyCap).toBe(550);

    // 2. Worst-case reserveFactor (0.80) on 9 non-owner users * (550 + 2) still clears 3,750 without double-discounting
    expect(CAPACITY_LADDER).toContain(3_750);
    expect(quantizeDeliverableCapacity(9 * 552, 0.8)).toBeGreaterThanOrEqual(3_750);
    expect(quantizeDeliverableCapacity(9 * 552, 0.85)).toBeGreaterThanOrEqual(3_750);

    // 3. RPC fast-path on 10 active users with advertiserEmail (9 non-owner) allows 3,750 attentions
    const rpcPool10 = {
      supabaseUrl: "https://repro-10users-550x-rpc.supabase.co",
      rpc: vi.fn(async () => ({
        data: { available: true, global_users: 10, country_users: 10, strict_users: 10 },
        error: null,
      })),
    };
    const resGlobal = await assessAdDeliveryCapacity(rpcPool10, {
      requestedImpressions: 3_750,
      userFrequencyCap: 550,
      campaignDays: 90,
      targetingAll: true,
      advertiserEmail: "advertiser@paayh.com",
    });
    expect(resGlobal.telemetryAvailable).toBe(true);
    expect(resGlobal.allowed).toBe(true);
    expect(resGlobal.status).toBe("optimal");
    expect(resGlobal.maxOrderableImpressions).toBeGreaterThanOrEqual(3_750);
    expect(resGlobal.message).not.toMatch(/below 500|Under 100|Max 3,500/i);

    // 4. Narrow targeting on 10-user DB (e.g. only 2 strict matches) unlocks 3,750 via Rollover broadening
    const narrowedPool10 = {
      supabaseUrl: "https://repro-10users-550x-narrow.supabase.co",
      rpc: vi.fn(async () => ({
        data: { available: true, global_users: 10, country_users: 4, strict_users: 2 },
        error: null,
      })),
    };
    const resNarrow = await assessAdDeliveryCapacity(narrowedPool10, {
      requestedImpressions: 3_750,
      userFrequencyCap: 550,
      campaignDays: 90,
      targetingAll: false,
      country: "Nigeria",
      interest: ["Tech"],
      advertiserEmail: "advertiser@paayh.com",
    });
    expect(resNarrow.telemetryAvailable).toBe(true);
    expect(resNarrow.allowed).toBe(true);
    expect(resNarrow.status).toBe("broadened_needed");
    expect(resNarrow.broadeningApplied).toBe(true);
    expect(resNarrow.maxOrderableImpressions).toBeGreaterThanOrEqual(3_750);

    // 5. Fallback head-count query path (no RPC) also allows 3,750 at 550x / 90d on 10 DB users
    const fallbackPool10 = createCountMockSupabase({ global: 10, country: 10, strict: 10 });
    const resFallback = await assessAdDeliveryCapacity(fallbackPool10, {
      requestedImpressions: 3_750,
      userFrequencyCap: 550,
      campaignDays: 90,
      targetingAll: true,
      advertiserEmail: "advertiser@paayh.com",
    });
    expect(resFallback.allowed).toBe(true);
    expect(resFallback.maxOrderableImpressions).toBeGreaterThanOrEqual(3_750);

    // 6. Edge adCapacity.ts parity and small-pool SQL stats refresh migration exist
    const root = process.cwd();
    const edgeCapacitySrc = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/adCapacity.ts"),
      "utf8"
    );
    expect(edgeCapacitySrc).toContain("3_750,");
    expect(edgeCapacitySrc).not.toContain("* 0.95);");

    const smallPoolSql = fs.readFileSync(
      path.join(root, "supabase/migrations/20261115010000_fix_small_pool_capacity_refresh.sql"),
      "utf8"
    );
    expect(smallPoolSql).toContain("COALESCE(v_global, 0) < 1000");
    expect(smallPoolSql).toContain("INTERVAL '15 seconds'");

    const processPaymentSrc = fs.readFileSync(
      path.join(root, "lib/payment/processPayment.ts"),
      "utf8"
    );
    expect(processPaymentSrc).toContain("clampFrequencyCap(user_frequency_cap, 1)");
    expect(processPaymentSrc).not.toContain("Math.min(100, Math.floor(Number(user_frequency_cap)))");
  });
});
