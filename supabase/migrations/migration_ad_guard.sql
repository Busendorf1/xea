-- Migration: Ad Guard Compliance & Suspension System

-- 1. Add suspended_until and click_timestamps to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS click_timestamps TIMESTAMP WITH TIME ZONE[] DEFAULT '{}'::TIMESTAMP WITH TIME ZONE[];

-- 2. Update record_ad_impression to check for suspension
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

  -- Check if user is suspended
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = v_email_lower
      AND suspended_until IS NOT NULL
      AND suspended_until > now()
  ) THEN
    RETURN FALSE;
  END IF;

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

-- 3. Update handle_earn_click to perform click speed tracking & suspension checks
CREATE OR REPLACE FUNCTION public.handle_earn_click(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC(12,2);
  v_monetized BOOLEAN;
  v_success BOOLEAN;
  v_email_lower TEXT;
  v_suspended_until TIMESTAMP WITH TIME ZONE;
  v_click_timestamps TIMESTAMP WITH TIME ZONE[];
  v_cardinality INT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fetch viewer details (checks if monetized and subscription has not expired)
  SELECT
    ((monetized = 'yes' OR monetized = 'true' OR monetized = '1') AND (monetized_until IS NULL OR monetized_until > now())),
    suspended_until,
    COALESCE(click_timestamps, '{}'::TIMESTAMP WITH TIME ZONE[])
  INTO
    v_monetized,
    v_suspended_until,
    v_click_timestamps
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- Check if already suspended
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN -1.00;
  END IF;

  -- Append current click timestamp
  v_click_timestamps := array_append(v_click_timestamps, now());
  v_cardinality := cardinality(v_click_timestamps);

  -- Keep only the last 10 elements
  IF v_cardinality > 10 THEN
    v_click_timestamps := v_click_timestamps[(v_cardinality - 9):v_cardinality];
    v_cardinality := 10;
  END IF;

  -- Check if average gap between 10 clicks is < 60 seconds (total span < 540s)
  IF v_cardinality = 10 THEN
    IF (v_click_timestamps[10] - v_click_timestamps[1]) < INTERVAL '540 seconds' THEN
      UPDATE public.users
      SET suspended_until = now() + INTERVAL '2 hours',
          click_timestamps = '{}'::TIMESTAMP WITH TIME ZONE[]
      WHERE lower(email) = v_email_lower;
      RETURN -2.00;
    END IF;
  END IF;

  -- Save updated click timestamps
  UPDATE public.users
  SET click_timestamps = v_click_timestamps
  WHERE lower(email) = v_email_lower;

  -- Record ad impression
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RAISE EXCEPTION 'Ad view limit reached or frequency capped.';
  END IF;

  -- Credit wallet balance if monetized
  IF v_monetized THEN
    SELECT COALESCE(cost_per_impression, 0.50) INTO v_rate
    FROM public.adds
    WHERE id = p_ad_id;
    
    IF NOT FOUND THEN
      SELECT COALESCE(cost_per_impression, 0.50) INTO v_rate
      FROM public.addsactive
      WHERE id = p_ad_id;
    END IF;

    IF v_rate > 0 THEN
      UPDATE public.users
      SET balance = COALESCE(balance, 0.00) + v_rate
      WHERE lower(email) = v_email_lower;
      
      RETURN v_rate;
    END IF;
  END IF;

  RETURN 0.00;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recreate handle_mutual_click to return INT and perform speed checks
DROP FUNCTION IF EXISTS public.handle_mutual_click(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.handle_mutual_click(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS INT AS $$
DECLARE
  v_publisher_email TEXT;
  v_mutual_count INT;
  v_mutuals TEXT[];
  v_success BOOLEAN;
  v_email_lower TEXT;
  v_suspended_until TIMESTAMP WITH TIME ZONE;
  v_click_timestamps TIMESTAMP WITH TIME ZONE[];
  v_cardinality INT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fetch viewer details
  SELECT
    COALESCE(mutual_count, 0),
    COALESCE(mutuals, '{}'::TEXT[]),
    suspended_until,
    COALESCE(click_timestamps, '{}'::TIMESTAMP WITH TIME ZONE[])
  INTO
    v_mutual_count,
    v_mutuals,
    v_suspended_until,
    v_click_timestamps
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- Check if already suspended
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN -1;
  END IF;

  -- Append current click timestamp
  v_click_timestamps := array_append(v_click_timestamps, now());
  v_cardinality := cardinality(v_click_timestamps);

  -- Keep only the last 10 elements
  IF v_cardinality > 10 THEN
    v_click_timestamps := v_click_timestamps[(v_cardinality - 9):v_cardinality];
    v_cardinality := 10;
  END IF;

  -- Check if average gap between 10 clicks is < 60 seconds (total span < 540s)
  IF v_cardinality = 10 THEN
    IF (v_click_timestamps[10] - v_click_timestamps[1]) < INTERVAL '540 seconds' THEN
      UPDATE public.users
      SET suspended_until = now() + INTERVAL '2 hours',
          click_timestamps = '{}'::TIMESTAMP WITH TIME ZONE[]
      WHERE lower(email) = v_email_lower;
      RETURN -2;
    END IF;
  END IF;

  -- Save updated click timestamps
  UPDATE public.users
  SET click_timestamps = v_click_timestamps
  WHERE lower(email) = v_email_lower;

  -- Enforce Max Limit of 50 mutuals
  IF v_mutual_count >= 50 THEN
    RAISE EXCEPTION 'Mutual count limit (50) reached.';
  END IF;

  -- Fetch publisher email from the ad
  SELECT lower(user_email) INTO v_publisher_email
  FROM public.adds
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    SELECT lower(user_email) INTO v_publisher_email
    FROM public.addsactive
    WHERE id = p_ad_id;
  END IF;

  IF v_publisher_email IS NULL THEN
    RAISE EXCEPTION 'Ad publisher not found.';
  END IF;

  -- Prevent mutual-ing oneself
  IF v_email_lower = v_publisher_email THEN
    RAISE EXCEPTION 'Cannot add yourself to mutuals.';
  END IF;

  -- Record the impression
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RAISE EXCEPTION 'Ad view limit reached or frequency capped.';
  END IF;

  -- Add publisher to viewer's mutuals array if not already present
  IF NOT (v_publisher_email = ANY(v_mutuals)) THEN
    UPDATE public.users
    SET mutuals = array_append(v_mutuals, v_publisher_email),
        mutual_count = v_mutual_count + 1
    WHERE lower(email) = v_email_lower;

    -- Increment mutual_adds_count on the ad in both tables
    UPDATE public.adds
    SET mutual_adds_count = COALESCE(mutual_adds_count, 0) + 1
    WHERE id = p_ad_id;

    UPDATE public.addsactive
    SET mutual_adds_count = COALESCE(mutual_adds_count, 0) + 1
    WHERE id = p_ad_id;
  END IF;

  RETURN 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant execution permissions on the updated RPC functions
GRANT EXECUTE ON FUNCTION public.handle_earn_click(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_earn_click(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_earn_click(UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.handle_mutual_click(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_mutual_click(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_mutual_click(UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text) TO service_role;
