import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";

const globalForSupabase = globalThis as unknown as {
  __xeaSupabaseClient?: SupabaseClient;
};

const supabase: SupabaseClient =
  globalForSupabase.__xeaSupabaseClient ?? createClient(supabaseUrl, supabaseKey);

if (!globalForSupabase.__xeaSupabaseClient) {
  globalForSupabase.__xeaSupabaseClient = supabase;
}

export default supabase;

