import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANNON_KEY;

if (typeof window === "undefined" && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables. " +
    "supabaseAdmin is falling back to the public anon/publishable key. " +
    "Direct SELECT queries on RLS-protected tables (like 'users') will fail or return empty results!"
  );
}

const supabaseAdmin = createClient(supabaseUrl!, serviceKey!, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabaseAdmin;
