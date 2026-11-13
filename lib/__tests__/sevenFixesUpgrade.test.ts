import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildAdShareUrl,
  decodeSharedAdParam,
  extractSharedAdIdFromSearchParams,
} from "../utils/adShare";
import { resolvePublicAdAvailability } from "../ads/publicAdResolver";

describe("7-Item Cross-Platform Upgrade Verification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("keeps all Vercel cron schedules compliant with Hobby daily limits", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
    const parsed = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> };
    expect(Array.isArray(parsed.crons)).toBe(true);
    expect(parsed.crons!.length).toBeGreaterThanOrEqual(4);

    for (const cron of parsed.crons!) {
      // Standard 5-field daily cron: `<minute> <hour> * * *` with fixed numeric minute & hour
      expect(cron.schedule).toMatch(/^\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\*$/);
    }
  });

  it("decodes short, UUID, and legacy shared ad URLs without spurious 404 rejections", async () => {
    expect(decodeSharedAdParam("1")).toBe("1");
    expect(decodeSharedAdParam("a9")).toBe("a9");
    expect(decodeSharedAdParam("MTIzNA==")).toBe("1234");
    expect(decodeSharedAdParam("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    );
    expect(decodeSharedAdParam("bad id with spaces")).toBeNull();
    expect(decodeSharedAdParam("")).toBeNull();

    const params = new URLSearchParams({
      view: "",
      "Earn Ads by Paayh": "ab",
    });
    expect(extractSharedAdIdFromSearchParams(params)).toBe("ab");

    expect(buildAdShareUrl("ab", "https://www.paayh.com")).toBe("https://www.paayh.com/ad/ab");
    const unavailable = await resolvePublicAdAvailability(" ");
    expect(unavailable).toEqual({ available: false, reason: "invalid_id" });
  });

  it("sends warm congratulatory notifications for 300-click monetization unlock and ATW upgrades, skipping opted-out/exempt users", async () => {
    const insertedRows: Array<Record<string, unknown>> = [];
    const redisSet = vi.fn(async () => "OK");
    const redisDel = vi.fn(async () => 1);
    const dispatchWebhook = vi.fn(async () => {});

    vi.doMock("@/lib/redis", () => ({
      default: { set: redisSet, del: redisDel },
      isRedisReady: () => true,
    }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchNotificationWebhook: dispatchWebhook,
    }));
    vi.doMock("@/lib/attentionTierEngine", () => import("../attentionTierEngine"));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          insert: vi.fn((rows: Array<Record<string, unknown>>) => {
            insertedRows.push(...rows);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "notif-1",
                    ...rows[0],
                    created_at: "2026-11-13T00:00:00Z",
                  },
                  error: null,
                })),
              })),
            };
          }),
        })),
      },
    }));

    const {
      checkAndNotifyClickAndAtwMilestones,
      parseNumericAtwLevel,
    } = await import("../notifications/milestoneNotifications");

    expect(parseNumericAtwLevel("ATW4")).toBe(4);
    expect(parseNumericAtwLevel("Unlimited")).toBe(14);
    expect(parseNumericAtwLevel(null)).toBe(1);

    // 1. User crosses 300 clicks & unlocks monetization (still ATW1) -> warm congratulatory message
    await checkAndNotifyClickAndAtwMilestones({
      email: "User@Paayh.com",
      prevClicks: 299,
      prevMonetized: false,
      prevAtwTier: "ATW1",
      nextClicks: 300,
      nextMonetized: true,
      nextAtwTier: "ATW1",
      attentionWorthScore: 0,
    });

    expect(insertedRows).toHaveLength(1);
    expect(String(insertedRows[0].title)).toContain("Monetization Unlocked");
    expect(String(insertedRows[0].message)).toContain("300 clicks");
    expect(String(insertedRows[0].message).toLowerCase()).toContain("withdraw");

    // 2. User upgrades from ATW1 to ATW3 (600 clicks + 1.1 score => 900 effective clicks) -> notifies with tier code, balance cap & withdrawal reminder
    await checkAndNotifyClickAndAtwMilestones({
      email: "user@paayh.com",
      prevClicks: 599,
      prevMonetized: true,
      prevAtwTier: "ATW1",
      nextClicks: 600,
      nextMonetized: true,
      nextAtwTier: "ATW3",
      attentionWorthScore: 1.1,
    });

    expect(insertedRows).toHaveLength(2);
    expect(String(insertedRows[1].title)).toContain("ATW3");
    expect(String(insertedRows[1].message)).toContain("₦90,000");
    expect(String(insertedRows[1].message).toLowerCase()).toContain("withdraw");

    // 3. Opted-out / exempt users never receive milestone notifications
    await checkAndNotifyClickAndAtwMilestones({
      email: "optedout@paayh.com",
      prevClicks: 299,
      prevMonetized: false,
      nextClicks: 300,
      nextMonetized: true,
      hasCancelled: true,
    });
    await checkAndNotifyClickAndAtwMilestones({
      email: "admin@paayh.com",
      prevClicks: 299,
      prevMonetized: false,
      nextClicks: 300,
      nextMonetized: true,
      isExempt: true,
    });

    expect(insertedRows).toHaveLength(2);
  });
});
