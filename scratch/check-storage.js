const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read env.local
const envContent = fs.readFileSync('c:/Users/USER/xea/.env.local', 'utf8');
let supabaseUrl = '';
let serviceKey = '';

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
        serviceKey = value;
      }
    }
  }
});

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase configuration");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function setupStorage() {
  console.log("Connecting to Supabase storage...");
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Error listing buckets:", listError);
    return;
  }

  console.log("Current buckets:", buckets.map(b => `${b.name} (public: ${b.public})`));

  const hasAdMedia = buckets.some(b => b.name === 'ad-media');
  if (!hasAdMedia) {
    console.log("Creating 'ad-media' bucket...");
    const { data, error: createError } = await supabase.storage.createBucket('ad-media', {
      public: true,
      allowedMimeTypes: ['image/*', 'video/*'],
      fileSizeLimit: 52428800 // 50MB
    });
    if (createError) {
      console.error("Error creating bucket:", createError);
    } else {
      console.log("Successfully created public 'ad-media' bucket:", data);
    }
  } else {
    console.log("'ad-media' bucket already exists.");
  }
}

setupStorage();
