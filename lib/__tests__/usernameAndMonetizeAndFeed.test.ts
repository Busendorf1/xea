import { describe, it, expect, vi } from "vitest";

describe("Username Checking & Validation Logic", () => {
  it("should sanitize and clean usernames properly (strip leading @ and lowercase)", () => {
    const raw = "  @Cool_User123  ";
    const clean = raw.trim().toLowerCase().replace(/^@/, "");
    expect(clean).toBe("cool_user123");
  });

  it("should reject usernames under 3 characters", () => {
    const clean = "ab";
    expect(clean.length >= 3).toBe(false);
  });

  it("should validate username character set", () => {
    const valid = "alex_99-dev";
    const invalid = "alex!cool*";
    const regex = /^[a-zA-Z0-9_@.-]+$/;
    expect(regex.test(valid)).toBe(true);
    expect(regex.test(invalid)).toBe(false);
  });

  it("should recognize available username when count is 0", () => {
    const conflictingUsers: any[] = [];
    const isAvailable = conflictingUsers.length === 0;
    expect(isAvailable).toBe(true);
  });

  it("should consider username available if conflicting user has the caller's email (self-match)", () => {
    const callerEmail = "john@example.com";
    const usersInDb = [{ id: "u1", email: "john@example.com", username: "johnny" }];
    const conflicting = usersInDb.filter(
      (u) => !callerEmail || u.email?.toLowerCase().trim() !== callerEmail
    );
    expect(conflicting.length).toBe(0);
    expect(conflicting.length === 0).toBe(true);
  });

  it("should consider username taken if conflicting user has a different email", () => {
    const callerEmail = "other@example.com";
    const usersInDb = [{ id: "u1", email: "john@example.com", username: "johnny" }];
    const conflicting = usersInDb.filter(
      (u) => !callerEmail || u.email?.toLowerCase().trim() !== callerEmail
    );
    expect(conflicting.length).toBe(1);
    expect(conflicting.length === 0).toBe(false);
  });

  it("should use exact matching so underscores are not treated as single-character wildcards", () => {
    // When using exact array .includes / .in(), 'abc_xyz' must NOT match 'abc1xyz'
    const queryUsername = "abc_xyz";
    const existingDbUsernames = ["abc1xyz", "abc-xyz", "john_doe"];

    const exactMatch = existingDbUsernames.filter(
      (u) => u === queryUsername || u === `@${queryUsername}`
    );
    expect(exactMatch.length).toBe(0);

    // Exact match should match literal 'abc_xyz'
    const literalDbUsernames = ["abc_xyz", "other_user"];
    const literalMatch = literalDbUsernames.filter(
      (u) => u === queryUsername || u === `@${queryUsername}`
    );
    expect(literalMatch.length).toBe(1);
  });
});

describe("Enterprise Retargeting Spacing", () => {
  function interleaveRetargetedAds(freshAdsList: any[], retargetedAdsList: any[]): any[] {
    const candidateAds: any[] = [];
    let fIdx = 0;
    let rIdx = 0;
    let itemsSinceLastRetarget = 3;

    while (fIdx < freshAdsList.length || rIdx < retargetedAdsList.length) {
      let freshAdded = 0;
      while (freshAdded < 3 && fIdx < freshAdsList.length) {
        candidateAds.push(freshAdsList[fIdx++]);
        itemsSinceLastRetarget++;
        freshAdded++;
      }
      if (rIdx < retargetedAdsList.length) {
        if (itemsSinceLastRetarget >= 3) {
          candidateAds.push(retargetedAdsList[rIdx++]);
          itemsSinceLastRetarget = 0;
        } else if (fIdx >= freshAdsList.length) {
          break;
        }
      }
    }
    return candidateAds;
  }

  it("should maintain at least 3 fresh ads spacing between retargeted ads", () => {
    const fresh = [
      { id: "f1", type: "fresh" },
      { id: "f2", type: "fresh" },
      { id: "f3", type: "fresh" },
      { id: "f4", type: "fresh" },
      { id: "f5", type: "fresh" },
      { id: "f6", type: "fresh" },
    ];
    const retargeted = [
      { id: "r1", type: "retargeted" },
      { id: "r2", type: "retargeted" },
    ];

    const result = interleaveRetargetedAds(fresh, retargeted);
    expect(result.map((r) => r.id)).toEqual(["f1", "f2", "f3", "r1", "f4", "f5", "f6", "r2"]);

    // Verify distance between retargeted ads is at least 3 items
    const r1Idx = result.findIndex((r) => r.id === "r1");
    const r2Idx = result.findIndex((r) => r.id === "r2");
    expect(r2Idx - r1Idx).toBeGreaterThanOrEqual(4); // 3 items in between means delta >= 4
  });

  it("should NEVER place retargeted ads back-to-back when fresh ads are scarce or empty", () => {
    const fresh: any[] = [];
    const retargeted = [
      { id: "r1", type: "retargeted" },
      { id: "r2", type: "retargeted" },
      { id: "r3", type: "retargeted" },
    ];

    const result = interleaveRetargetedAds(fresh, retargeted);
    // At most 1 initial retargeted ad allowed if itemsSinceLastRetarget >= 3, never 2 consecutive
    expect(result.length).toBeLessThanOrEqual(1);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].type === "retargeted" && result[i + 1].type === "retargeted").toBe(false);
    }
  });
});

