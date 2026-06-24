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
  console.log("Calling get_user_feed for nonsom019@gmail.com:");
  const { data, error } = await supabase.rpc('get_user_feed', {
    p_user_email: 'nonsom019@gmail.com',
    p_limit: 10,
    p_offset: 0
  });

  if (error) {
    console.error("RPC Error:", error);
    return;
  }

  console.log("RPC returned ads count:", data.length);
  data.forEach((ad, i) => {
    console.log(`Ad ${i + 1}: ID=${ad.id}, user_email=${ad.user_email}, display_mutual_button=${ad.display_mutual_button}, mutual_targets=${JSON.stringify(ad.mutual_targets)}`);
  });
}

check();
