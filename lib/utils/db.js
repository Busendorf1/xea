import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANNON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("Supabase client initialized dynamically with URL:", supabaseUrl);

export default supabase;

