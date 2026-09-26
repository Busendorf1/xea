import { describe, it, expect } from "vitest";

describe("Monetization Click Progress & Free Monetization Thresholds", () => {
  it("should accurately calculate clicksRemaining and isMonetized status", () => {
    const target = 300;
    
    // Initial state
    const initialClicks = 0;
    expect(Math.max(0, target - initialClicks)).toBe(300);
    expect(initialClicks >= target).toBe(false);

    // Intermediate state (e.g. 181 clicks)
    const currentClicks = 181;
    expect(Math.max(0, target - currentClicks)).toBe(119);
    expect(currentClicks >= target).toBe(false);

    // Incrementing by 1
    const nextClicks = currentClicks + 1;
    expect(nextClicks).toBe(182);
    expect(Math.max(0, target - nextClicks)).toBe(118);

    // Threshold reach at 300
    const thresholdClicks = 300;
    expect(Math.max(0, target - thresholdClicks)).toBe(0);
    expect(thresholdClicks >= target).toBe(true);

    // Beyond threshold
    const overClicks = 350;
    expect(Math.max(0, target - overClicks)).toBe(0);
    expect(overClicks >= target).toBe(true);
  });

  it("should distinguish paid ads from unpaid platform posts for monetization progress", () => {
    const isPlatformPost = (ad: {
      is_admin_post?: boolean;
      cost_per_impression?: number | string | null;
      impressions?: number | string | null;
    }) => {
      return Boolean(
        ad.is_admin_post ||
        !ad.cost_per_impression ||
        Number(ad.cost_per_impression) <= 0 ||
        !ad.impressions ||
        Number(ad.impressions) <= 0
      );
    };

    // Paid sponsored ad: should earn click progress
    const sponsoredAd = {
      is_admin_post: false,
      cost_per_impression: 25,
      impressions: 1000,
    };
    expect(isPlatformPost(sponsoredAd)).toBe(false);

    // Platform administrative broadcast: should NOT earn click progress
    const adminAd = {
      is_admin_post: true,
      cost_per_impression: 0,
      impressions: 1000,
    };
    expect(isPlatformPost(adminAd)).toBe(true);

    // Zero-budget ad
    const zeroBudgetAd = {
      is_admin_post: false,
      cost_per_impression: 0,
      impressions: 0,
    };
    expect(isPlatformPost(zeroBudgetAd)).toBe(true);
  });
});
