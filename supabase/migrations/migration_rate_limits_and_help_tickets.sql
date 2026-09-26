-- migration_rate_limits_and_help_tickets.sql
-- Add resolved_at timestamp column to public.help_tickets table

ALTER TABLE public.help_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Notify PostgREST schema cache to reload
NOTIFY pgrst, 'reload schema';
