const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Parse env
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
  const testEmail = `test-limit-${Date.now()}@example.com`;
  console.log(`Using test email: ${testEmail}`);

  // 1. Initial check - should have no ticket
  const { data: firstCheck, error: err1 } = await supabase
    .from('help_tickets')
    .select('created_at')
    .eq('user_email', testEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (err1) {
    console.error("Error during first check:", err1);
    return;
  }
  console.log("First check (should be null):", firstCheck);

  // 2. Insert first ticket
  console.log("Inserting first ticket...");
  const { error: insertErr } = await supabase
    .from('help_tickets')
    .insert([
      {
        user_email: testEmail,
        name: "Test User",
        category: "Bug Report",
        subject: "Test Subject",
        message: "This is a test message that needs to be at least twenty characters long.",
        status: "open"
      }
    ]);

  if (insertErr) {
    console.error("Error inserting ticket:", insertErr);
    return;
  }
  console.log("First ticket inserted successfully.");

  // 3. Second check - should find a ticket and detect rate limit
  const { data: secondCheck, error: err2 } = await supabase
    .from('help_tickets')
    .select('created_at')
    .eq('user_email', testEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (err2) {
    console.error("Error during second check:", err2);
    return;
  }

  console.log("Second check data:", secondCheck);

  if (secondCheck) {
    const lastSubmitted = new Date(secondCheck.created_at).getTime();
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    const isRateLimited = lastSubmitted > fortyEightHoursAgo;
    console.log(`Is rate limited (expected true): ${isRateLimited}`);

    const remainingMs = lastSubmitted - fortyEightHoursAgo;
    const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
    console.log(`Remaining hours (expected 48): ${remainingHours}`);
  } else {
    console.error("Failed to find the inserted ticket.");
  }

  // 4. Cleanup
  console.log("Cleaning up test ticket...");
  const { error: deleteErr } = await supabase
    .from('help_tickets')
    .delete()
    .eq('user_email', testEmail);

  if (deleteErr) {
    console.error("Error deleting test ticket:", deleteErr);
  } else {
    console.log("Cleanup completed successfully.");
  }
}

runTest();
