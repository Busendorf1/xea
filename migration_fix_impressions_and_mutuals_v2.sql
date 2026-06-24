-- ============================================================
-- MIGRATION V2: MUTUAL ADDS COUNT + EMAIL NORMALIZATION
-- Run this in your Supabase SQL Editor → New query → Run
-- ============================================================

-- 1. Add mutual_adds_count to adds and addsactive
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS mutual_adds_count integer DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS mutual_adds_count integer DEFAULT 0;

-- Initialize any NULLs to 0
UPDATE public.adds SET mutual_adds_count = 0 WHERE mutual_adds_count IS NULL;
UPDATE public.addsactive SET mutual_adds_count = 0 WHERE mutual_adds_count IS NULL;

-- 2. Normalize existing email data to lowercase in key tables
UPDATE public.adds SET user_email = lower(user_email) WHERE user_email IS NOT NULL;
UPDATE public.ad_impressions SET user_email = lower(user_email) WHERE user_email IS NOT NULL;
UPDATE public.users SET email = lower(email) WHERE email IS NOT NULL;

-- 3. Recreate get_user_feed: creators CAN see own ads, freq cap enforced, case-insensitive
-- Drop old versions first
DROP FUNCTION IF EXISTS public.get_user_feed(text);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS SETOF public.adds AS $$
DECLARE
  v_user RECORD;
  v_age INT;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fetch user profile traits (case-insensitive email lookup)
  SELECT * INTO v_user FROM public.users WHERE lower(email) = v_email_lower LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Compute age from DOB (handle NULL DOB gracefully)
  IF v_user.dob IS NOT NULL THEN
    v_age := date_part('year', age(v_user.dob::date));
  ELSE
    v_age := 25;
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
        AND lower(imp.user_email) = v_email_lower
        AND imp.view_count >= COALESCE(a.user_frequency_cap, 1)
    )

    -- Bypass demographics for mutual targets OR enforce demographics normally
    AND (
      v_email_lower = ANY(
        ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
      )
      OR (
        -- Country (case-insensitive)
        (a.country IS NULL OR a.country = '' OR lower(a.country) = lower(COALESCE(v_user.country, '')))
        -- Gender (case-insensitive, allows 'both')
        AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user.gender, '')))
        -- Employment (case-insensitive comma-separated list)
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
    (CASE WHEN v_email_lower = ANY(
      ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
    ) THEN 0 ELSE 1 END) ASC,
    -- Then by oldest campaign first (ensure they complete)
    a.created_at ASC,
    -- Random shuffle within tiers
    random()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recreate record_ad_impression with lowercase email normalization
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
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

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
    UPDATE public.adds SET completed_at = now() WHERE id = p_ad_id;
    RETURN FALSE;
  END IF;

  -- Determine rollover mode
  v_is_rollover := (v_campaign_days IS NOT NULL AND (CURRENT_DATE - v_created_at::date) > v_campaign_days);

  -- Get current user views for this ad (normalized email)
  SELECT COALESCE(view_count, 0) INTO v_user_views
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND lower(user_email) = v_email_lower;

  -- Check user frequency cap (doubled in rollover mode)
  IF v_user_views IS NOT NULL THEN
    IF v_is_rollover AND v_user_views >= (v_user_freq_cap * 2) THEN
      RETURN FALSE;
    ELSIF NOT v_is_rollover AND v_user_views >= v_user_freq_cap THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Upsert user view count (use normalized lowercase email)
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count)
  VALUES (p_ad_id, v_email_lower, 1)
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

-- 5. Create increment_mutual_adds_count function
DROP FUNCTION IF EXISTS public.increment_mutual_adds_count(uuid);

CREATE OR REPLACE FUNCTION public.increment_mutual_adds_count(
  p_ad_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE public.adds
  SET mutual_adds_count = COALESCE(mutual_adds_count, 0) + 1
  WHERE id = p_ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.increment_mutual_adds_count(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_mutual_adds_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_mutual_adds_count(uuid) TO service_role;

-- 7. Grant permissions on tables
GRANT ALL ON TABLE public.ad_impressions TO anon;
GRANT ALL ON TABLE public.ad_impressions TO authenticated;
GRANT ALL ON TABLE public.ad_impressions TO service_role;

-- ============================================================
-- DONE. Run this script to apply all V2 fixes.
-- ============================================================
