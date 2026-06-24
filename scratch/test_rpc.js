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
  console.error("Error reading env:", e);
}

// Fallback to local default publishable key
if (!supabaseKey) {
  supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkZ2FvZ25tbmZzaXd2dnF2eGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDMxNzEsImV4cCI6MjA4OTYxOTE3MX0.21AOR9PKcxY55oAm-YLzTleQQQ2fFfI4WQ00--H4al4";
}

const supabase = createClient(supabaseUrl || "https://udgaognmnfsiwvvqvxdq.supabase.co", supabaseKey);

async function test() {
  console.log("Calling get_user_feed RPC...");
  const { data, error } = await supabase.rpc("get_user_feed", {
    p_user_email: "test@example.com",
    p_limit: 100
  });

  if (error) {
    console.error("❌ RPC Error:", error);
  } else {
    console.log("✅ RPC Success! Ads returned:", data.length);
  }
}

test();
