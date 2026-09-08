-- ==============================================================================
-- FIX: Safe get_user_feed RPC with Bulletproof Date & Placeholder Guards
-- (dob is of type DATE in public.users, so comparison must cast to ::text)
-- ==============================================================================

-- 1. Drop existing functions to avoid parameter ambiguity
DROP FUNCTION IF EXISTS public.get_user_feed(text);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer, integer);

-- 2. Update users with null or sentinel dates (casting dob::text prevents 22007)
UPDATE public.users 
SET dob = '1970-01-01'::date 
WHERE dob IS NULL OR dob::text = '1970-01-01';

-- 3. Create canonical get_user_feed RPC
CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  ad_type TEXT,
  industry TEXT[],
  interest TEXT[],
  lifestyle TEXT[],
  behavior TEXT[],
  personality TEXT[],
  age_range INT[],
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
) AS 
DECLARE
  v_user_dob          DATE;
  v_user_country      TEXT;
  v_user_state        TEXT;
  v_user_location     TEXT;
  v_user_gender       TEXT;
  v_user_employment   TEXT;
  v_user_interest     TEXT[];
  v_user_lifestyle    TEXT[];
  v_user_personality  TEXT[];
  v_user_behavior     TEXT[];
  v_user_industry     TEXT[];
  v_age               INT;
  v_email_lower       TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- 1. Fetch complete viewer demographics & psychographics safely
  SELECT 
    COALESCE(u.dob, '1970-01-01'::date),
    NULLIF(u.country, 'PLACEHOLDER'),
    NULLIF(u.state, 'PLACEHOLDER'),
    NULLIF(u.location, 'PLACEHOLDER'),
    u.gender,
    COALESCE(u.employment, u.employment_status),
    u.interest,
    u.lifestyle,
    u.personality,
    u.behavior,
    u.industry
  INTO 
    v_user_dob, v_user_country, v_user_state, v_user_location,
    v_user_gender, v_user_employment,
    v_user_interest, v_user_lifestyle, v_user_personality, v_user_behavior, v_user_industry
  FROM public.users u
  WHERE lower(u.email) = v_email_lower
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_user_dob IS NOT NULL AND v_user_dob != '1970-01-01'::date THEN
    v_age := date_part('year', age(v_user_dob));
  ELSE
    v_age := 25; -- Demographically compliant median fallback
  END IF;

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
      COALESCE(a.user_frequency_cap, 1) AS user_frequency_cap,
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
      COALESCE(a.impression_count, 0) AS impression_count,
      COALESCE(a.cost_per_impression, 25.0) AS cost_per_impression,
      (b.id IS NOT NULL) AS is_bidded,
      COALESCE(b.bid_price, a.cost_per_impression, 25.0) AS bid_price,

      -- Check Rollover state
      CASE 
        WHEN a.campaign_days IS NOT NULL 
             AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
             AND COALESCE(a.impression_count, 0) < COALESCE(a.impressions, 1000)
        THEN true 
        ELSE false 
      END AS ad_is_rollover,

      -- Content Relevance Affinity Score (0 - 100)
      (
        CASE WHEN a.targeting_all = true THEN 15.0 ELSE 0.0 END
        + CASE WHEN a.industry IS NOT NULL AND v_user_industry IS NOT NULL AND a.industry && v_user_industry THEN 25.0 ELSE 0.0 END
        + CASE WHEN a.interest IS NOT NULL AND v_user_interest IS NOT NULL AND a.interest && v_user_interest THEN 25.0 ELSE 0.0 END
        + CASE WHEN a.lifestyle IS NOT NULL AND v_user_lifestyle IS NOT NULL AND a.lifestyle && v_user_lifestyle THEN 15.0 ELSE 0.0 END
        + CASE WHEN a.behavior IS NOT NULL AND v_user_behavior IS NOT NULL AND a.behavior && v_user_behavior THEN 10.0 ELSE 0.0 END
        + CASE WHEN a.personality IS NOT NULL AND v_user_personality IS NOT NULL AND a.personality && v_user_personality THEN 10.0 ELSE 0.0 END
      ) AS relevance_affinity,

      -- Bidded ads receive strong initial score (75.0 + bid scaling)
      CASE 
        WHEN b.id IS NOT NULL THEN 75.0 + (COALESCE(b.bid_price, 0) / 50.0)
        ELSE 0.0
      END AS auction_base_score

    FROM public.addsactive a
    LEFT JOIN public.bidded_ads b ON b.ad_id = a.id AND b.is_active = true
    WHERE a.completed_at IS NULL
      AND (a.is_paused IS NULL OR a.is_paused = false)
      AND LOWER(a.user_email) != v_email_lower
      AND (
        -- Mutual target direct bypass
        (a.mutual_targets IS NOT NULL AND v_email_lower = ANY(
          ARRAY(SELECT lower(t) FROM unnest(a.mutual_targets) t)
        ))
        OR (
          -- [GUARDRAIL 1] COUNTRY: STRICT
          (a.country IS NULL OR a.country = '' OR lower(a.country) = 'all' OR lower(a.country) = lower(COALESCE(v_user_country, '')))

          -- [GUARDRAIL 2] GENDER: STRICT
          AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user_gender, '')))

          -- [GUARDRAIL 3] AGE RANGE: STRICT
          AND (
            a.age_range IS NULL OR cardinality(a.age_range) < 2
            OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
          )

          -- [DIMENSION 4] STATE / PROVINCE with safe rollover
          AND (
            a.state IS NULL OR a.state = '' OR lower(a.state) = 'all'
            OR lower(a.state) = lower(COALESCE(v_user_state, ''))
            OR (a.province IS NOT NULL AND v_user_state IS NOT NULL AND a.province ILIKE '%' || v_user_state || '%')
            OR (a.province IS NOT NULL AND v_user_location IS NOT NULL AND a.province ILIKE '%' || v_user_location || '%')
            OR (
              a.campaign_days IS NOT NULL 
              AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
              AND (a.country IS NOT NULL AND lower(a.country) = lower(COALESCE(v_user_country, '')))
            )
          )

          -- [DIMENSION 5] EMPLOYMENT STATUS
          AND (
            a.employment_status IS NULL OR a.employment_status = '' OR lower(a.employment_status) = 'all'
            OR lower(COALESCE(v_user_employment, '')) = ANY(
              string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
            )
            OR (
              a.campaign_days IS NOT NULL 
              AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
            )
          )

          -- [DIMENSION 6] INTEREST / BEHAVIOR / PSYCHOGRAPHICS
          AND (
            a.targeting_all = true
            OR (a.interest IS NOT NULL AND v_user_interest IS NOT NULL AND a.interest && v_user_interest)
            OR (a.lifestyle IS NOT NULL AND v_user_lifestyle IS NOT NULL AND a.lifestyle && v_user_lifestyle)
            OR (a.personality IS NOT NULL AND v_user_personality IS NOT NULL AND a.personality && v_user_personality)
            OR (a.behavior IS NOT NULL AND v_user_behavior IS NOT NULL AND a.behavior && v_user_behavior)
            OR (a.industry IS NOT NULL AND v_user_industry IS NOT NULL AND a.industry && v_user_industry)
            OR (
              a.campaign_days IS NOT NULL 
              AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
            )
          )
        )
      )

      -- Daily frequency & budget pacing enforcement
      AND (
        a.daily_impression_cap IS NULL
        OR a.last_reset_date IS NULL
        OR a.last_reset_date < CURRENT_DATE
        OR COALESCE(a.daily_impression_count, 0) < COALESCE(
             a.daily_impression_cap + COALESCE(a.rollover_balance, 0),
             a.daily_impression_cap, 99999999
           )
      )

      -- Frequency capping per viewer
      AND NOT EXISTS (
        SELECT 1 FROM public.ad_impressions imp
        WHERE imp.ad_id = a.id
          AND lower(imp.user_email) = v_email_lower
          AND imp.view_count >= COALESCE(a.user_frequency_cap, 1)
      )
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
  ORDER BY (
    ca.auction_base_score 
    + ca.relevance_affinity 
    + (CASE WHEN ca.ad_is_rollover THEN 25.0 ELSE 0.0 END)
    + random() * 10.0
  ) DESC
  LIMIT p_limit OFFSET p_offset;
END;
 LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO anon, authenticated, service_role;
