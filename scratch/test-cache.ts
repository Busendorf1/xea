import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// Verifying that REDIS_URL is successfully loaded
console.log("📍 Target Redis Host:", process.env.REDIS_HOST);

async function runTests() {
  // Dynamically import cache and redis after env is loaded
  const { getCachedProfile, setCachedProfile, invalidateCachedProfile } = await import("../lib/utils/cache");
  const { default: redisConnection } = await import("../lib/redis");

  console.log("🧪 Starting Redis Caching & Invalidation tests...");
  
  const testEmail = "test_user_cache_123@xea.com";
  const dummyProfile = {
    id: "dummy-uuid-12345",
    username: "cachetestuser",
    firstName: "Test",
    lastName: "User",
    email: testEmail,
    balance: 50000.75,
    monetized: true,
    interest: ["Tech", "Finance", "Gaming"]
  };

  try {
    // 1. Ensure cache is empty initially
    console.log("🧹 Clearing initial cache state...");
    await invalidateCachedProfile(testEmail);
    const initialCheck = await getCachedProfile(testEmail);
    if (initialCheck === null) {
      console.log("✅ Initial state is clean.");
    } else {
      throw new Error("Initial state was not empty");
    }

    // 2. Set profile cache
    console.log("💾 Writing dummy profile to cache...");
    await setCachedProfile(testEmail, dummyProfile);
    console.log("✅ Profile cached successfully.");

    // 3. Read profile cache (Cache Hit verification)
    console.log("🔍 Fetching profile from cache...");
    const cachedData = await getCachedProfile(testEmail);
    if (cachedData && cachedData.email === testEmail && cachedData.balance === 50000.75) {
      console.log("✅ Profile cache hit verified! Data matches perfectly:", cachedData);
    } else {
      throw new Error(`Profile cache hit data mismatch or empty: ${JSON.stringify(cachedData)}`);
    }

    // 4. Invalidate profile cache
    console.log("🧹 Invalidating cache...");
    await invalidateCachedProfile(testEmail);
    console.log("✅ Cache invalidation command sent.");

    // 5. Verify cache is empty after invalidation
    console.log("🔍 Fetching profile after invalidation...");
    const postInvalidateCheck = await getCachedProfile(testEmail);
    if (postInvalidateCheck === null) {
      console.log("✅ Cache invalidation verified! Cache is now empty.");
    } else {
      throw new Error(`Profile was still found in cache after invalidation: ${JSON.stringify(postInvalidateCheck)}`);
    }

    console.log("\n🎉 ALL REDIS CACHING TESTS PASSED SUCCESSFULLY! 🎉");
  } catch (err: any) {
    console.error("\n❌ CACHING TESTS FAILED:", err.message || err);
  } finally {
    // Close redis connection to allow script to exit cleanly
    console.log("🔌 Disconnecting from Redis...");
    await redisConnection.quit();
    process.exit(0);
  }
}

runTests();
