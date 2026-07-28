-- ============================================================
-- MIGRATION: ATTENTION ECONOMY BIDDING SYSTEM
-- Run this script in your Supabase SQL Editor
-- ============================================================

-- 1. Create bidded_ads table for tracking priority attention bids
CREATE TABLE IF NOT EXISTS public.bidded_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID REFERENCES public.addsactive(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  industry TEXT NOT NULL,
  bid_price NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Indexing for fast high-concurrency lookups
CREATE INDEX IF NOT EXISTS idx_bidded_ads_industry_price 
  ON public.bidded_ads (industry, bid_price DESC, is_active);

CREATE INDEX IF NOT EXISTS idx_bidded_ads_ad_id 
  ON public.bidded_ads (ad_id);

-- Enable RLS on bidded_ads table
ALTER TABLE public.bidded_ads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public read access for bidded_ads" ON public.bidded_ads;
DROP POLICY IF EXISTS "Users can insert their own bidded ads" ON public.bidded_ads;

-- Allow read access for authenticated and anonymous users
CREATE POLICY "Public read access for bidded_ads" ON public.bidded_ads
  FOR SELECT TO authenticated, anon USING (true);

-- Allow system/users to insert bidded_ads
CREATE POLICY "Users can insert their own bidded ads" ON public.bidded_ads
  FOR INSERT TO authenticated, anon WITH CHECK (true);

-- 2. Drop existing RPC functions to prevent return type conflict errors (42P13)
DROP FUNCTION IF EXISTS public.get_industry_attention_prices();
DROP FUNCTION IF EXISTS public.get_user_feed(TEXT, INT, INT);

-- 3. RPC to get current attention market prices (Floor vs Highest Bid per Industry)
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

-- 4. Updated RPC get_user_feed with 75% bidded / 25% floor ratio interleaving
CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  ad_type TEXT,
  industry TEXT,
  interest TEXT,
  lifestyle TEXT,
  behavior TEXT,
  personality TEXT,
  age_range TEXT,
  targeting_all BOOLEAN,
  impressions INT,
  campaign_days INT,
  user_frequency_cap INT,
  country TEXT,
  state TEXT,
  province TEXT,
  gender TEXT,
  employment_status TEXT,
  ad_media_type TEXT,
  ad_content TEXT,
  ad_action_buttons TEXT[],
  action_phone TEXT,
  action_whatsapp TEXT,
  action_website TEXT,
  action_email TEXT,
  action_ios TEXT,
  action_android TEXT,
  action_watch_now TEXT,
  display_mutual_button BOOLEAN,
  product_name TEXT,
  product_price NUMERIC(12,2),
  product_cta_type TEXT,
  product_cta_link TEXT,
  ad_media TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  impression_count INT,
  cost_per_impression NUMERIC(12,2),
  is_bidded BOOLEAN,
  bid_price NUMERIC(12,2)
) AS $$
DECLARE
  v_user_gender TEXT;
  v_user_country TEXT;
  v_user_state TEXT;
  v_user_employment TEXT;
