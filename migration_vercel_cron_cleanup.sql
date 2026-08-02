-- MIGRATION: VERCEL CRON-BASED DATABASE CLEANUP & LIFE-CYCLE FIXES
-- Run this SQL in your Supabase Dashboard -> SQL Editor.

-- 1. Drop old triggers if present
DROP TRIGGER IF EXISTS trigger_cleanup_expired_news ON public.newsactive;
DROP FUNCTION IF EXISTS public.tr_cleanup_expired_news();

-- 2. Create or replace the highlights cleanup function accounting for campaign_days (1-5 days)
CREATE OR REPLACE FUNCTION public.delete_expired_news()
RETURNS void AS $$
BEGIN
  DELETE FROM public.newsactive 
  WHERE created_at < (timezone('utc'::text, now()) - (COALESCE(campaign_days, 1) || ' days')::interval);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create a function to archive expired platform ads
CREATE OR REPLACE FUNCTION public.archive_expired_platform_ads()
RETURNS void AS $$
DECLARE
  v_ad_id UUID;
BEGIN
  FOR v_ad_id IN 
    SELECT id FROM public.adds
    WHERE (cost_per_impression IS NULL OR cost_per_impression = 0)
      AND campaign_days IS NOT NULL
      AND created_at < (timezone('utc'::text, now()) - (campaign_days || ' days')::interval)
  LOOP
    PERFORM public.archive_completed_ad(v_ad_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create function to delete completed ads older than 24 hours
CREATE OR REPLACE FUNCTION public.delete_expired_completed_ads()
RETURNS void AS $$
DECLARE
  v_batch_size INT := 5000;
  v_rows_deleted INT;
BEGIN
  LOOP
    DELETE FROM public.completed_ads
    WHERE id IN (
      SELECT id FROM public.completed_ads
      WHERE completed_at < (timezone('utc'::text, now()) - interval '24 hours')
      LIMIT v_batch_size
    );
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted < v_batch_size;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create function to delete resolved help tickets older than 24 hours
CREATE OR REPLACE FUNCTION public.delete_resolved_help_tickets()
RETURNS void AS $$
BEGIN
  DELETE FROM public.help_tickets
  WHERE resolved_at IS NOT NULL
    AND resolved_at < (timezone('utc'::text, now()) - interval '24 hours');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant execute permissions to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.delete_expired_news() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_expired_platform_ads() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expired_completed_ads() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_resolved_help_tickets() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
