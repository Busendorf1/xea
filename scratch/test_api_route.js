const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Parse env for cleanup
const envPath = 'c:/Users/USER/xea/.env.local';
let supabaseUrl = '';
let supabaseKey = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
          supabaseUrl = value;
        } else if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
          supabaseKey = value;
        } else if (!supabaseKey && key === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
          supabaseKey = value;
        }
      }
    }
  });
} catch (e) {
  console.error(e);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  const testEmail = `test-api-${Date.now()}@example.com`;
  console.log(`Using test email: ${testEmail}`);

  const payload = {
    name: "Test API Route",
    email: testEmail,
    category: "Bug Report",
    subject: "Test API Subject",
    message: "This is a long enough message to pass validation checks and enter the DB."
  };

  try {
    // 1. Submit first time (should succeed)
    console.log("Sending first request...");
    const res1 = await fetch("http://localhost:3000/api/helpcenter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("First Response status:", res1.status);
    const data1 = await res1.json();
    console.log("First Response body:", data1);

    if (res1.status !== 200) {
      throw new Error("First submission failed unexpectedly.");
    }

    // 2. Submit second time (should be rate-limited)
    console.log("Sending second request...");
    const res2 = await fetch("http://localhost:3000/api/helpcenter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("Second Response status (expect 429):", res2.status);
    const data2 = await res2.json();
    console.log("Second Response body:", data2);

    if (res2.status !== 429) {
      throw new Error(`Expected status 429, got ${res2.status}`);
    }
    console.log("✅ API Route test succeeded!");

  } catch (err) {
    console.error("❌ Test failed:", err.message || err);
  } finally {
    // Cleanup
    console.log("Cleaning up test ticket...");
    const { error } = await supabase
      .from('help_tickets')
      .delete()
      .eq('user_email', testEmail);
    if (error) {
      console.error("Cleanup error:", error);
    } else {
      console.log("Cleanup complete.");
    }
  }
}

runTest();
