const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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
        } else if (key === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
          supabaseKey = value;
        }
      }
    }
  });
} catch (e) {
  console.error(e);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: ads, error: adError } = await supabase.from('adds').select('*').limit(1);
  const { data: users, error: userError } = await supabase.from('users').select('*').limit(1);

  console.log("Supabase URL:", supabaseUrl);
  console.log("Supabase Key:", supabaseKey);
  console.log("Ad query error:", adError);
  console.log("User query error:", userError);
  if (ads) console.log("Ads count:", ads.length);
  if (users) console.log("Users count:", users.length);

  // Also try with the fallback key in lib/utils/db.js
  const fallbackKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkZ2FvZ25tbmZzaXd2dnF2eGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDMxNzEsImV4cCI6MjA4OTYxOTE3MX0.21AOR9PKcxY55oAm-YLzTleQQQ2fFfI4WQ00--H4al4";
  console.log("\nTesting with fallback key...");
  const fallbackClient = createClient(supabaseUrl, fallbackKey);
  const { data: fbUsers, error: fbError } = await fallbackClient.from('users').select('*').limit(1);
  console.log("Fallback Key User query error:", fbError);
  if (fbUsers) console.log("Fallback Key Users count:", fbUsers.length);
}

check();
