-- MIGRATION: AD CAMPAIGN ROLLOVER & PRIORITIZATION
-- Run this SQL in your Supabase Dashboard -> SQL Editor.

-- 1. Alter adds and addsactive tables to add tracking columns
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS rollover_balance integer DEFAULT 0;

ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS rollover_balance integer DEFAULT 0;

-- 2. Update the record_ad_impression RPC function to support rollover math and completed status
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_count INT;
  v_max_impressions INT;
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
  -- Fetch current parameters for the ad
  SELECT COALESCE(user_frequency_cap, 1), daily_impression_cap, daily_impression_count, last_reset_date, rollover_balance, campaign_days, created_at, impressions
  INTO v_user_freq_cap, v_daily_cap, v_daily_count, v_reset_date, v_rollover_balance, v_campaign_days, v_created_at, v_max_impressions
  FROM public.adds
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    -- Fallback to addsactive if not in adds (though adds should contain all)
    SELECT COALESCE(user_frequency_cap, 1), daily_impression_cap, daily_impression_count, last_reset_date, rollover_balance, campaign_days, created_at, impressions
    INTO v_user_freq_cap, v_daily_cap, v_daily_count, v_reset_date, v_rollover_balance, v_campaign_days, v_created_at, v_max_impressions
    FROM public.addsactive
    WHERE id = p_ad_id;
    
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Determine if campaign is in rollover mode (past scheduled days)
  v_is_rollover := (v_campaign_days IS NOT NULL AND (CURRENT_DATE - v_created_at::date) > v_campaign_days);

  -- Fetch current user views
  SELECT view_count INTO v_user_views
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND user_email = p_user_email;

  -- If user has already reached/exceeded frequency limit, check if frequency cap should be doubled in rollover mode
  IF v_user_views IS NOT NULL THEN
    IF v_is_rollover THEN
      IF v_user_views >= (v_user_freq_cap * 2) THEN
        RETURN FALSE;
      END IF;
    ELSE
      IF v_user_views >= v_user_freq_cap THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;

  -- Upsert the user view count in the ad_impressions join table
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count)
  VALUES (p_ad_id, p_user_email, 1)
  ON CONFLICT (user_email, ad_id)
  DO UPDATE SET view_count = ad_impressions.view_count + 1;

  -- Calculate daily counts and handle daily rollover balance reset
  IF v_reset_date IS NULL OR v_reset_date < CURRENT_DATE THEN
    -- It is a new day! Carry over any under-delivered impressions from yesterday
    IF v_reset_date IS NOT NULL AND v_daily_cap IS NOT NULL THEN
      -- Under-delivered = baseline cap - actually delivered yesterday
      v_rollover_balance := COALESCE(v_rollover_balance, 0) + GREATEST(0, v_daily_cap - COALESCE(v_daily_count, 0));
    END IF;
    v_daily_count := 1;
    v_reset_date := CURRENT_DATE;
  ELSE
    v_daily_count := COALESCE(v_daily_count, 0) + 1;
    -- If we are delivering past the baseline cap, decrement our rollover balance
    IF v_daily_cap IS NOT NULL AND v_daily_count > v_daily_cap AND COALESCE(v_rollover_balance, 0) > 0 THEN
      v_rollover_balance := v_rollover_balance - 1;
    END IF;
  END IF;

  -- Increment total impression count and update daily cap / rollover values atomically in adds
  UPDATE public.adds
  SET impression_count = COALESCE(impression_count, 0) + 1,
      daily_impression_count = v_daily_count,
      last_reset_date = v_reset_date,
      rollover_balance = COALESCE(v_rollover_balance, 0)
  WHERE id = p_ad_id
  RETURNING impression_count INTO v_current_count;

  -- Also update addsactive table to keep active stats in sync
  UPDATE public.addsactive
  SET impression_count = COALESCE(impression_count, 0) + 1,
      daily_impression_count = v_daily_count,
      last_reset_date = v_reset_date,
      rollover_balance = COALESCE(v_rollover_balance, 0)
  WHERE id = p_ad_id;

  -- Set completed_at timestamp instead of deleting the ad if targeted impressions are met
  IF v_current_count >= v_max_impressions THEN
    UPDATE public.adds 
    SET completed_at = timezone('utc'::text, now()) 
    WHERE id = p_ad_id;

    UPDATE public.addsactive 
    SET completed_at = timezone('utc'::text, now()) 
    WHERE id = p_ad_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the get_user_feed RPC function to filter out completed ads,
