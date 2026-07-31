-- ============================================================
-- MIGRATION 001: CONSOLIDATED ADS RENDER SERVICE FOR XEA
-- ============================================================

-- 1. Ensure table columns and indexes exist for optimal feed query performance
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS user_frequency_cap integer DEFAULT 1;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS cost_per_impression numeric(10,2) DEFAULT 0.50;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS hls_url text;

-- Create indexing for ultra-fast candidate selection
CREATE INDEX IF NOT EXISTS idx_addsactive_user_email ON public.addsactive (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_addsactive_completed_at ON public.addsactive (completed_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_ad ON public.ad_impressions (lower(user_email), ad_id);

-- 2. Create single canonical get_user_feed RPC function
DROP FUNCTION IF EXISTS public.get_user_feed(text);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
) RETURNS SETOF public.addsactive AS $$
BEGIN
  RETURN QUERY
  SELECT a.*
  FROM public.addsactive a
  LEFT JOIN public.ad_impressions imp
    ON lower(imp.user_email) = lower(p_user_email)
   AND imp.ad_id = a.id
  WHERE a.completed_at IS NULL
    AND lower(a.user_email) != lower(p_user_email)
    AND (
      imp.view_count IS NULL
      OR imp.view_count < COALESCE(a.user_frequency_cap, 1)
    )
  ORDER BY 
    COALESCE(a.cost_per_impression, 0) DESC,
    a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon, authenticated, service_role;

-- 3. Create Atomic Batch Event Processor RPC (process_feed_batch)
CREATE OR REPLACE FUNCTION public.process_feed_batch(
  p_batch JSONB
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_ad_id TEXT;
  v_email TEXT;
  v_type TEXT;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_batch)
  LOOP
    v_ad_id := v_item ->> 'adId';
    v_email := lower(trim(v_item ->> 'email'));
    v_type  := v_item ->> 'type';

    IF v_type = 'seen' THEN
      INSERT INTO public.ad_impressions (ad_id, user_email, view_count)
      VALUES (v_ad_id, v_email, 1)
      ON CONFLICT (user_email, ad_id)
      DO UPDATE SET view_count = public.ad_impressions.view_count + 1;

      PERFORM public.record_ad_seen(v_ad_id, v_email);

    ELSIF v_type = 'earn' THEN
      PERFORM public.handle_earn_click(v_ad_id, v_email);

    ELSIF v_type = 'mutual' THEN
      PERFORM public.handle_mutual_click(v_ad_id, v_email);

    ELSIF v_type = 'action-click' THEN
      PERFORM public.increment_ad_click(v_ad_id, COALESCE(v_item ->> 'clickType', 'website'));
    END IF;

    PERFORM public.increment_user_click_progress(v_email);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_feed_batch(JSONB) TO service_role;
