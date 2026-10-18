-- ============================================================
-- MIGRATION: FEED RELIABILITY FIXES
-- Fixes: text-only ad constraint, ad completion sync to addsactive,
--        earn/mutual return codes (-3 instead of RAISE), is_paused in feed,
--        frequency cap enforcement, Seen RPC for dismiss button.
-- Run in Supabase SQL Editor -> New query -> Run
-- ============================================================

-- ============================================================
-- 1. Fix ad_media_type constraint and drop ad_impressions foreign key
-- ============================================================
ALTER TABLE public.adds DROP CONSTRAINT IF EXISTS adds_ad_media_type_check;
ALTER TABLE public.addsactive DROP CONSTRAINT IF EXISTS adds_ad_media_type_check;
ALTER TABLE public.ad_impressions DROP CONSTRAINT IF EXISTS ad_impressions_ad_id_fkey;

ALTER TABLE public.adds
  ADD CONSTRAINT adds_ad_media_type_check
  CHECK (ad_media_type IS NULL OR ad_media_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'mixed'::text]));

ALTER TABLE public.addsactive
  ADD CONSTRAINT adds_ad_media_type_check
  CHECK (ad_media_type IS NULL OR ad_media_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'mixed'::text]));

-- ============================================================
-- 2. Fix record_ad_impression:
--    - Syncs impression_count and completed_at to addsactive
--    - Ensures both tables stay consistent when an ad completes
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_count   BIGINT;
  v_max_impressions BIGINT;
  v_daily_count     INT;
  v_reset_date      DATE;
  v_daily_cap       INT;
  v_user_freq_cap   INT;
  v_user_views      INT;
  v_rollover_balance INT;
  v_campaign_days   INT;
  v_created_at      TIMESTAMP;
  v_is_rollover     BOOLEAN;
  v_email_lower     TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Check if user is suspended
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = v_email_lower
      AND suspended_until IS NOT NULL
      AND suspended_until > now()
  ) THEN
    RETURN FALSE;
  END IF;

  -- Fetch ad parameters from addsactive table
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
  FROM public.addsactive
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check total impression cap
  IF v_current_count >= v_max_impressions THEN
    -- Mark completed in addsactive table
    UPDATE public.addsactive SET completed_at = now() WHERE id = p_ad_id AND completed_at IS NULL;
    RETURN FALSE;
  END IF;

  -- Determine rollover mode
  v_is_rollover := (v_campaign_days IS NOT NULL AND (CURRENT_DATE - v_created_at::date) > v_campaign_days);

  -- Get user's current view count for this ad
  SELECT COALESCE(view_count, 0) INTO v_user_views
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND lower(user_email) = v_email_lower;

  -- Enforce user frequency cap (doubled in rollover mode)
  IF v_user_views IS NOT NULL THEN
    IF v_is_rollover AND v_user_views >= (v_user_freq_cap * 2) THEN
      RETURN FALSE;
    ELSIF NOT v_is_rollover AND v_user_views >= v_user_freq_cap THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Upsert user view record
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count)
  VALUES (p_ad_id, v_email_lower, 1)
  ON CONFLICT (user_email, ad_id)
  DO UPDATE SET view_count = ad_impressions.view_count + 1;

  -- Reset daily count if day has changed
  IF v_reset_date IS NULL OR v_reset_date < CURRENT_DATE THEN
    v_daily_count := 1;
    v_reset_date  := CURRENT_DATE;
  ELSE
    v_daily_count := v_daily_count + 1;
  END IF;

  -- Increment counts in addsactive table
  UPDATE public.addsactive
  SET
    impression_count       = COALESCE(impression_count, 0) + 1,
    daily_impression_count = v_daily_count,
    last_reset_date        = v_reset_date
  WHERE id = p_ad_id;

  v_current_count := v_current_count + 1;

  -- Mark ad completed in addsactive table when target reached
  IF v_current_count >= v_max_impressions THEN
    UPDATE public.addsactive SET completed_at = now() WHERE id = p_ad_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Create record_ad_seen – thin wrapper used by Seen/Dismiss button
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_ad_seen(
  p_ad_id       UUID,
  p_user_email  TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.record_ad_impression(p_ad_id, lower(p_user_email));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Fix handle_earn_click:
--    - Returns -3.00 instead of RAISE when impression cap / freq cap hit
--    - Suspension and speed checks unchanged
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_earn_click(
  p_ad_id      UUID,
  p_user_email TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_rate             NUMERIC(12,2);
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

  -- Already suspended
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
    RETURN -3.00;  -- cap reached – caller should dismiss ad, no exception
  END IF;

  -- Credit earnings if monetized
  IF v_monetized THEN
    SELECT COALESCE(cost_per_impression, 0.50) INTO v_rate FROM public.addsactive WHERE id = p_ad_id;
    IF NOT FOUND THEN
      RETURN 0.00;
    END IF;
    IF v_rate > 0 THEN
      UPDATE public.users SET balance = COALESCE(balance, 0.00) + v_rate WHERE lower(email) = v_email_lower;
      RETURN v_rate;
    END IF;
  END IF;

  RETURN 0.00;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Fix handle_mutual_click:
--    - Returns -3 instead of RAISE when impression cap / freq cap hit
--    - Suspension and speed checks unchanged
-- ============================================================
DROP FUNCTION IF EXISTS public.handle_mutual_click(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.handle_mutual_click(
  p_ad_id      UUID,
  p_user_email TEXT
) RETURNS INT AS $$
DECLARE
  v_publisher_email  TEXT;
  v_mutual_count     INT;
  v_mutuals          TEXT[];
  v_success          BOOLEAN;
  v_email_lower      TEXT;
  v_suspended_until  TIMESTAMP WITH TIME ZONE;
  v_click_timestamps TIMESTAMP WITH TIME ZONE[];
  v_cardinality      INT;
BEGIN
  v_email_lower := lower(p_user_email);

  SELECT
    COALESCE(mutual_count, 0),
    COALESCE(mutuals, '{}'::TEXT[]),
    suspended_until,
    COALESCE(click_timestamps, '{}'::TIMESTAMP WITH TIME ZONE[])
  INTO v_mutual_count, v_mutuals, v_suspended_until, v_click_timestamps
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- Already suspended
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN -1;
  END IF;

  -- Speed check
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
      RETURN -2;
    END IF;
  END IF;

  UPDATE public.users SET click_timestamps = v_click_timestamps WHERE lower(email) = v_email_lower;

  -- Enforce 50-mutual limit
  IF v_mutual_count >= 50 THEN
    RAISE EXCEPTION 'Mutual count limit (50) reached.';
  END IF;

  -- Fetch publisher email
  SELECT lower(user_email) INTO v_publisher_email FROM public.addsactive WHERE id = p_ad_id;
  IF NOT FOUND OR v_publisher_email IS NULL THEN
    RAISE EXCEPTION 'Ad publisher not found.';
  END IF;

  IF v_email_lower = v_publisher_email THEN
    RAISE EXCEPTION 'Cannot add yourself to mutuals.';
  END IF;

  -- Record impression
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RETURN -3;  -- cap reached – caller should dismiss ad, no exception
  END IF;

  -- Update mutuals if not already present
  IF NOT (v_publisher_email = ANY(v_mutuals)) THEN
    UPDATE public.users
    SET mutuals      = array_append(v_mutuals, v_publisher_email),
        mutual_count = v_mutual_count + 1
    WHERE lower(email) = v_email_lower;

    UPDATE public.addsactive
    SET mutual_adds_count = COALESCE(mutual_adds_count, 0) + 1
    WHERE id = p_ad_id;
  END IF;

  RETURN 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Fix get_user_feed:
--    - Adds is_paused = FALSE filter (was missing from v2)
--    - Keeps all existing demographic / cap logic
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_feed(text);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit      INT DEFAULT 10,
  p_offset     INT DEFAULT 0
)
RETURNS SETOF public.adds AS $$
DECLARE
  v_user        RECORD;
  v_age         INT;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  SELECT * INTO v_user FROM public.users WHERE lower(email) = v_email_lower LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_user.dob IS NOT NULL THEN
    v_age := date_part('year', age(v_user.dob::date));
  ELSE
    v_age := 25;
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.addsactive a
  WHERE
    -- Exclude completed ads
    a.completed_at IS NULL

    -- Exclude paused ads
    AND (a.is_paused IS NULL OR a.is_paused = FALSE)

    -- Exclude ads that hit total impression target
    AND (
      a.impressions IS NULL
      OR COALESCE(a.impression_count, 0) < a.impressions
    )

    -- Exclude ads this user has already seen >= frequency cap
    AND NOT EXISTS (
      SELECT 1 FROM public.ad_impressions imp
      WHERE imp.ad_id = a.id
        AND lower(imp.user_email) = v_email_lower
        AND imp.view_count >= COALESCE(a.user_frequency_cap, 1)
    )

    -- Bypass demographics for mutual targets; otherwise enforce demographics
    AND (
      v_email_lower = ANY(
        ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
      )
      OR (
        (a.country IS NULL OR a.country = '' OR lower(a.country) = lower(COALESCE(v_user.country, '')))
        AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user.gender, '')))
        AND (
          a.employment_status IS NULL OR a.employment_status = ''
          OR lower(COALESCE(v_user.employment, '')) = ANY(
            string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
          )
        )
        AND (
          a.age_range IS NULL OR cardinality(a.age_range) < 2
          OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
        )
        AND (
          a.targeting_all = TRUE
          OR a.interest   && v_user.interest
          OR a.lifestyle  && v_user.lifestyle
          OR a.personality && v_user.personality
          OR a.behavior   && v_user.behavior
          OR a.industry   && v_user.industry
        )
      )
    )

    -- Daily impression cap
    AND (
      a.daily_impression_cap IS NULL
      OR a.last_reset_date IS NULL
      OR a.last_reset_date < CURRENT_DATE
      OR COALESCE(a.daily_impression_count, 0) < COALESCE(
           a.daily_impression_cap + COALESCE(a.rollover_balance, 0),
           a.daily_impression_cap, 99999999
         )
    )

  ORDER BY
    -- Mutual targets first
    (CASE WHEN v_email_lower = ANY(
      ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
    ) THEN 0 ELSE 1 END) ASC,
    -- Then oldest campaign first
    a.created_at ASC,
    -- Random shuffle within tiers
    random()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. Grant permissions on all updated functions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_ad_seen(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_ad_seen(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_seen(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.handle_earn_click(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_earn_click(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_earn_click(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.handle_mutual_click(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_mutual_click(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_mutual_click(uuid, text) TO service_role;