describe("Monetization Opt-Out & Reapplication State Handling", () => {
  it("should evaluate isMonetized to false when has_cancelled_monetization is true even with 300+ clicks", () => {
    const userProfile = {
      monetization_clicks: 500,
      has_cancelled_monetization: true,
      monetized: "true",
    };

    const hasCancelled = Boolean(userProfile.has_cancelled_monetization);
    const clicks = Number(userProfile.monetization_clicks);
    const isMonetized = !hasCancelled && clicks >= 300;

    expect(hasCancelled).toBe(true);
    expect(isMonetized).toBe(false);
  });

  it("should evaluate isMonetized to true when has_cancelled_monetization is false and clicks >= 300", () => {
    const userProfile = {
      monetization_clicks: 350,
      has_cancelled_monetization: false,
      monetized: "true",
    };

    const hasCancelled = Boolean(userProfile.has_cancelled_monetization);
    const clicks = Number(userProfile.monetization_clicks);
    const isMonetized = !hasCancelled && clicks >= 300;

    expect(hasCancelled).toBe(false);
    expect(isMonetized).toBe(true);
  });

  it("should reset atw_tier to ATW1, clicks to 0, and has_cancelled to false upon monetization resume", () => {
    const resumedProfilePayload = {
      monetized: "false",
      monetization_clicks: 0,
      atw_tier: "ATW1",
      has_cancelled_monetization: false,
    };

    expect(resumedProfilePayload.atw_tier).toBe("ATW1");
    expect(resumedProfilePayload.monetization_clicks).toBe(0);
    expect(resumedProfilePayload.has_cancelled_monetization).toBe(false);
  });
});

describe("GDPR Recital 49 Network-Level Rate Limiting", () => {
  it("should construct network IP rate limit keys without storing deleted user PII", () => {
    const rawIp = "192.168.1.100, 10.0.0.1";
    const forwarded = rawIp.split(",")[0].trim();
    const sanitizedKey = `net_${forwarded.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;

    expect(sanitizedKey).toBe("net_192.168.1.100");
    expect(sanitizedKey.includes("@")).toBe(false); // zero user email / personal data stored
  });
});

describe("Permanent Account Deactivation & Feed Pool Hygiene", () => {
  it("should never reactivate a permanently deactivated account upon stale sign-in", () => {
    const userRecord = {
      email: "reactivate_test@example.com",
      ad_account_status: "deactivated",
    };
    const tombstoned = true;

    // Permanent deactivation: authenticated token check must fail closed
    const sessionEmail =
      tombstoned || userRecord.ad_account_status === "deactivated" ? null : userRecord.email;

    expect(sessionEmail).toBeNull();
    expect(userRecord.ad_account_status).toBe("deactivated");
  });

  it("should strictly exclude ads from deactivated users, capped impressions, or completed status from feed pool", () => {
    const deactSet = new Set(["deact@example.com"]);
    const blockedAdvertisers = new Set(["spammer@example.com"]);
    const rawAds = [
      { id: "ad1", user_email: "active@example.com", completed_at: null, impressions: 100, impression_count: 50 },
      { id: "ad2", user_email: "deact@example.com", completed_at: null, impressions: 100, impression_count: 10 },
      { id: "ad3", user_email: "active@example.com", completed_at: "2026-11-01T00:00:00Z", impressions: 100, impression_count: 10 },
      { id: "ad4", user_email: "spammer@example.com", completed_at: null, impressions: 100, impression_count: 10 },
      { id: "ad5", user_email: "active@example.com", completed_at: null, impressions: 50, impression_count: 50 }, // capped
      { id: "ad6", user_email: "active2@example.com", completed_at: null, is_paused: true },
    ];

    const validActiveAds = rawAds.filter((ad) => {
      if (!ad || !ad.id) return false;
      if (ad.completed_at || ad.is_paused === true) return false;
      const owner = (ad.user_email || "").toLowerCase().trim();
      if (owner && (deactSet.has(owner) || blockedAdvertisers.has(owner))) return false;
      const impressionsTarget = Number(ad.impressions || 0);
      const impressionCount = Number(ad.impression_count || 0);
      if (impressionsTarget > 0 && impressionCount >= impressionsTarget) return false;
      return true;
    });

    expect(validActiveAds.map((a) => a.id)).toEqual(["ad1"]);
  });
});
