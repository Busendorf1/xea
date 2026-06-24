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
  const { data, error } = await supabase.from('adds').select('*');
  if (error) {
    console.error(error);
    return;
  }
  console.log("Ads count:", data.length);
  data.forEach((ad, i) => {
    console.log(`Ad ${i + 1}:`);
    console.log(`  ID: ${ad.id}`);
    console.log(`  user_email: "${ad.user_email}"`);
    console.log(`  email (legacy): "${ad.email}"`);
    console.log(`  user_id: "${ad.user_id}"`);
    console.log(`  display_mutual_button: ${ad.display_mutual_button}`);
    console.log(`  mutual_targets: ${JSON.stringify(ad.mutual_targets)}`);
    console.log(`  completed_at: ${ad.completed_at}`);
  });
}

check();
