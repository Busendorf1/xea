-- ============================================================
-- MIGRATION: FREE MONETIZATION VIA 300 CLICKS & 7-DAY INACTIVITY RESET
-- Run this script in your Supabase SQL Editor
-- ============================================================

-- 1. Add monetization tracking columns to users table if not exists
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS monetization_clicks INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Drop existing RPC functions to prevent signature/return type mismatch errors
DROP FUNCTION IF EXISTS public.check_and_update_monetization_status(TEXT);
DROP FUNCTION IF EXISTS public.increment_user_click_progress(TEXT);

-- 2. RPC to check 7-day inactivity and update monetization status atomically
CREATE OR REPLACE FUNCTION public.check_and_update_monetization_status(
  p_email TEXT
)
RETURNS TABLE (
  monetized BOOLEAN,
  monetization_clicks INT,
  clicks_remaining INT,
  days_inactive INT,
  status_message TEXT
) AS $$
DECLARE
  v_monetized BOOLEAN;
  v_clicks INT;
  v_last_active TIMESTAMPTZ;
  v_days_diff INT;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_email);

  SELECT 
    COALESCE(u.monetized::boolean, false),
    COALESCE(u.monetization_clicks, 0),
    COALESCE(u.last_active_at, timezone('utc'::text, now()))
  INTO v_monetized, v_clicks, v_last_active
  FROM public.users u
  WHERE lower(u.email) = v_email_lower;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 300, 0, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Calculate days inactive
  v_days_diff := EXTRACT(DAY FROM (timezone('utc'::text, now()) - v_last_active))::INT;

  -- 7-Day Inactivity Rule: If inactive for 7 or more days, revoke monetization and reset clicks to 0
  IF v_days_diff >= 7 THEN
    UPDATE public.users
    SET monetized = 'false',
        monetization_clicks = 0,
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;

    RETURN QUERY SELECT false, 0, 300, v_days_diff, 'Monetization reset due to 7 days of inactivity'::TEXT;
    RETURN;
  END IF;

  -- Check auto-activation at 300 clicks
  IF v_clicks >= 300 AND NOT v_monetized THEN
    UPDATE public.users
    SET monetized = 'true',
        monetized_at = timezone('utc'::text, now()),
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;

    v_monetized := true;
  ELSE
    -- Update last active timestamp
    UPDATE public.users
    SET last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  END IF;

  RETURN QUERY SELECT 
    v_monetized,
    v_clicks,
    GREATEST(0, 300 - v_clicks),
    v_days_diff,
    CASE WHEN v_monetized THEN 'Monetized Active' ELSE 'In Progress' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC to record user click(s) and increment 300-clicks progress atomically
CREATE OR REPLACE FUNCTION public.increment_user_click_progress(
  p_email TEXT,
  p_count INT DEFAULT 1
)
RETURNS TABLE (
  new_click_count INT,
  is_now_monetized BOOLEAN
) AS $$
DECLARE
  v_email_lower TEXT;
  v_current_clicks INT;
  v_is_monetized BOOLEAN;
  v_last_active TIMESTAMPTZ;
  v_days_diff INT;
  v_increment INT;
BEGIN
  v_email_lower := lower(p_email);
  v_increment := GREATEST(1, COALESCE(p_count, 1));

  SELECT 
    COALESCE(monetization_clicks, 0),
    COALESCE(monetized::boolean, false),
    COALESCE(last_active_at, timezone('utc'::text, now()))
  INTO v_current_clicks, v_is_monetized, v_last_active
  FROM public.users
  WHERE lower(email) = v_email_lower;

  v_days_diff := EXTRACT(DAY FROM (timezone('utc'::text, now()) - v_last_active))::INT;

  -- Reset if inactive for 7+ days
  IF v_days_diff >= 7 THEN
    v_current_clicks := 0;
    v_is_monetized := false;
  END IF;

  v_current_clicks := v_current_clicks + v_increment;

  IF v_current_clicks >= 300 THEN
    v_is_monetized := true;
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = 'true',
        monetized_at = COALESCE(monetized_at, timezone('utc'::text, now())),
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  ELSE
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = CASE WHEN v_is_monetized THEN 'true' ELSE 'false' END,
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  END IF;

  RETURN QUERY SELECT v_current_clicks, v_is_monetized;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Scheduled cleanup function for 7-day inactive users (suitable for pg_cron or Vercel Cron)
CREATE OR REPLACE FUNCTION public.reset_inactive_monetized_users()
RETURNS INT AS $$
DECLARE
  v_reset_count INT;
BEGIN
  WITH reset_rows AS (
    UPDATE public.users
    SET monetized = 'false',
        monetization_clicks = 0
    WHERE last_active_at < (timezone('utc'::text, now()) - INTERVAL '7 days')
      AND (monetized = 'true' OR monetized = 'yes' OR monetization_clicks > 0)
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_reset_count FROM reset_rows;

  RETURN v_reset_count;
END;
-- 5. (OPTIONAL) Schedule via Supabase pg_cron extension to run daily at midnight
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('daily-inactivity-monetization-reset', '0 0 * * *', 'SELECT public.reset_inactive_monetized_users();');


