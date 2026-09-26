-- MIGRATION: AUTO-ACTIVATE & AUTO-EXPIRE NEWS HIGHLIGHTS
-- Run this SQL in your Supabase Dashboard -> SQL Editor.

-- 1. Create a security definer function to activate pending highlights
-- This moves highlights from 'news' (in review) to 'newsactive' (active) and deletes them from 'news'.
CREATE OR REPLACE FUNCTION public.activate_pending_news()
RETURNS void AS $$
BEGIN
  -- Copy highlights from news to newsactive, updating created_at to the activation time
  INSERT INTO public.newsactive (id, title, content, image_url, interest, created_at, user_id, user_email)
  SELECT id, title, content, image_url, interest, timezone('utc'::text, now()), user_id, user_email
  FROM public.news
  ON CONFLICT (id) DO NOTHING;

  -- Remove successfully moved highlights from news so they leave the review queue
  DELETE FROM public.news 
  WHERE id IN (SELECT id FROM public.newsactive);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create a security definer function to clean up expired active news (older than 24 hours of being posted)
CREATE OR REPLACE FUNCTION public.delete_expired_news()
RETURNS void AS $$
BEGIN
  -- Delete expired active highlights from public.newsactive
  DELETE FROM public.newsactive 
  WHERE created_at < (now() - interval '24 hours');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.activate_pending_news() TO anon;
GRANT EXECUTE ON FUNCTION public.activate_pending_news() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_pending_news() TO service_role;

GRANT EXECUTE ON FUNCTION public.delete_expired_news() TO anon;
GRANT EXECUTE ON FUNCTION public.delete_expired_news() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_news() TO service_role;

-- 3. (OPTIONAL) Schedule tasks via pg_cron to run automatically every 10 minutes in the database
-- Uncomment the lines below if you want automated database-side execution.
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- SELECT cron.schedule(
--   'activate-pending-news-every-10-minutes',
--   '*/10 * * * *',
--   $$ SELECT public.activate_pending_news(); $$
-- );
--
-- SELECT cron.schedule(
--   'delete-expired-news-every-10-minutes',
--   '*/10 * * * *',
--   $$ SELECT public.delete_expired_news(); $$
-- );
