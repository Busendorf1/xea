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
  const { data, error } = await supabase.from('help_tickets').select('*').limit(1);
  if (error) {
    console.error("Error fetching help_tickets:", error);
    return;
  }
  console.log("Found help ticket:", data);
}

check();
