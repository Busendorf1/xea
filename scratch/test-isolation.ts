import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function runTests() {
  console.log("🧪 Testing Database Client Routing & Isolation...");

  // 1. Load clients
  const { supabaseAdmin, supabaseReadOnly } = await import("../lib/utils/dbAdmin");

  console.log("🔍 Checking supabaseReadOnly client...");
  if (!supabaseReadOnly) {
    throw new Error("supabaseReadOnly is not defined!");
  }

  const hasReplicaEnv = !!(process.env.SUPABASE_READONLY_URL && process.env.SUPABASE_READONLY_SERVICE_ROLE_KEY);
  
  if (hasReplicaEnv) {
    console.log("✅ Replica environment variables found.");
    if (supabaseReadOnly === supabaseAdmin) {
      throw new Error("FAIL: supabaseReadOnly equals supabaseAdmin despite replica credentials being set.");
    }
    console.log("✅ Verified supabaseReadOnly is instantiated as a separate replica client.");
  } else {
    console.log("ℹ️ No replica environment variables set (standard local configuration).");
    if (supabaseReadOnly !== supabaseAdmin) {
      throw new Error("FAIL: supabaseReadOnly should fall back to supabaseAdmin when replica credentials are not set.");
    }
    console.log("✅ Verified supabaseReadOnly correctly falls back to supabaseAdmin (Primary).");
  }

  // 2. Perform mock read using supabaseReadOnly
  console.log("🔄 Performing read query using supabaseReadOnly...");
  const { data, error } = await supabaseReadOnly.from("users").select("email").limit(1);
  if (error) {
    throw new Error(`Read query failed: ${error.message}`);
  }
  console.log("✅ Read query executed successfully. Sample user retrieved:", data);

  console.log("\n🎉 ALL DATABASE CLIENT ISOLATION TESTS PASSED! 🎉");
  process.exit(0);
}

runTests().catch(err => {
  console.error("\n❌ TESTS FAILED:", err);
  process.exit(1);
});
