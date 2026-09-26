-- ==============================================================================
-- MASTER PRODUCTION CONSOLIDATION SCRIPT (SAFE & IDEMPOTENT)
-- Run this once in your Supabase Dashboard -> SQL Editor (New query -> Run)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS & CORE TABLES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Bidded Ads Table for Priority Feed Delivery
CREATE TABLE IF NOT EXISTS public.bidded_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID REFERENCES public.addsactive(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  industry TEXT NOT NULL,
  bid_price NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bidded_ads_industry_price 
  ON public.bidded_ads (industry, bid_price DESC, is_active);
CREATE INDEX IF NOT EXISTS idx_bidded_ads_ad_id 
  ON public.bidded_ads (ad_id);

-- Completed Ads Historical Archive Table
CREATE TABLE IF NOT EXISTS public.completed_ads (
  id                  UUID PRIMARY KEY,
  ad_type             TEXT NOT NULL,
  industry            TEXT[] DEFAULT '{}'::TEXT[],
  interest            TEXT[] DEFAULT '{}'::TEXT[],
  lifestyle           TEXT[] DEFAULT '{}'::TEXT[],
  behavior            TEXT[] DEFAULT '{}'::TEXT[],
  personality         TEXT[] DEFAULT '{}'::TEXT[],
  age_range           INTEGER[] DEFAULT ARRAY[18, 65],
  targeting_all       BOOLEAN DEFAULT FALSE,
  impressions         INTEGER,
  country             TEXT,
  state               TEXT,
  province            TEXT,
  gender              TEXT,
  employment_status   TEXT,
  ad_media_type       TEXT,
  ad_content          TEXT,
  ad_media_url        TEXT,
  ad_action_buttons   TEXT[] DEFAULT '{}'::TEXT[],
  action_phone        TEXT,
  action_whatsapp     TEXT,
  action_website      TEXT,
  action_email        TEXT,
  cost_per_impression NUMERIC(10,2),
  total_cost          NUMERIC(12,2),
  created_at          TIMESTAMP WITH TIME ZONE,
  completed_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  user_id             UUID,
  user_email          TEXT,
  impression_count    NUMERIC DEFAULT 0
);

-- ------------------------------------------------------------------------------
-- 2. 100M+ SCALE PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON public.users (phone) WHERE phone IS NOT NULL AND phone != '';

CREATE INDEX IF NOT EXISTS idx_newsactive_highlights_feed 
  ON public.newsactive (created_at DESC, is_bidded, bid_price DESC)
  WHERE is_paused IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_rating_lookup 
  ON public.ad_impressions (ad_id, lower(user_email));

CREATE INDEX IF NOT EXISTS idx_addsactive_feed_lookup 
  ON public.addsactive (created_at DESC, is_paused) 
  WHERE completed_at IS NULL;

-- ------------------------------------------------------------------------------
-- 3. AD ARCHIVAL & AUTOMATED COMPLETION FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_completed_ad(p_ad_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.completed_ads (
    id, ad_type, industry, interest, lifestyle, behavior, personality, age_range,
    targeting_all, impressions, country, state, province, gender, employment_status,
    ad_media_type, ad_content, ad_media_url, ad_action_buttons, action_phone,
    action_whatsapp, action_website, action_email, cost_per_impression, total_cost,
    created_at, completed_at, user_id, user_email, impression_count
  )
  SELECT
    id, ad_type, industry, interest, lifestyle, behavior, personality, age_range,
    targeting_all, impressions, country, state, province, gender, employment_status,
    ad_media_type, ad_content, ad_media, ad_action_buttons, action_phone,
    action_whatsapp, action_website, action_email, cost_per_impression, total_cost,
    created_at, timezone('utc'::text, now()), user_id, user_email, COALESCE(impression_count, 0)
  FROM public.addsactive
  WHERE id = p_ad_id
  ON CONFLICT (id) DO UPDATE SET
    completed_at = EXCLUDED.completed_at,
    impression_count = EXCLUDED.impression_count;

  -- Delete from active tables (releases memory and candidate pools instantly)
  DELETE FROM public.addsactive WHERE id = p_ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 4. RECORD IMPRESSION WITH AUTOMATIC EXHAUSTION HANDSHAKE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_count    BIGINT;
  v_max_impressions  BIGINT;
  v_email_lower      TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fetch current impression state
  SELECT COALESCE(impression_count, 0), COALESCE(impressions, 0)
  INTO v_current_count, v_max_impressions
  FROM public.addsactive
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- If ad has reached its impression cap, archive and remove it immediately
  IF v_max_impressions > 0 AND v_current_count >= v_max_impressions THEN
    PERFORM public.archive_completed_ad(p_ad_id);
    RETURN FALSE;
  END IF;

  -- Increment impression count
  UPDATE public.addsactive
  SET impression_count = COALESCE(impression_count, 0) + 1
  WHERE id = p_ad_id;

  -- Record user impression history
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count, last_viewed_at)
  VALUES (p_ad_id, v_email_lower, 1, timezone('utc'::text, now()))
  ON CONFLICT (ad_id, user_email) DO UPDATE SET
    view_count = public.ad_impressions.view_count + 1,
    last_viewed_at = timezone('utc'::text, now());

  -- If this impression hits the target, trigger immediate archival
  IF v_max_impressions > 0 AND (v_current_count + 1) >= v_max_impressions THEN
    PERFORM public.archive_completed_ad(p_ad_id);
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 5. HIGHEST BIDDER & FLOOR ATTENTION PRICES RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_industry_attention_prices()
RETURNS TABLE (
  industry_name TEXT,
  floor_price NUMERIC(12,2),
  highest_bid NUMERIC(12,2),
  total_active_bids BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH industries AS (
    SELECT 'politics' AS ind, 1500.00::NUMERIC(12,2) AS flr
    UNION ALL SELECT 'business', 45.00::NUMERIC(12,2)
    UNION ALL SELECT 'government', 2000.00::NUMERIC(12,2)
    UNION ALL SELECT 'individual', 25.00::NUMERIC(12,2)
    UNION ALL SELECT 'religion', 1500.00::NUMERIC(12,2)
    UNION ALL SELECT 'product_sales', 55.00::NUMERIC(12,2)
  )
  SELECT 
    i.ind AS industry_name,
    i.flr AS floor_price,
    COALESCE(MAX(b.bid_price), i.flr) AS highest_bid,
    COUNT(b.id) AS total_active_bids
  FROM industries i
  LEFT JOIN public.bidded_ads b 
    ON LOWER(b.industry) = LOWER(i.ind) AND b.is_active = true
  GROUP BY i.ind, i.flr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 6. HIGHLIGHTS DURATION & EXCLUSION (BIDDED DAYS VS 24H STANDARD)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expired_news()
RETURNS VOID AS $$
BEGIN
  -- Delete expired active highlights:
  -- - If bidded: expires on the exact date/days bidded for
  -- - If not bidded: expires strictly after 24 hours
  DELETE FROM public.newsactive
  WHERE 
    (is_bidded IS TRUE AND created_at < (now() - (COALESCE(campaign_days, 1) || ' days')::INTERVAL))
    OR 
    ((is_bidded IS NOT TRUE OR is_bidded IS FALSE) AND created_at < (now() - INTERVAL '24 hours'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 7. NOTIFICATIONS PERFORMANCE INDEXES & AUTO-PURGE
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications (user_email, read);
CREATE INDEX IF NOT EXISTS idx_global_announcements_created ON public.global_announcements (created_at DESC, target);
CREATE INDEX IF NOT EXISTS idx_read_announcements_user ON public.read_announcements (user_email, announcement_id);

CREATE OR REPLACE FUNCTION public.delete_expired_notifications()
RETURNS VOID AS $$
BEGIN
  -- Auto-purge notifications older than the 15-day retention window
  DELETE FROM public.notifications WHERE created_at < (now() - INTERVAL '15 days');
  DELETE FROM public.global_announcements WHERE created_at < (now() - INTERVAL '15 days');
  DELETE FROM public.read_announcements WHERE created_at < (now() - INTERVAL '15 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 8. GRANT ALL PERMISSIONS
-- ------------------------------------------------------------------------------
GRANT ALL ON TABLE public.bidded_ads TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.completed_ads TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_completed_ad(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_industry_attention_prices() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expired_news() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expired_notifications() TO anon, authenticated, service_role;
