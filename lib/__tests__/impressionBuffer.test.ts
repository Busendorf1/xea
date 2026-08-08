import { describe, it, expect, vi, beforeEach } from "vitest";
import { bufferAdImpression, bufferAdClick, flushImpressionBuffersToDB } from "../impressionBuffer";
import redisConnection from "../redis";
import supabaseAdmin from "../utils/dbAdmin";

// Mock dependencies
vi.mock("../redis", () => ({
  default: {
    status: "ready",
    hincrby: vi.fn().mockResolvedValue(1),
    eval: vi.fn(),
  },
}));

vi.mock("../utils/dbAdmin", () => ({
  default: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { impression_count: 5 }, error: null }),
        }),
      }),
    }),
  },
}));

describe("Impression Buffer Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("bufferAdImpression", () => {
    it("should write impression to Redis hash when Redis is ready", async () => {
      await bufferAdImpression("ad-123");
      expect(redisConnection.hincrby).toHaveBeenCalledWith("buffer:ad_impressions", "ad-123", 1);
    });

    it("should fall back to Supabase DB RPC when Redis throws an error", async () => {
      (redisConnection.hincrby as any).mockRejectedValueOnce(new Error("Redis offline"));

      await bufferAdImpression("ad-456");

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith("increment_ad_impression", { p_ad_id: "ad-456" });
    });
  });

  describe("bufferAdClick", () => {
    it("should write phone click to Redis hash key buffer:clicks_phone", async () => {
      await bufferAdClick("ad-789", "phone");
      expect(redisConnection.hincrby).toHaveBeenCalledWith("buffer:clicks_phone", "ad-789", 1);
    });

    it("should write website click to Redis hash key buffer:clicks_website", async () => {
      await bufferAdClick("ad-789", "website");
      expect(redisConnection.hincrby).toHaveBeenCalledWith("buffer:clicks_website", "ad-789", 1);
    });
  });

  describe("flushImpressionBuffersToDB", () => {
    it("should execute Lua script and flush impression batches to PostgreSQL RPC", async () => {
      // Mock Lua return for impressions: ["ad-101", "5"]
      (redisConnection.eval as any).mockImplementation((script: string, numKeys: number, key: string) => {
        if (key === "buffer:ad_impressions") {
          return Promise.resolve(["ad-101", "5"]);
        }
        return Promise.resolve([]);
      });

      const result = await flushImpressionBuffersToDB();

      expect(result.flushedImpressions).toBe(5);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith("increment_ad_impressions_bulk", {
        p_ad_id: "ad-101",
        p_count: 5,
      });
    });
  });
});
