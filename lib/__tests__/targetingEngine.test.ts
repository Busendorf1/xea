import { describe, it, expect } from "vitest";
import {
  evaluateAdTargeting,
  rankAndFilterTargetedAds,
  spaceFeedAdsByAdvertiser,
  signAdImpressionToken,
  normalizeLocationToken,
  normalizeGender,
  matchesAgeRange,
  ViewerTargetingProfile,
  TargetableAd,
} from "../targetingEngine";

describe("targetingEngine", () => {
  const baseViewer: ViewerTargetingProfile = {
    email: "viewer@example.com",
    country: "Nigeria",
    state: "Lagos State",
    gender: "Female",
    dob: "1996-05-15", // ~30 years old
    employment_status: "Self-Employed",
    interest: ["Technology", "FinTech", "E-Commerce"],
    industry: ["Finance & Banking"],
    behavior: ["Online Shopper"],
    lifestyle: ["Urban Professional"],
    personality: ["Analytical"],
  };

  describe("normalizeLocationToken & normalizeGender", () => {
    it("normalizes state and province suffixes accurately", () => {
      expect(normalizeLocationToken("Lagos State")).toBe("lagos");
      expect(normalizeLocationToken("Ontario Province")).toBe("ontario");
      expect(normalizeLocationToken("Abuja FCT")).toBe("fct");
      expect(normalizeLocationToken("Federal Capital Territory")).toBe("fct");
    });

    it("normalizes gender synonyms accurately", () => {
      expect(normalizeGender("M")).toBe("male");
      expect(normalizeGender("Male")).toBe("male");
      expect(normalizeGender("F")).toBe("female");
      expect(normalizeGender("Woman")).toBe("female");
      expect(normalizeGender("All")).toBe("all");
    });
  });

  describe("matchesAgeRange", () => {
    it("matches standard and open-ended age brackets as well as [min, max] numeric tuples from Step2Budget", () => {
      expect(matchesAgeRange(30, ["25-34"])).toBe(true);
      expect(matchesAgeRange(30, ["18-24"])).toBe(false);
      expect(matchesAgeRange(60, ["55+"])).toBe(true);
      expect(matchesAgeRange(22, ["All"])).toBe(true);
      expect(matchesAgeRange(30, [25, 40])).toBe(true);
      expect(matchesAgeRange(20, [25, 40])).toBe(false);
      expect(matchesAgeRange(30, "{18,65}")).toBe(true);
    });
  });

  describe("LocationSelector multiLocations & viewer.employment alignment", () => {
    it("matches LocationSelector multiLocations string in province and viewer.employment", () => {
      const regViewer: ViewerTargetingProfile = {
        email: "registered@example.com",
        country: "Nigeria",
        state: "Lagos",
        location: "Ikeja",
        gender: "Male",
        dob: "1998-01-01",
        employment: "Full-Time",
        interest: ["Technology"],
      };

      const multiLocAd: TargetableAd = {
        id: "ad-multiloc",
        user_email: "brand@example.com",
        country: "Nigeria",
        state: "Lagos",
        province: "Ikeja, Lagos, Nigeria; Wuse, FCT, Nigeria",
        employment_status: "Full-Time",
        age_range: [18, 35],
        interest: ["Technology"],
        impressions: 500,
        impression_count: 10,
      };

      const res = evaluateAdTargeting(multiLocAd, regViewer);
      expect(res.matches).toBe(true);
      expect(res.isStrictMatch).toBe(true);
    });
  });

  describe("evaluateAdTargeting", () => {
    it("strictly matches an ad whose demographic, geographic, and psychographic criteria match the viewer", () => {
      const matchingAd: TargetableAd = {
        id: "ad-match-1",
        user_email: "advertiser@example.com",
        country: "Nigeria",
        state: ["Lagos"],
        gender: ["Female"],
        age_range: ["25-34"],
        employment_status: ["Self-Employed"],
        interest: ["fintech"], // case-insensitive match with "FinTech"
        industry: ["finance & banking"],
        impressions: 1000,
        view_count: 100,
      };

      const res = evaluateAdTargeting(matchingAd, baseViewer);
      expect(res.matches).toBe(true);
      expect(res.isStrictMatch).toBe(true);
      expect(res.matchedDimensions).toContain("country");
      expect(res.matchedDimensions).toContain("state");
      expect(res.matchedDimensions).toContain("gender");
      expect(res.matchedDimensions).toContain("age_range");
      expect(res.matchedDimensions).toContain("interest");
    });

    it("rejects ads targeting a different country", () => {
      const ghanaAd: TargetableAd = {
        id: "ad-ghana",
        user_email: "advertiser@example.com",
        country: "Ghana",
        impressions: 1000,
        view_count: 10,
      };

      const res = evaluateAdTargeting(ghanaAd, baseViewer);
      expect(res.matches).toBe(false);
      expect(res.reason).toBe("country_mismatch");
    });

    it("rejects ads targeting a different state even if country matches", () => {
      const riversAd: TargetableAd = {
        id: "ad-rivers",
        user_email: "advertiser@example.com",
        country: "Nigeria",
        state: ["Rivers State", "Kano"],
        impressions: 1000,
        view_count: 10,
      };

      const res = evaluateAdTargeting(riversAd, baseViewer);
      expect(res.matches).toBe(false);
      expect(res.reason).toBe("state_mismatch");
    });

    it("rejects rollover ads from bypassing state or gender targeting", () => {
      const expiredRiversAd: TargetableAd = {
        id: "ad-rollover-rivers",
        user_email: "advertiser@example.com",
        country: "Nigeria",
        state: ["Rivers"],
        gender: ["Male"],
        campaign_days: 3,
        created_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
        impressions: 1000,
        view_count: 50,
      };

      const res = evaluateAdTargeting(expiredRiversAd, baseViewer, { allowRolloverPsychographics: true });
      expect(res.matches).toBe(false);
      expect(res.reason).toBe("state_mismatch");
    });

    it("rejects ads created by the viewer themselves (self-ad exclusion)", () => {
      const ownAd: TargetableAd = {
        id: "ad-own",
        user_email: "viewer@example.com",
        country: "Nigeria",
        impressions: 1000,
        view_count: 0,
      };

      const res = evaluateAdTargeting(ownAd, baseViewer);
      expect(res.matches).toBe(false);
      expect(res.reason).toBe("own_ad");
    });

    it("rejects paused or exhausted ads", () => {
      const pausedAd: TargetableAd = {
        id: "ad-paused",
        user_email: "advertiser@example.com",
        is_paused: true,
        impressions: 1000,
        view_count: 10,
      };
      expect(evaluateAdTargeting(pausedAd, baseViewer).matches).toBe(false);

      const exhaustedAd: TargetableAd = {
        id: "ad-exhausted",
        user_email: "advertiser@example.com",
        impressions: 500,
        view_count: 500,
      };
      expect(evaluateAdTargeting(exhaustedAd, baseViewer).matches).toBe(false);
    });
  });

  describe("rankAndFilterTargetedAds & spaceFeedAdsByAdvertiser", () => {
    it("filters out non-matching ads and ranks higher-relevance + higher-bid ads first", () => {
      const ads: TargetableAd[] = [
        {
          id: "wrong-gender",
          user_email: "adv1@example.com",
          country: "Nigeria",
          gender: ["Male"],
          impressions: 1000,
          view_count: 0,
        },
        {
          id: "broad-nigeria",
          user_email: "adv2@example.com",
          country: "Nigeria",
          cost_per_impression: 15,
          impressions: 1000,
          view_count: 0,
        },
        {
          id: "hyper-targeted-lagos-female-fintech",
          user_email: "adv3@example.com",
          country: "Nigeria",
          state: ["Lagos"],
          gender: ["Female"],
          age_range: ["25-34"],
          interest: ["FinTech", "Technology"],
          industry: ["Finance & Banking"],
          ad_type: "boost",
          cost_per_impression: 50,
          impressions: 1000,
          view_count: 0,
        },
      ];

      const ranked = rankAndFilterTargetedAds(ads, baseViewer);
      expect(ranked.map((a) => a.id)).toEqual([
        "hyper-targeted-lagos-female-fintech",
        "broad-nigeria",
      ]);
    });

    it("spaces ads from the same advertiser so they do not appear back-to-back", () => {
      const list: TargetableAd[] = [
        { id: "a1", user_email: "same@brand.com" },
        { id: "a2", user_email: "same@brand.com" },
        { id: "b1", user_email: "other1@brand.com" },
        { id: "c1", user_email: "other2@brand.com" },
      ];
      const spaced = spaceFeedAdsByAdvertiser(list, 2);
      expect(spaced.map((a) => a.id)).toEqual(["a1", "b1", "c1", "a2"]);
    });
  });

  describe("signAdImpressionToken", () => {
    it("produces deterministic 64-char hex HMAC-SHA256 signatures", () => {
      const token1 = signAdImpressionToken("ad-123", "Viewer@Example.com", 1700000000000);
      const token2 = signAdImpressionToken("ad-123", "viewer@example.com", 1700000000000);
      expect(token1).toHaveLength(64);
      expect(token1).toBe(token2);
    });
  });
});
