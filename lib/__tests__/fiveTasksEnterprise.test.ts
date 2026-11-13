import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PROFILE_EDIT_COOLDOWN_MS,
  getProfileEditCooldownState,
} from "../utils/profileCooldown";
import {
  AD_UNAVAILABLE_DISMISS_MS,
  AD_UNAVAILABLE_MESSAGE,
  buildAdActionHref,
  buildAdInquiryMessage,
  buildAdSharePayload,
  buildAdShareUrl,
  decodeSharedAdParam,
  extractSharedAdIdFromSearchParams,
} from "../utils/adShare";
import {
  toClientFriendlyApiError,
  toClientFriendlyError,
} from "../utils/clientError";
import {
  isAdRowActiveAndAvailable,
  resolvePublicAdAvailability,
} from "../ads/publicAdResolver";
import { GET as getAssetLinks } from "../../app/.well-known/assetlinks.json/route";
import { GET as getAasa } from "../../app/.well-known/apple-app-site-association/route";

describe("Task 1: Profile Edit Cooldown & Exhaustion Unlock", () => {
  it("allows editing when profile has never been updated or user is admin", () => {
    expect(
      getProfileEditCooldownState({ hasUpdatedProfile: false, lastUpdated: "2026-01-01T00:00:00Z" })
    ).toMatchObject({ isLocked: false, isEditable: true, daysRemaining: 0, buttonCountdownLabel: null });

    expect(
      getProfileEditCooldownState({
        hasUpdatedProfile: true,
        lastUpdated: new Date().toISOString(),
        isAdmin: true,
      })
    ).toMatchObject({ isLocked: false, isEditable: true, daysRemaining: 0, buttonCountdownLabel: null });
  });

  it("computes accurate days and hours remaining while locked", () => {
    const baseMs = Date.UTC(2026, 10, 1, 12, 0, 0);
    const twoHoursLater = baseMs + 2 * 60 * 60 * 1000;

    const state = getProfileEditCooldownState({
      hasUpdatedProfile: true,
      lastUpdated: new Date(baseMs).toISOString(),
      nowMs: twoHoursLater,
    });

    expect(state.isLocked).toBe(true);
    expect(state.isEditable).toBe(false);
    expect(state.days).toBe(14);
    expect(state.hours).toBe(22);
    expect(state.daysRemaining).toBe(15);
    expect(state.buttonCountdownLabel).toBe("14d 22h");
  });

  it("formats sub-day countdown accurately and unlocks immediately at exhaustion boundary", () => {
    const baseMs = Date.UTC(2026, 10, 1, 0, 0, 0);
    const unlockMs = baseMs + PROFILE_EDIT_COOLDOWN_MS;

    // 500ms before exhaustion -> still locked (1s)
    const almostDone = getProfileEditCooldownState({
      hasUpdatedProfile: true,
      lastUpdated: baseMs,
      nowMs: unlockMs - 500,
    });
    expect(almostDone.isLocked).toBe(true);
    expect(almostDone.isEditable).toBe(false);
    expect(almostDone.buttonCountdownLabel).toBe("1s");

    // Exact exhaustion millisecond -> editable immediately
    const exactExhaustion = getProfileEditCooldownState({
      hasUpdatedProfile: true,
      lastUpdated: baseMs,
      nowMs: unlockMs,
    });
    expect(exactExhaustion.isLocked).toBe(false);
    expect(exactExhaustion.isEditable).toBe(true);
    expect(exactExhaustion.daysRemaining).toBe(0);
    expect(exactExhaustion.buttonCountdownLabel).toBeNull();

    // Past exhaustion -> editable
    const afterExhaustion = getProfileEditCooldownState({
      hasUpdatedProfile: true,
      lastUpdated: baseMs,
      nowMs: unlockMs + 60_000,
    });
    expect(afterExhaustion.isLocked).toBe(false);
    expect(afterExhaustion.isEditable).toBe(true);
  });
});

