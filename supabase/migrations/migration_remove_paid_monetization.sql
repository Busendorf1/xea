-- ============================================================
-- MIGRATION: REMOVE LEGACY PAID MONETIZATION SUBSCRIPTIONS
-- Run this script in your Supabase SQL Editor
-- ============================================================

-- 1. Reset any stale 30-day expiration and paid monetization types
UPDATE public.users
SET monetized_until = NULL,
    monetization_type = NULL
WHERE monetized_until IS NOT NULL OR monetization_type IS NOT NULL;

-- 2. Ensure monetization is purely driven by 300 attention clicks & 7-day activity
-- Active users with >= 300 clicks remain monetized indefinitely as long as active within 7 days.
UPDATE public.users
SET monetized = 'true'
WHERE monetization_clicks >= 300 
  AND (last_active_at IS NULL OR last_active_at >= timezone('utc'::text, now()) - INTERVAL '7 days');

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
