-- MIGRATION: MUTUALS & BALANCE INTEGRATION
-- Execute this SQL script in your Supabase SQL Editor to provision the columns.

-- 1. Create or update balance and withdrawal tracking on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric(12,2) DEFAULT 0.00;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS withdrawal numeric(12,2) DEFAULT 0.00;

-- 2. Create mutual counts and tracking lists on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mutual_count integer DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mutuals text[] DEFAULT '{}'::text[];
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_mutual_spent timestamp with time zone;

-- 3. Add mutual campaign indicators and lists to ads tables
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS display_mutual_button boolean DEFAULT true;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS mutual_targets text[] DEFAULT '{}'::text[];

ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS display_mutual_button boolean DEFAULT true;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS mutual_targets text[] DEFAULT '{}'::text[];

-- 4. Re-declare get_user_feed function to bypass demographic constraints for mutual targets
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
    
    -- Bypassed targeting if the user is explicitly targeted as a mutual, OR standard demographics match:
    AND (
      p_user_email = ANY(a.mutual_targets)
      OR (
        -- Demographic restrictions: country
        (
          a.country IS NULL 
          OR a.country = '' 
          OR a.country ILIKE v_user.country
          OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
        )
        -- Demographic restrictions: gender
        AND (
          a.gender IS NULL 
          OR a.gender = '' 
          OR a.gender = 'both' 
          OR a.gender ILIKE v_user.gender
          OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
        )
        -- Demographic restrictions: employment status
        AND (
          a.employment_status IS NULL 
          OR a.employment_status = '' 
          OR lower(v_user.employment) = ANY(string_to_array(replace(lower(a.employment_status), ' ', ''), ','))
          OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
        )
        -- Demographic restrictions: age range
        AND (
          a.age_range IS NULL 
          OR cardinality(a.age_range) < 2 
          OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
          OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
        )
        -- Targeting interests/lifestyle/etc.
        AND (
          a.targeting_all = TRUE
          OR a.interest && v_user.interest
          OR a.lifestyle && v_user.lifestyle
          OR a.personality && v_user.personality
          OR a.behavior && v_user.behavior
          OR a.industry && v_user.industry
          OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
        )
      )
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