-- implement target broadening, viewer frequency cap doubling, and prioritize older/rollover campaigns.
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

  -- Compute age from DOB
  v_age := date_part('year', age(v_user.dob));

  -- Query and return prioritizing matching ads
  RETURN QUERY
  SELECT a.*
  FROM public.adds a
  WHERE 
    -- Exclude completed ads
    a.completed_at IS NULL
    
    -- Exclude ads this user has already seen up to/exceeding their frequency cap
    -- (Frequency cap is dynamically doubled in rollover mode)
    AND NOT EXISTS (
      SELECT 1 FROM public.ad_impressions imp 
      WHERE imp.ad_id = a.id 
        AND imp.user_email = p_user_email 
        AND imp.view_count >= (
          CASE 
            WHEN a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days 
            THEN COALESCE(a.user_frequency_cap, 1) * 2
            ELSE COALESCE(a.user_frequency_cap, 1)
          END
        )
    )
    -- Demographic restrictions: country (Ignored in rollover mode due to Target Broadening)
    AND (
      a.country IS NULL 
      OR a.country = '' 
      OR a.country ILIKE v_user.country
      OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
    )
    -- Demographic restrictions: gender (Ignored in rollover mode due to Target Broadening)
    AND (
      a.gender IS NULL 
      OR a.gender = '' 
      OR a.gender = 'both' 
      OR a.gender ILIKE v_user.gender
      OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
    )
    -- Demographic restrictions: employment status (Ignored in rollover mode due to Target Broadening)
    AND (
      a.employment_status IS NULL 
      OR a.employment_status = '' 
      OR lower(v_user.employment) = ANY(string_to_array(replace(lower(a.employment_status), ' ', ''), ','))
      OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
    )
    -- Demographic restrictions: age range (Ignored in rollover mode due to Target Broadening)
    AND (
      a.age_range IS NULL 
      OR cardinality(a.age_range) < 2 
      OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
      OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
    )
    -- Targeting interests/lifestyle/etc. (Ignored in rollover mode due to Target Broadening)
    AND (
      a.targeting_all = TRUE
      OR a.interest && v_user.interest
      OR a.lifestyle && v_user.lifestyle
      OR a.personality && v_user.personality
      OR a.behavior && v_user.behavior
      OR a.industry && v_user.industry
      OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
    )
    -- Daily impression capping logic with rollover:
    AND (
      a.daily_impression_cap IS NULL
      OR a.last_reset_date IS NULL
      OR a.last_reset_date < CURRENT_DATE
      OR a.daily_impression_count < (a.daily_impression_cap + COALESCE(a.rollover_balance, 0))
    )
  ORDER BY 
    -- 1. Prioritize ads in rollover mode first (Extended campaigns)
    (CASE WHEN a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days THEN 0 ELSE 1 END) ASC,
    -- 2. Prioritize oldest campaigns first (Ensure they meet target)
    a.created_at ASC,
    -- 3. Random shuffle within identical priority tiers
    random()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create a cleanup function to delete completed ads after 24 hours
CREATE OR REPLACE FUNCTION public.delete_expired_completed_ads()
RETURNS void AS $$
BEGIN
  -- Delete completed ads from adds active and review table after 24 hours of completion
  DELETE FROM public.adds WHERE completed_at < (now() - interval '24 hours');
  DELETE FROM public.addsactive WHERE completed_at < (now() - interval '24 hours');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.delete_expired_completed_ads() TO anon;
GRANT EXECUTE ON FUNCTION public.delete_expired_completed_ads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_completed_ads() TO service_role;
