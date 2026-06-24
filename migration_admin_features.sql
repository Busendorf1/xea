-- ============================================================
-- MIGRATION: ADMIN DASHBOARD DATABASE CHANGES
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- 1. Add 'is_paused' column to ads and highlights tables if not exists
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;

-- Initialize existing records
UPDATE public.adds SET is_paused = FALSE WHERE is_paused IS NULL;
UPDATE public.addsactive SET is_paused = FALSE WHERE is_paused IS NULL;
UPDATE public.news SET is_paused = FALSE WHERE is_paused IS NULL;
UPDATE public.newsactive SET is_paused = FALSE WHERE is_paused IS NULL;

-- 2. Update 'get_user_feed' RPC function to fetch from 'addsactive' and respect 'is_paused'
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

  -- Query and return prioritizing matching active and unpaused ads
  RETURN QUERY
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
    a.country,
    a.state,
    a.province,
    a.gender,
    a.employment_status,
    a.ad_media_type,
    a.ad_content,
    a.ad_media_url,
    a.ad_action_buttons,
    a.action_phone,
    a.action_whatsapp,
    a.action_website,
    a.action_email,
    a.cost_per_impression,
    a.total_cost,
    a.created_at,
    a.email,
    a.user_id,
    a.ad_media,
    a.impression_count,
    a.seen_users,
    a.user_email,
    a.campaign_days,
    a.daily_impression_cap,
    a.daily_impression_count,
    a.last_reset_date,
    a.user_frequency_cap,
    a.completed_at,
    a.rollover_balance,
    a.display_mutual_button,
    a.mutual_targets,
    a.mutual_adds_count,
    a.is_paused
  FROM public.addsactive a
  WHERE 
    -- Exclude completed and paused ads
    a.completed_at IS NULL
    AND a.is_paused = FALSE
    
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

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO service_role;
