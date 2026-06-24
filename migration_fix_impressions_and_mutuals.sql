-- ============================================================
-- MIGRATION FIX: IMPRESSIONS, FREQUENCY CAP, MUTUALS
-- Run this in your Supabase SQL Editor → New query → Run
-- ============================================================

-- 1. Add ALL missing columns to addsactive (mirrors adds structure)
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS campaign_days integer DEFAULT 1;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS daily_impression_cap integer;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS daily_impression_count integer DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS last_reset_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS user_frequency_cap integer DEFAULT 1;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS display_mutual_button boolean DEFAULT true;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS mutual_targets text[] DEFAULT '{}'::text[];
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS rollover_balance integer DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS display_mutual_button boolean DEFAULT true;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS mutual_targets text[] DEFAULT '{}'::text[];

-- 2. Initialize impression_count to 0 where NULL (prevents NULL arithmetic issues)
UPDATE public.adds SET impression_count = 0 WHERE impression_count IS NULL;
UPDATE public.addsactive SET impression_count = 0 WHERE impression_count IS NULL;

-- 3. Add missing columns to users table (for balance and mutuals)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric(12,2) DEFAULT 0.00;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS withdrawal numeric(12,2) DEFAULT 0.00;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mutual_count integer DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mutuals text[] DEFAULT '{}'::text[];
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_mutual_spent timestamp with time zone;

