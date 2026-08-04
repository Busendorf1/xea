import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";

if (typeof window === "undefined" && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "🚨 CRITICAL CONFIG ERROR: SUPABASE_SERVICE_ROLE_KEY is required in production environment!"
    );
  } else {
    console.warn(
      "⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables. " +
        "supabaseAdmin is falling back to public key. Queries on RLS-protected tables may return empty results!"
    );
  }
}

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Configure Read Replica Client
const supabaseReadUrl = process.env.SUPABASE_READONLY_URL;
const supabaseReadServiceKey = process.env.SUPABASE_READONLY_SERVICE_ROLE_KEY;

export const supabaseReadOnly = (supabaseReadUrl && supabaseReadServiceKey)
  ? createClient(supabaseReadUrl, supabaseReadServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : supabaseAdmin;

if (supabaseReadUrl && supabaseReadServiceKey) {
  console.log("🚀 Database Read Replication enabled: Routing reads to replica.");
} else {
  console.log("ℹ️ Read Replica config not found. Routing reads to primary database.");
}

export default supabaseAdmin;
