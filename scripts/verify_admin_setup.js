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
  console.error("Error reading env file:", e);
}

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase URL or Key not found in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log("🔍 Starting Admin Dashboard Verification...\n");

  // 1. Check users table
  console.log("1. Checking users table...");
  const { data: users, error: usersErr } = await supabase.from('users').select('*').limit(1);
  if (usersErr) {
    console.error("   ❌ Error reading users table:", usersErr.message);
  } else {
    console.log(`   ✅ Successfully read users table. Connection OK. (${users.length} row(s) checked)`);
  }

  // 2. Check adds and addsactive
  console.log("\n2. Checking ads tables...");
  const { data: ads, error: adsErr } = await supabase.from('adds').select('*').limit(1);
  const { data: adsActive, error: adsActiveErr } = await supabase.from('addsactive').select('*').limit(1);
  
  if (adsErr) console.error("   ❌ Error reading adds table:", adsErr.message);
  else console.log("   ✅ Successfully read adds (review queue) table.");
  
  if (adsActiveErr) console.error("   ❌ Error reading addsactive table:", adsActiveErr.message);
  else console.log("   ✅ Successfully read addsactive (active ads) table.");

  // 3. Check columns is_paused
  console.log("\n3. Verifying 'is_paused' column existence...");
  
  const checkPausedColumn = (data, tableName) => {
    if (data && data.length > 0) {
      const firstRow = data[0];
      if ('is_paused' in firstRow) {
        console.log(`   ✅ 'is_paused' column exists in public.${tableName}`);
        return true;
      } else {
        console.log(`   ⚠️ 'is_paused' column NOT FOUND in public.${tableName}. Please run the migration SQL script: c:/Users/USER/xea/migration_admin_features.sql in your Supabase SQL Editor.`);
        return false;
      }
    } else {
      console.log(`   ℹ️ public.${tableName} is empty. Unable to verify column existence from row fields. Verification should be checked manually via schema.`);
      return null;
    }
  };

  const adRow = await supabase.from('adds').select('*').limit(1);
  checkPausedColumn(adRow.data, 'adds');

  const adActiveRow = await supabase.from('addsactive').select('*').limit(1);
  checkPausedColumn(adActiveRow.data, 'addsactive');

  // 4. Check news and newsactive
  console.log("\n4. Checking highlights tables...");
  const { data: news, error: newsErr } = await supabase.from('news').select('*').limit(1);
  const { data: newsActive, error: newsActiveErr } = await supabase.from('newsactive').select('*').limit(1);
  
  if (newsErr) console.error("   ❌ Error reading news table:", newsErr.message);
  else console.log("   ✅ Successfully read news (pending highlights) table.");
  
  if (newsActiveErr) console.error("   ❌ Error reading newsactive table:", newsActiveErr.message);
  else console.log("   ✅ Successfully read newsactive (active highlights) table.");

  checkPausedColumn(news, 'news');
  checkPausedColumn(newsActive, 'newsactive');

  // 5. Test get_user_feed RPC function
  console.log("\n5. Testing get_user_feed RPC function...");
  const testEmail = users && users[0] ? users[0].email : 'nonsom019@gmail.com';
  console.log(`   Calling get_user_feed for user: ${testEmail}`);
  const { data: feed, error: feedErr } = await supabase.rpc('get_user_feed', {
    p_user_email: testEmail,
    p_limit: 5,
    p_offset: 0
  });

  if (feedErr) {
    console.error("   ❌ get_user_feed RPC failed:", feedErr.message);
    console.log("   💡 If the error mentions missing arguments or types, make sure you ran migration_admin_features.sql to update the RPC function structure.");
  } else {
    console.log(`   ✅ get_user_feed RPC ran successfully. Returned ${feed.length} ads.`);
  }

  console.log("\n🏁 Verification complete.");
}

verify();
