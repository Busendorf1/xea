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
        const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
          supabaseUrl = value;
        } else if (key === 'SUPABASE_SERVICE_ROLE_KEY' || key === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
          if (!supabaseKey || key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = value;
        }
      }
    }
  });
} catch (e) {
  console.error(e);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSchema() {
  console.log("Checking help_tickets columns...");
  const { data, error } = await supabase.from('help_tickets').select('id, status, resolved_at').limit(1);
  if (error) {
    console.log("❌ error checking resolved_at column:", error.message);
  } else {
    console.log("✅ help_tickets.resolved_at column EXISTS!");
  }

  console.log("Checking RPC delete_resolved_help_tickets...");
  const { error: rpcErr } = await supabase.rpc('delete_resolved_help_tickets');
  if (rpcErr) {
    console.log("❌ RPC delete_resolved_help_tickets error:", rpcErr.message);
  } else {
    console.log("✅ RPC delete_resolved_help_tickets EXISTS!");
  }
}

testSchema();
