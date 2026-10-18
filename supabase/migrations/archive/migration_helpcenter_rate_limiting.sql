-- MIGRATION: INDEXING & SCALABILITY FOR HELPCENTER RATE LIMITING
-- Run this SQL in your Supabase Dashboard -> SQL Editor to enable instant lookups.

-- Create composite index on help_tickets for optimized user_email search and descending date sorting
CREATE INDEX IF NOT EXISTS idx_help_tickets_user_email_created_at 
ON public.help_tickets (user_email, created_at DESC);
