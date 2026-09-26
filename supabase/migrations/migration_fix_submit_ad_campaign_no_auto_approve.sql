-- MIGRATION: FIX SUBMIT_AD_CAMPAIGN TO PREVENT AUTO-APPROVAL DUPLICATION
-- When publishing an ad, it must ONLY enter public.adds (the pending review queue).
-- Ads are only moved into public.addsactive when an administrator explicitly approves them in /admin.

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
  p_product_cta_link TEXT DEFAULT NULL,
  p_action_ios TEXT DEFAULT NULL,
  p_action_android TEXT DEFAULT NULL,
  p_action_watch_now TEXT DEFAULT NULL
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

  -- Insert ONLY into 'adds' table (Pending Review Queue)
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
    product_price,
    product_name,
    product_cta_type,
    product_cta_link,
    action_ios,
    action_android,
    action_watch_now
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
    p_user_email,
    p_ad_media,
    p_display_mutual_button,
    v_final_mutual_targets,
    p_product_price,
    p_product_name,
    p_product_cta_type,
    p_product_cta_link,
    p_action_ios,
    p_action_android,
    p_action_watch_now
  );

  -- Note: Do NOT insert into addsactive.
  -- The ad must wait for admin approval via /admin. Upon approval, it will be moved into addsactive.

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(
  UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC,
  NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;

GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(
  UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC,
  NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(
  UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC,
  NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- Clean up any unapproved ads currently mirrored in addsactive that are still in adds review queue
DELETE FROM public.addsactive 
WHERE id IN (SELECT id FROM public.adds);
