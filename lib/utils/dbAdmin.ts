import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://udgaognmnfsiwvvqvxdq.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANNON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkZ2FvZ25tbmZzaXd2dnF2eGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDMxNzEsImV4cCI6MjA4OTYxOTE3MX0.21AOR9PKcxY55oAm-YLzTleQQQ2fFfI4WQ00--H4al4";

if (typeof window === "undefined" && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables. " +
    "supabaseAdmin is falling back to the public anon/publishable key. " +
    "Direct SELECT queries on RLS-protected tables (like 'users') will fail or return empty results!"
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabaseAdmin;
