const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env.local");
let supabaseUrl = "";
let supabaseKey = "";

try {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const parts = trimmed.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
        if (key === "NEXT_PUBLIC_SUPABASE_URL") {
          supabaseUrl = value;
        } else if (key === "SUPABASE_SERVICE_ROLE_KEY" || (!supabaseKey && key === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
          supabaseKey = value;
        }
      }
    }
  });
} catch (e) {
  console.error("Error reading .env.local:", e.message);
}

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupSimulatedData() {
  console.log("🧹 Starting Cleanup of Simulated Test Data...");

  // 1. Delete simulated ads
  const { error: adErr, count: adCount } = await supabase
    .from("adds")
    .delete({ count: "exact" })
    .ilike("user_email", "%@sim.paayh.com");

  if (adErr) console.warn("⚠️ Warning deleting simulated ads:", adErr.message);
  else console.log(`🗑️ Deleted simulated ads.`);

  // 2. Delete simulated highlights
  const { error: hlErr } = await supabase
    .from("newsactive")
    .delete({ count: "exact" })
    .ilike("user_email", "%@sim.paayh.com");

  if (hlErr) console.warn("⚠️ Warning deleting simulated highlights:", hlErr.message);
  else console.log(`🗑️ Deleted simulated highlights.`);

  // 3. Delete simulated user accounts
  const { error: uErr } = await supabase
    .from("users")
    .delete({ count: "exact" })
    .ilike("email", "%@sim.paayh.com");

  if (uErr) console.warn("⚠️ Warning deleting simulated users:", uErr.message);
  else console.log(`🗑️ Deleted simulated user accounts.`);

  console.log("✅ Cleanup finished! All simulated records have been purged cleanly.");
}

cleanupSimulatedData().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