-- 4. Ensure ad_impressions table exists with correct structure
CREATE TABLE IF NOT EXISTS public.ad_impressions (
    id BIGSERIAL PRIMARY KEY,
    ad_id UUID REFERENCES public.adds(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    view_count integer DEFAULT 1
);
ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_impressions_user_ad ON public.ad_impressions(user_email, ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_email ON public.ad_impressions(user_email);

-- 5. DROP ALL existing overloaded versions of get_user_feed to resolve PGRST203
DROP FUNCTION IF EXISTS public.get_user_feed(text);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer, integer);

-- 6. Create a single canonical get_user_feed with all features:
--    - frequency cap enforcement (per user view count)
--    - total impressions cap (stops showing when impressions target reached)
--    - daily impression cap
--    - mutual targets bypass (mutuals see ad regardless of demographics)
--    - completed_at exclusion (ads marked done are hidden)
CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS SETOF public.adds AS $$
DECLARE
  v_user RECORD;
  v_age INT;
BEGIN
  -- Fetch user profile traits
  SELECT * INTO v_user FROM public.users WHERE email ILIKE p_user_email LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Compute age from DOB (handle NULL DOB gracefully)
  IF v_user.dob IS NOT NULL THEN
    v_age := date_part('year', age(v_user.dob::date));
  ELSE
    v_age := 25; -- sensible default
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.adds a
  WHERE
    -- Exclude completed ads
    a.completed_at IS NULL

    -- Exclude ads that have already reached their total impression target
    AND (
      a.impressions IS NULL
      OR COALESCE(a.impression_count, 0) < a.impressions
    )

    -- Exclude ads this user has already seen >= their frequency cap
    AND NOT EXISTS (
      SELECT 1 FROM public.ad_impressions imp
      WHERE imp.ad_id = a.id
        AND imp.user_email = p_user_email
        AND imp.view_count >= COALESCE(a.user_frequency_cap, 1)
    )

    -- Bypass demographics for mutual targets OR enforce demographics normally
    AND (
      p_user_email = ANY(COALESCE(a.mutual_targets, '{}'::text[]))
      OR (
        -- Country
        (a.country IS NULL OR a.country = '' OR a.country ILIKE v_user.country)
        -- Gender
        AND (a.gender IS NULL OR a.gender = '' OR a.gender = 'both' OR a.gender ILIKE v_user.gender)
        -- Employment
        AND (
          a.employment_status IS NULL
          OR a.employment_status = ''
          OR lower(COALESCE(v_user.employment, '')) = ANY(
            string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
          )
        )
        -- Age range
        AND (
          a.age_range IS NULL
          OR cardinality(a.age_range) < 2
          OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
        )
        -- Interest targeting
        AND (
          a.targeting_all = TRUE
          OR a.interest && v_user.interest
          OR a.lifestyle && v_user.lifestyle
          OR a.personality && v_user.personality
          OR a.behavior && v_user.behavior
          OR a.industry && v_user.industry
        )
      )
    )

    -- Daily impression cap (reset if last_reset_date < today)
    AND (
      a.daily_impression_cap IS NULL
      OR a.last_reset_date IS NULL
      OR a.last_reset_date < CURRENT_DATE
      OR COALESCE(a.daily_impression_count, 0) < COALESCE(a.daily_impression_cap + COALESCE(a.rollover_balance, 0), a.daily_impression_cap, 99999999)
    )

  ORDER BY
    -- Prioritize mutual-targeted ads first
    (CASE WHEN p_user_email = ANY(COALESCE(a.mutual_targets, '{}'::text[])) THEN 0 ELSE 1 END) ASC,
    -- Then by oldest campaign first (ensure they complete)
    a.created_at ASC,
    -- Random shuffle within tiers
    random()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. DROP and RECREATE record_ad_impression to fix addsactive column error and enforce total cap correctly
DROP FUNCTION IF EXISTS public.record_ad_impression(uuid, text);
DROP FUNCTION IF EXISTS public.record_ad_impression(text, text);

CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_count BIGINT;
  v_max_impressions BIGINT;
  v_daily_count INT;
  v_reset_date DATE;
  v_daily_cap INT;
  v_user_freq_cap INT;
  v_user_views INT;
  v_rollover_balance INT;
  v_campaign_days INT;
  v_created_at TIMESTAMP;
  v_is_rollover BOOLEAN;
BEGIN
  -- Fetch current parameters for the ad from adds table
  SELECT
    COALESCE(user_frequency_cap, 1),
    COALESCE(daily_impression_cap, 99999999),
    COALESCE(daily_impression_count, 0),
    COALESCE(last_reset_date, CURRENT_DATE),
    COALESCE(rollover_balance, 0),
    COALESCE(campaign_days, 1),
    created_at,
    COALESCE(impressions, 99999999),
    COALESCE(impression_count, 0)
  INTO
    v_user_freq_cap,
    v_daily_cap,
    v_daily_count,
    v_reset_date,
    v_rollover_balance,
    v_campaign_days,
    v_created_at,
    v_max_impressions,
    v_current_count
  FROM public.adds
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check if this ad has already hit its total impression cap
  IF v_current_count >= v_max_impressions THEN
    -- Mark as completed and stop
    UPDATE public.adds SET completed_at = now() WHERE id = p_ad_id;
    RETURN FALSE;
  END IF;

  -- Determine rollover mode
  v_is_rollover := (v_campaign_days IS NOT NULL AND (CURRENT_DATE - v_created_at::date) > v_campaign_days);

  -- Get current user views for this ad
  SELECT COALESCE(view_count, 0) INTO v_user_views
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND user_email = p_user_email;

  -- Check user frequency cap (doubled in rollover mode)
  IF v_user_views IS NOT NULL THEN
    IF v_is_rollover AND v_user_views >= (v_user_freq_cap * 2) THEN
      RETURN FALSE;
    ELSIF NOT v_is_rollover AND v_user_views >= v_user_freq_cap THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Upsert user view count
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count)
  VALUES (p_ad_id, p_user_email, 1)
  ON CONFLICT (user_email, ad_id)
  DO UPDATE SET view_count = ad_impressions.view_count + 1;

  -- Lazy reset daily count if date rolled over
  IF v_reset_date IS NULL OR v_reset_date < CURRENT_DATE THEN
    v_daily_count := 1;
    v_reset_date := CURRENT_DATE;
  ELSE
    v_daily_count := v_daily_count + 1;
  END IF;

  -- Atomically increment total impression count + daily count
  UPDATE public.adds
  SET
    impression_count = COALESCE(impression_count, 0) + 1,
    daily_impression_count = v_daily_count,
    last_reset_date = v_reset_date
  WHERE id = p_ad_id
  RETURNING COALESCE(impression_count, 0) INTO v_current_count;

  -- Mark ad as completed if total impression target is reached
  IF v_current_count >= v_max_impressions THEN
    UPDATE public.adds
    SET completed_at = now()
    WHERE id = p_ad_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Grant execute permissions for both new functions
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO service_role;

-- 9. Grant permissions on ad_impressions table
GRANT ALL ON TABLE public.ad_impressions TO anon;
GRANT ALL ON TABLE public.ad_impressions TO authenticated;
GRANT ALL ON TABLE public.ad_impressions TO service_role;

-- ============================================================
-- DONE. Run this script to fix all impression tracking issues.
-- ============================================================
