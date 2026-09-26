-- ============================================================
-- MIGRATION: PRODUCT SALES AD TYPE SUPPORT
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- 1. Add product sales columns to adds and addsactive tables
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS product_price NUMERIC(12,2) DEFAULT NULL;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS product_name VARCHAR(80) DEFAULT NULL;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS product_cta_type VARCHAR(20) DEFAULT NULL;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS product_cta_link TEXT DEFAULT NULL;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS clicks_product_cta INTEGER DEFAULT 0;

ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS product_price NUMERIC(12,2) DEFAULT NULL;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS product_name VARCHAR(80) DEFAULT NULL;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS product_cta_type VARCHAR(20) DEFAULT NULL;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS product_cta_link TEXT DEFAULT NULL;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS clicks_product_cta INTEGER DEFAULT 0;

-- 2. Drop existing functions to allow signature updates
DROP FUNCTION IF EXISTS public.submit_ad_campaign(
  UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN
);

DROP FUNCTION IF EXISTS public.get_user_feed(TEXT, INT, INT);

-- 3. Create updated submit_ad_campaign RPC supporting product sales
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
  p_display_mutual_button BOOLEAN,
  p_product_price NUMERIC DEFAULT NULL,
  p_product_name TEXT DEFAULT NULL,
  p_product_cta_type TEXT DEFAULT NULL,
  p_product_cta_link TEXT DEFAULT NULL
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
    rollover_balance,
    product_price,
    product_name,
    product_cta_type,
    product_cta_link
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
    0,
    p_product_price,
    p_product_name,
    p_product_cta_type,
    p_product_cta_link
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

-- 4. Create updated get_user_feed RPC selecting product sales columns
CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit      INT DEFAULT 100,
  p_offset     INT DEFAULT 0
)
RETURNS SETOF public.addsactive AS $$
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
    a.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update increment_ad_click to track e-commerce product CTA clicks
CREATE OR REPLACE FUNCTION public.increment_ad_click(
  p_ad_id UUID,
  p_click_type TEXT
) RETURNS VOID AS $$
BEGIN
  IF p_click_type = 'phone' THEN
    UPDATE public.adds SET clicks_phone = COALESCE(clicks_phone, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_phone = COALESCE(clicks_phone, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'whatsapp' THEN
    UPDATE public.adds SET clicks_whatsapp = COALESCE(clicks_whatsapp, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_whatsapp = COALESCE(clicks_whatsapp, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'website' THEN
    UPDATE public.adds SET clicks_website = COALESCE(clicks_website, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_website = COALESCE(clicks_website, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'email' THEN
    UPDATE public.adds SET clicks_email = COALESCE(clicks_email, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_email = COALESCE(clicks_email, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type IN ('buy_now', 'shop', 'order', 'visit_website', 'product_cta') THEN
    UPDATE public.adds SET clicks_product_cta = COALESCE(clicks_product_cta, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_product_cta = COALESCE(clicks_product_cta, 0) + 1 WHERE id = p_ad_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.increment_ad_click(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(UUID, TEXT) TO service_role;