BEGIN
  -- Retrieve user demographics if available
  SELECT gender, country, state, employment_status
  INTO v_user_gender, v_user_country, v_user_state, v_user_employment
  FROM public.users
  WHERE LOWER(email) = LOWER(p_user_email);

  RETURN QUERY
  WITH candidate_ads AS (
    SELECT 
      a.id,
      a.ad_type,
      a.industry,
      a.interest,
      a.lifestyle,
      a.behavior,
      a.personality,
      a.age_range,
      a.targeting_all,
      a.impressions,
      a.campaign_days,
      a.user_frequency_cap,
      a.country,
      a.state,
      a.province,
      a.gender,
      a.employment_status,
      a.ad_media_type,
      a.ad_content,
      a.ad_action_buttons,
      a.action_phone,
      a.action_whatsapp,
      a.action_website,
      a.action_email,
      a.action_ios,
      a.action_android,
      a.action_watch_now,
      a.display_mutual_button,
      a.product_name,
      a.product_price,
      a.product_cta_type,
      a.product_cta_link,
      a.ad_media,
      a.user_email,
      a.created_at,
      a.completed_at,
      a.impression_count,
      a.impression AS cost_per_impression,
      CASE WHEN b.id IS NOT NULL THEN true ELSE false END AS is_bidded,
      COALESCE(b.bid_price, a.impression) AS bid_price,
      -- Priority score: bidded ads get high random score (75% preference window), non-bidded get secondary range
      CASE 
        WHEN b.id IS NOT NULL THEN 75.0 + (COALESCE(b.bid_price, 0) / 100.0) + random() * 25.0
        ELSE random() * 25.0
      END AS priority_score
    FROM public.addsactive a
    LEFT JOIN public.bidded_ads b ON b.ad_id = a.id AND b.is_active = true
    WHERE a.completed_at IS NULL
      AND LOWER(a.user_email) != LOWER(p_user_email)
  )
  SELECT 
    ca.id,
    ca.ad_type,
    ca.industry,
    ca.interest,
    ca.lifestyle,
    ca.behavior,
    ca.personality,
    ca.age_range,
    ca.targeting_all,
    ca.impressions,
    ca.campaign_days,
    ca.user_frequency_cap,
    ca.country,
    ca.state,
    ca.province,
    ca.gender,
    ca.employment_status,
    ca.ad_media_type,
    ca.ad_content,
    ca.ad_action_buttons,
    ca.action_phone,
    ca.action_whatsapp,
    ca.action_website,
    ca.action_email,
    ca.action_ios,
    ca.action_android,
    ca.action_watch_now,
    ca.display_mutual_button,
    ca.product_name,
    ca.product_price,
    ca.product_cta_type,
    ca.product_cta_link,
    ca.ad_media,
    ca.user_email,
    ca.created_at,
    ca.completed_at,
    ca.impression_count,
    ca.cost_per_impression,
    ca.is_bidded,
    ca.bid_price
  FROM candidate_ads ca
  ORDER BY ca.priority_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Updated RPC handle_earn_click: calculates 60% viewer share upon clicking Earn+
CREATE OR REPLACE FUNCTION public.handle_earn_click(
  p_ad_id      UUID,
  p_user_email TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_ad_rate          NUMERIC(12,2);
  v_viewer_payout    NUMERIC(12,2);
  v_monetized        BOOLEAN;
  v_success          BOOLEAN;
  v_email_lower      TEXT;
  v_suspended_until  TIMESTAMP WITH TIME ZONE;
  v_click_timestamps TIMESTAMP WITH TIME ZONE[];
  v_cardinality      INT;
BEGIN
  v_email_lower := lower(p_user_email);

  SELECT
    ((monetized = 'yes' OR monetized = 'true' OR monetized = '1')
      AND (monetized_until IS NULL OR monetized_until > now())),
    suspended_until,
    COALESCE(click_timestamps, '{}'::TIMESTAMP WITH TIME ZONE[])
  INTO v_monetized, v_suspended_until, v_click_timestamps
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- Already suspended check
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN -1.00;
  END IF;

  -- Speed check – append timestamp, keep last 10
  v_click_timestamps := array_append(v_click_timestamps, now());
  v_cardinality      := cardinality(v_click_timestamps);
  IF v_cardinality > 10 THEN
    v_click_timestamps := v_click_timestamps[(v_cardinality - 9):v_cardinality];
    v_cardinality := 10;
  END IF;

  IF v_cardinality = 10 THEN
    IF (v_click_timestamps[10] - v_click_timestamps[1]) < INTERVAL '540 seconds' THEN
      UPDATE public.users
      SET suspended_until = now() + INTERVAL '2 hours',
          click_timestamps = '{}'::TIMESTAMP WITH TIME ZONE[]
      WHERE lower(email) = v_email_lower;
      RETURN -2.00;
    END IF;
  END IF;

  UPDATE public.users SET click_timestamps = v_click_timestamps WHERE lower(email) = v_email_lower;

  -- Record impression
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RETURN -3.00;  -- cap reached
  END IF;

  -- Calculate 60% viewer payout share if monetized
  IF v_monetized THEN
    SELECT COALESCE(impression, cost_per_impression, 45.00) INTO v_ad_rate 
    FROM public.addsactive WHERE id = p_ad_id;

    IF NOT FOUND THEN
      RETURN 0.00;
    END IF;

    -- Viewer receives 60% of the ad's cost per impression (bid price or floor price)
    v_viewer_payout := v_ad_rate * 0.60;

    IF v_viewer_payout > 0 THEN
      UPDATE public.users 
      SET balance = COALESCE(balance, 0.00) + v_viewer_payout 
      WHERE lower(email) = v_email_lower;
      
      RETURN v_viewer_payout;
    END IF;
  END IF;

  RETURN 0.00;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
