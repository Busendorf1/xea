-- MIGRATION: DATABASE-LEVEL AUTOMATION FOR NEWS HIGHLIGHTS
-- Execute this SQL in your Supabase Dashboard SQL Editor to automate activation and expiration.

-- 1. Create function for instant news activation
CREATE OR REPLACE FUNCTION public.tr_activate_news()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.newsactive (id, title, content, image_url, interest, created_at, user_id, user_email)
  VALUES (NEW.id, NEW.title, NEW.content, NEW.image_url, NEW.interest, timezone('utc'::text, now()), NEW.user_id, NEW.user_email)
  ON CONFLICT (id) DO NOTHING;

  -- Delete from public.news queue
  DELETE FROM public.news WHERE id = NEW.id;
  
  RETURN NULL; -- Prevents the row from staying in the public.news queue table
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on public.news
DROP TRIGGER IF EXISTS trigger_activate_news ON public.news;
CREATE TRIGGER trigger_activate_news
AFTER INSERT ON public.news
FOR EACH ROW
EXECUTE FUNCTION public.tr_activate_news();


-- 2. Create function for auto-cleanup of expired news (older than 24 hours)
CREATE OR REPLACE FUNCTION public.tr_cleanup_expired_news()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.newsactive 
  WHERE created_at < (now() - interval '24 hours');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on public.newsactive
DROP TRIGGER IF EXISTS trigger_cleanup_expired_news ON public.newsactive;
CREATE TRIGGER trigger_cleanup_expired_news
BEFORE INSERT ON public.newsactive
FOR EACH ROW
EXECUTE FUNCTION public.tr_cleanup_expired_news();
