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
  const { data: users, error } = await supabase.from('users').select('*');
  if (error) {
    console.error(error);
    return;
  }
  console.log("Total users:", users.length);
  users.forEach((u, i) => {
    console.log(`User ${i + 1}:`);
    console.log(`  email: ${u.email}`);
    console.log(`  mutual_count: ${u.mutual_count}`);
    console.log(`  mutuals: ${JSON.stringify(u.mutuals)}`);
    console.log(`  last_mutual_spent: ${u.last_mutual_spent}`);
  });
}

check();
