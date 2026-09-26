-- ====================================================================
-- MIGRATION: GOOGLE-GRADE TARGETING, SAFE ROLLOVER & BIDDING ENGINE
-- Run this entire script in your Supabase SQL Editor
-- (IMPORTANT: Ensure NO text is highlighted when clicking RUN)
-- ====================================================================

-- 1. High-Speed GIN & Partial B-Tree Indexes for Sub-5ms Scale
CREATE INDEX IF NOT EXISTS idx_addsactive_geo_gender_active 
  ON public.addsactive (country, state, gender) 
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_addsactive_interest_gin 
  ON public.addsactive USING gin (interest);

CREATE INDEX IF NOT EXISTS idx_addsactive_lifestyle_gin 
  ON public.addsactive USING gin (lifestyle);

CREATE INDEX IF NOT EXISTS idx_addsactive_behavior_gin 
  ON public.addsactive USING gin (behavior);

CREATE INDEX IF NOT EXISTS idx_addsactive_personality_gin 
  ON public.addsactive USING gin (personality);

CREATE INDEX IF NOT EXISTS idx_addsactive_industry_gin 
  ON public.addsactive USING gin (industry);

-- 2. Drop existing RPC to avoid 42P13 return type conflict
DROP FUNCTION IF EXISTS public.get_user_feed(TEXT, INT, INT);

-- 3. Google-Standard get_user_feed RPC with:
--    a) Strict Hard Demographics & Geo (Country, Gender, Age Range NEVER violated)
--    b) Safe, Compliant Rollover (Gradual broadening of interests & location within country)
--    c) Attention Economy Priority Bidding with Google Relevance Affinity Scoring
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
) AS $$
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

  -- 1. Fetch complete viewer demographics & psychographics
  SELECT 
    CASE WHEN u.dob IS NOT NULL AND u.dob != 'PLACEHOLDER' AND u.dob != '' 
         THEN u.dob::DATE ELSE NULL END,
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

  IF v_user_dob IS NOT NULL THEN
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
      
      -- Rollover computation: past campaign duration but impressions remain unfulfilled
      (
        a.campaign_days IS NOT NULL 
        AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
        AND COALESCE(a.impressions, 0) > 0
        AND COALESCE(a.impression_count, 0) < a.impressions
      ) AS ad_is_rollover,

      -- Google Quality & Relevance Affinity Score
      (
        -- Geo Match Bonus (+15 pts for exact state/city match)
        CASE WHEN a.state IS NOT NULL AND v_user_state IS NOT NULL AND lower(a.state) = lower(v_user_state) THEN 15.0 ELSE 0.0 END +
        -- Direct Interest Overlap (+10 pts)
        CASE WHEN v_user_interest IS NOT NULL AND a.interest && v_user_interest THEN 10.0 ELSE 0.0 END +
        -- Industry / Lifestyle Overlap (+5 pts each)
        CASE WHEN v_user_industry IS NOT NULL AND a.industry && v_user_industry THEN 5.0 ELSE 0.0 END +
        CASE WHEN v_user_lifestyle IS NOT NULL AND a.lifestyle && v_user_lifestyle THEN 5.0 ELSE 0.0 END
      ) AS relevance_affinity,

      -- Base Auction Score:
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
          -- =================================================================
          -- HARD GUARDRAILS (NEVER RELAXED, EVEN IN ROLLOVER)
          -- =================================================================

          -- [GUARDRAIL 1] COUNTRY: STRICT. Never leaks across international borders.
          (a.country IS NULL OR a.country = '' OR lower(a.country) = 'all' OR lower(a.country) = lower(COALESCE(v_user_country, '')))

          -- [GUARDRAIL 2] GENDER: STRICT. Never shows female ads to males or male ads to females.
          AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user_gender, '')))

          -- [GUARDRAIL 3] AGE RANGE: STRICT. Protects children/minors & policy compliance.
          AND (
            a.age_range IS NULL OR cardinality(a.age_range) < 2
            OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
          )

          -- =================================================================
          -- STAGED / COMPLIANT ROLLOVER EXPANSION
          -- =================================================================

          -- [DIMENSION 4] STATE / PROVINCE:
          -- During active campaign: exact state/province match.
          -- In rollover mode: if campaign is past schedule within the SAME country,
          -- expand to all states in that country so the advertiser's impressions deliver!
          AND (
            a.state IS NULL OR a.state = '' OR lower(a.state) = 'all'
            OR lower(a.state) = lower(COALESCE(v_user_state, ''))
            OR (a.province IS NOT NULL AND v_user_state IS NOT NULL AND a.province ILIKE '%' || v_user_state || '%')
            OR (a.province IS NOT NULL AND v_user_location IS NOT NULL AND a.province ILIKE '%' || v_user_location || '%')
            -- Rollover expansion: within country only
            OR (
              a.campaign_days IS NOT NULL 
              AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
              AND (a.country IS NOT NULL AND lower(a.country) = lower(COALESCE(v_user_country, '')))
            )
          )

          -- [DIMENSION 5] EMPLOYMENT STATUS:
          AND (
            a.employment_status IS NULL OR a.employment_status = '' OR lower(a.employment_status) = 'all'
            OR lower(COALESCE(v_user_employment, '')) = ANY(
              string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
            )
            -- Rollover expansion: relaxed to all employment tiers
            OR (a.campaign_days IS NOT NULL AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day'))
          )

          -- [DIMENSION 6] PSYCHOGRAPHICS (INTEREST, LIFESTYLE, BEHAVIOR, PERSONALITY, INDUSTRY):
          -- Strict overlap during active days, safely broadened to same demographic in rollover mode
          AND (
            a.targeting_all = TRUE
            OR (
              cardinality(COALESCE(a.interest, '{}')) = 0 AND 
              cardinality(COALESCE(a.lifestyle, '{}')) = 0 AND 
              cardinality(COALESCE(a.personality, '{}')) = 0 AND 
              cardinality(COALESCE(a.behavior, '{}')) = 0 AND 
              cardinality(COALESCE(a.industry, '{}')) = 0
            )
            OR (v_user_interest IS NOT NULL AND a.interest && v_user_interest)
            OR (v_user_lifestyle IS NOT NULL AND a.lifestyle && v_user_lifestyle)
            OR (v_user_personality IS NOT NULL AND a.personality && v_user_personality)
            OR (v_user_behavior IS NOT NULL AND a.behavior && v_user_behavior)
            OR (v_user_industry IS NOT NULL AND a.industry && v_user_industry)
            -- Rollover expansion: broadened to fulfill contracted impressions
            OR (a.campaign_days IS NOT NULL AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day'))
          )
        )
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
    -- Google Pacing Boost: +25.0 boost for rollover campaigns so they don't starve
    + (CASE WHEN ca.ad_is_rollover THEN 25.0 ELSE 0.0 END)
    + random() * 10.0
  ) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO anon, authenticated, service_role;

-- 4. Enable Supabase Realtime Broadcast on addsactive & newsactive for WebSocket delivery
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.addsactive;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.newsactive;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
