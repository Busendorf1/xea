import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://udgaognmnfsiwvvqvxdq.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANNON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkZ2FvZ25tbmZzaXd2dnF2eGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDMxNzEsImV4cCI6MjA4OTYxOTE3MX0.21AOR9PKcxY55oAm-YLzTleQQQ2fFfI4WQ00--H4al4";

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("Supabase client initialized dynamically with URL:", supabaseUrl);

export default supabase;

