-- ============================================================
-- MIGRATION: SECURE & PERFECT MUTUALS INTEGRATION
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- Ensure the 'mutual_adds_count' column exists in both tables
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS mutual_adds_count integer DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS mutual_adds_count integer DEFAULT 0;

-- Initialize any existing NULLs to 0
UPDATE public.adds SET mutual_adds_count = 0 WHERE mutual_adds_count IS NULL;
UPDATE public.addsactive SET mutual_adds_count = 0 WHERE mutual_adds_count IS NULL;

-- 1. Create a secure RPC function to create ad campaigns
--    This atomically handles impressions calculation, mutual targeting,
--    and resets the advertiser's mutual count/list if display_mutual_button is ticked.
CREATE OR REPLACE FUNCTION public.submit_ad_campaign(
  p_id UUID,
  p_ad_type TEXT,
  p_industry TEXT[],
  p_interest TEXT[],
  p_lifestyle TEXT[],
  p_behavior TEXT[],
  p_personality TEXT[],
  p_age_range INT[],
  p_targeting_all BOOLEAN,
  p_impressions INT,
  p_campaign_days INT,
  p_user_frequency_cap INT,
  p_country TEXT,
  p_state TEXT,
  p_province TEXT,
  p_gender TEXT,
  p_employment_status TEXT,
  p_ad_media_type TEXT,
  p_ad_content TEXT,
  p_ad_action_buttons TEXT[],
  p_action_phone TEXT,
  p_action_whatsapp TEXT,
  p_action_website TEXT,
  p_action_email TEXT,
  p_cost_per_impression NUMERIC,
  p_total_cost NUMERIC,
  p_user_email TEXT,
  p_ad_media TEXT,
  p_display_mutual_button BOOLEAN
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_mutual_count INT;
  v_user_mutuals TEXT[];
  v_final_impressions INT;
  v_final_mutual_targets TEXT[];
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fetch advertiser's current mutual stats
  SELECT COALESCE(mutual_count, 0), COALESCE(mutuals, '{}'::TEXT[])
  INTO v_user_mutual_count, v_user_mutuals
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found for email %', v_email_lower;
  END IF;

  -- If mutuals are enabled and user has mutuals, add them to impressions and set them as targets
  IF p_display_mutual_button AND v_user_mutual_count > 0 THEN
    v_final_impressions := p_impressions + v_user_mutual_count;
    v_final_mutual_targets := v_user_mutuals;
  ELSE
    v_final_impressions := p_impressions;
    v_final_mutual_targets := '{}'::TEXT[];
  END IF;

  -- Insert into 'adds' table
  INSERT INTO public.adds (
    id,
    ad_type,
    industry,
    interest,
    lifestyle,
    behavior,
    personality,
    age_range,
    targeting_all,
    impressions,
    campaign_days,
    daily_impression_cap,
    daily_impression_count,
    last_reset_date,
    user_frequency_cap,
    country,
    state,
    province,
    gender,
    employment_status,
    ad_media_type,
    ad_content,
    ad_action_buttons,
    action_phone,
    action_whatsapp,
    action_website,
    action_email,
    cost_per_impression,
    total_cost,
    user_email,
    ad_media,
    display_mutual_button,
    mutual_targets,
    impression_count,
    mutual_adds_count,
    rollover_balance
  ) VALUES (
    p_id,
    p_ad_type,
    p_industry,
    p_interest,
    p_lifestyle,
    p_behavior,
    p_personality,
    p_age_range,
    p_targeting_all,
    v_final_impressions,
    p_campaign_days,
    CEIL(v_final_impressions::NUMERIC / p_campaign_days::NUMERIC)::INT,
    0,
    CURRENT_DATE,
    p_user_frequency_cap,
    p_country,
    p_state,
    p_province,
    p_gender,
    p_employment_status,
    p_ad_media_type,
    p_ad_content,
    p_ad_action_buttons,
    p_action_phone,
    p_action_whatsapp,
    p_action_website,
    p_action_email,
    p_cost_per_impression,
    p_total_cost,
    v_email_lower,
    p_ad_media,
    p_display_mutual_button,
    v_final_mutual_targets,
    0,
    0,
    0
  );

  -- Reset advertiser's mutual count and clear their list to spend them
  IF p_display_mutual_button AND v_user_mutual_count > 0 THEN
    UPDATE public.users
    SET mutuals = '{}'::TEXT[],
        mutual_count = 0,
        last_mutual_spent = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create a secure RPC function to handle Earn+ button clicks
--    This validates monetization, calls record_ad_impression, and credits the wallet balance safely.
CREATE OR REPLACE FUNCTION public.handle_earn_click(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC(12,2);
  v_monetized BOOLEAN;
  v_success BOOLEAN;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- 1. Check if user is monetized
  SELECT (monetized = 'yes' OR monetized = 'true' OR monetized = '1') INTO v_monetized
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- 2. Record ad impression (updates counts & checks limits/caps)
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RAISE EXCEPTION 'Ad view limit reached or frequency capped.';
  END IF;

  -- 3. Credit wallet balance if monetized
  IF v_monetized THEN
    -- Fetch ad rate from adds table
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


-- 3. Create a secure RPC function to handle Mutual+ button clicks
--    This enforces the 50 mutuals limit, updates mutual lists, and increments ad counts safely.
CREATE OR REPLACE FUNCTION public.handle_mutual_click(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_publisher_email TEXT;
  v_mutual_count INT;
  v_mutuals TEXT[];
  v_success BOOLEAN;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- 1. Fetch viewer's current mutuals
  SELECT COALESCE(mutual_count, 0), COALESCE(mutuals, '{}'::TEXT[])
  INTO v_mutual_count, v_mutuals
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- 2. Enforce Max Limit of 50 mutuals
  IF v_mutual_count >= 50 THEN
    RAISE EXCEPTION 'Mutual count limit (50) reached.';
  END IF;

  -- 3. Fetch publisher email from the ad
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

  -- 4. Record the impression
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RAISE EXCEPTION 'Ad view limit reached or frequency capped.';
  END IF;

  -- 5. Add publisher to viewer's mutuals array if not already present
  IF NOT (v_publisher_email = ANY(v_mutuals)) THEN
    UPDATE public.users
    SET mutuals = array_append(v_mutuals, v_publisher_email),
        mutual_count = v_mutual_count + 1
    WHERE lower(email) = v_email_lower;

    -- 6. Increment mutual_adds_count on the ad in both tables
    UPDATE public.adds
    SET mutual_adds_count = COALESCE(mutual_adds_count, 0) + 1
    WHERE id = p_ad_id;

    UPDATE public.addsactive
    SET mutual_adds_count = COALESCE(mutual_adds_count, 0) + 1
    WHERE id = p_ad_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Grant execution permissions on all new RPC functions
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN) TO service_role;

GRANT EXECUTE ON FUNCTION public.handle_earn_click(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_earn_click(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_earn_click(UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.handle_mutual_click(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_mutual_click(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_mutual_click(UUID, TEXT) TO service_role;
