-- 1. Alter adds and addsactive tables to support Watch Now video links and click tracking
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS action_watch_now TEXT DEFAULT NULL;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS clicks_watch_now INT DEFAULT 0;

ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS action_watch_now TEXT DEFAULT NULL;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS clicks_watch_now INT DEFAULT 0;

-- 2. Drop existing submit_ad_campaign RPC function to allow parameter signature updates
DROP FUNCTION IF EXISTS public.submit_ad_campaign(
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
  p_product_price NUMERIC,
  p_product_name TEXT,
  p_product_cta_type TEXT,
  p_product_cta_link TEXT,
  p_action_ios TEXT,
  p_action_android TEXT
);

-- 3. Recreate submit_ad_campaign RPC supporting Watch Now video link
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

  -- Insert into 'addsactive' table
  INSERT INTO public.addsactive (
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

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recreate increment_ad_click RPC supporting watch_now clicks
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
  ELSIF p_click_type = 'ios' THEN
    UPDATE public.adds SET clicks_ios = COALESCE(clicks_ios, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_ios = COALESCE(clicks_ios, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'android' THEN
    UPDATE public.adds SET clicks_android = COALESCE(clicks_android, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_android = COALESCE(clicks_android, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'watch_now' THEN
    UPDATE public.adds SET clicks_watch_now = COALESCE(clicks_watch_now, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_watch_now = COALESCE(clicks_watch_now, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'read_more' THEN
    UPDATE public.adds SET clicks_read_more = COALESCE(clicks_read_more, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_read_more = COALESCE(clicks_read_more, 0) + 1 WHERE id = p_ad_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INT[], BOOLEAN, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