describe("Task 2 & 5: Ad Sharing Context, Deep Links, & Expired Ad Handling", () => {
  it("builds canonical paayh.com/ad/<id> share URLs and advertiser-aware message links", () => {
    const ad = {
      id: "ad_98765_abc",
      ad_content: "Handmade Italian leather sneakers with free Lagos delivery.",
      custom_sponsor_name: "SoleCraft",
    };

    const shareUrl = buildAdShareUrl(ad.id, "https://paayh.com");
    expect(shareUrl).toBe("https://paayh.com/ad/ad_98765_abc");

    const inquiry = buildAdInquiryMessage(ad, "https://paayh.com");
    expect(inquiry).toContain("I'm interested");
    expect(inquiry).toContain("Tell me more");
    expect(inquiry).toContain("https://paayh.com/ad/ad_98765_abc");
    expect(inquiry).toContain("Handmade Italian leather sneakers");

    const waHref = buildAdActionHref("action_whatsapp", "+2348012345678", ad);
    expect(waHref.startsWith("https://wa.me/+2348012345678?text=")).toBe(true);
    const decodedWa = decodeURIComponent(waHref.split("?text=")[1]);
    expect(decodedWa).toContain("I'm interested");
    expect(decodedWa).toContain("https://paayh.com/ad/ad_98765_abc");

    const emailHref = buildAdActionHref("action_email", "sales@solecraft.ng", ad);
    expect(emailHref.startsWith("mailto:sales@solecraft.ng?")).toBe(true);
    expect(decodeURIComponent(emailHref)).toContain("I'm interested");
    expect(decodeURIComponent(emailHref)).toContain("https://paayh.com/ad/ad_98765_abc");

    const sharePayload = buildAdSharePayload(ad, "https://paayh.com");
    expect(sharePayload.url).toBe("https://paayh.com/ad/ad_98765_abc");
    expect(sharePayload.title).toContain("SoleCraft");
  });

  it("extracts shared ad IDs from both canonical and legacy base64 share parameters", () => {
    const encoded = Buffer.from("camp_12345").toString("base64");
    const legacyParams = new URLSearchParams(`view=&Earn Ads by Paayh=${encodeURIComponent(encoded)}`);
    expect(extractSharedAdIdFromSearchParams(legacyParams)).toBe("camp_12345");

    const modernParams = new URLSearchParams("sharedAdId=camp_99999");
    expect(extractSharedAdIdFromSearchParams(modernParams)).toBe("camp_99999");

    expect(decodeSharedAdParam("!!!invalid$$$")).toBeNull();
  });

  it("uses custom 5-second unavailable message constant and detects expired/paused ads accurately", () => {
    expect(AD_UNAVAILABLE_MESSAGE).toBe("This ad is no longer available");
    expect(AD_UNAVAILABLE_DISMISS_MS).toBe(5000);

    expect(isAdRowActiveAndAvailable(null)).toBe(false);
    expect(isAdRowActiveAndAvailable({ completed_at: "2026-10-01T00:00:00Z" })).toBe(false);
    expect(isAdRowActiveAndAvailable({ is_paused: true })).toBe(false);
    expect(isAdRowActiveAndAvailable({ impressions: 100, impression_count: 100 })).toBe(false);
    expect(
      isAdRowActiveAndAvailable(
        { campaign_days: 3, created_at: "2026-10-01T00:00:00Z" },
        Date.UTC(2026, 10, 10)
      )
    ).toBe(false);

    expect(
      isAdRowActiveAndAvailable({
        completed_at: null,
        is_paused: false,
        impressions: 500,
        impression_count: 120,
      })
    ).toBe(true);
  });

  it("rejects malformed ad IDs quickly in publicAdResolver without querying DB", async () => {
    const res = await resolvePublicAdAvailability("bad id with spaces!!");
    expect(res).toEqual({ available: false, reason: "invalid_id" });
  });

  it("serves valid /.well-known App Links and Apple Universal Links JSON", async () => {
    const androidRes = await getAssetLinks();
    expect(androidRes.status).toBe(200);
    expect(androidRes.headers.get("content-type")).toContain("application/json");
    const androidJson = await androidRes.json();
    expect(Array.isArray(androidJson)).toBe(true);
    expect(androidJson[0]?.target?.namespace).toBe("android_app");
    expect(androidJson[0]?.target?.package_name).toBe(
      (process.env.ANDROID_APP_PACKAGE || "com.paayh.app").trim()
    );
    expect(androidJson[0]?.relation).toContain("delegate_permission/common.handle_all_urls");

    const iosRes = await getAasa();
    expect(iosRes.status).toBe(200);
    expect(iosRes.headers.get("content-type")).toContain("application/json");
    const iosJson = await iosRes.json();
    expect(iosJson?.applinks?.details?.[0]?.appIDs?.[0]).toContain(
      (process.env.IOS_BUNDLE_ID || "com.paayh.app").trim()
    );
    expect(iosJson?.applinks?.details?.[0]?.paths).toContain("/*");
    expect(iosJson?.applinks?.details?.[0]?.paths).toContain("/ad/*");
  });
});

describe("Task 4: Client-Friendly Error Sanitization (Network, Server, & Actionable Errors)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 'Connect to network' when offline or on fetch/socket failure", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(toClientFriendlyError(new Error("Anything"))).toBe("Connect to network");
    expect(toClientFriendlyApiError(500, { error: "Internal server error" })).toBe("Connect to network");

    vi.stubGlobal("navigator", { onLine: true });
    expect(toClientFriendlyError(new TypeError("Failed to fetch"))).toBe("Connect to network");
    expect(toClientFriendlyError(new Error("Network request failed"))).toBe("Connect to network");
  });

  it("never exposes internal server or DB errors and instead returns 'Try again later'", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(toClientFriendlyApiError(500, { error: "Internal server error" })).toBe("Try again later");
    expect(toClientFriendlyApiError(502, { error: "<html>Bad Gateway</html>" })).toBe("Try again later");
    expect(toClientFriendlyError("PGRST116: relation users does not exist")).toBe("Try again later");
    expect(toClientFriendlyError("Database connection failure")).toBe("Try again later");
  });

  it("preserves concise, informative user-action error messages on 4xx", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(
      toClientFriendlyApiError(401, {
        error: "Incorrect 4-digit Wallet PIN (3 attempts remaining).",
      })
    ).toBe("Incorrect 4-digit Wallet PIN (3 attempts remaining).");

    expect(
      toClientFriendlyApiError(429, {
        error: "Too many wrong PIN attempts. Try again in 45 mins.",
      })
    ).toBe("Too many wrong PIN attempts. Try again in 45 mins.");
  });
});
