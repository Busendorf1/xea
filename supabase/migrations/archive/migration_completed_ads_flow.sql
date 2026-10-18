-- MIGRATION: COMPLETED ADS HISTORICAL ARCHIVE AND 24-HOUR AUTO-PURGE
-- Run this SQL in your Supabase Dashboard -> SQL Editor.

-- 1. Create the historical archive table for completed ads
CREATE TABLE IF NOT EXISTS public.completed_ads (
    id                  UUID PRIMARY KEY,
    ad_type             TEXT NOT NULL,
    industry            TEXT[] DEFAULT '{}'::TEXT[],
    interest            TEXT[] DEFAULT '{}'::TEXT[],
    lifestyle           TEXT[] DEFAULT '{}'::TEXT[],
    behavior            TEXT[] DEFAULT '{}'::TEXT[],
    personality         TEXT[] DEFAULT '{}'::TEXT[],
    age_range           INTEGER[] DEFAULT ARRAY[18, 65],
    targeting_all       BOOLEAN DEFAULT FALSE,
    impressions         INTEGER,
    country             TEXT,
    state               TEXT,
    province            TEXT,
    gender              TEXT,
    employment_status   TEXT,
    ad_media_type       TEXT,
    ad_content          TEXT,
    ad_media_url        TEXT,
    ad_action_buttons   TEXT[] DEFAULT '{}'::TEXT[],
    action_phone        TEXT,
    action_whatsapp     TEXT,
    action_website      TEXT,
    action_email        TEXT,
    cost_per_impression NUMERIC(10,2),
    total_cost          NUMERIC(12,2),
    created_at          TIMESTAMP WITH TIME ZONE,
    completed_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    user_id             UUID,
    user_email          TEXT,
    impression_count    NUMERIC DEFAULT 0
);

-- Grant permissions on completed_ads table
GRANT ALL ON TABLE public.completed_ads TO anon;
GRANT ALL ON TABLE public.completed_ads TO authenticated;
GRANT ALL ON TABLE public.completed_ads TO service_role;

-- Enable Row Level Security (RLS)
ALTER TABLE public.completed_ads ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read only their own completed ads
CREATE POLICY "Users can read own completed ads" 
ON public.completed_ads 
FOR SELECT 
TO authenticated 
USING (lower(auth.jwt() ->> 'email') = lower(user_email));

-- Create policy to allow read access to service role / admin scripts
CREATE POLICY "Service role has full access to completed ads" 
ON public.completed_ads 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);


-- 2. Create helper function to move an ad to archive and delete it from active tables
CREATE OR REPLACE FUNCTION public.archive_completed_ad(p_ad_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Copy the campaign data to the archive table
  INSERT INTO public.completed_ads (
    id, ad_type, industry, interest, lifestyle, behavior, personality, age_range,
    targeting_all, impressions, country, state, province, gender, employment_status,
    ad_media_type, ad_content, ad_media_url, ad_action_buttons, action_phone,
    action_whatsapp, action_website, action_email, cost_per_impression, total_cost,
    created_at, completed_at, user_id, user_email, impression_count
  )
  SELECT
    id, ad_type, industry, interest, lifestyle, behavior, personality, age_range,
    targeting_all, impressions, country, state, province, gender, employment_status,
    ad_media_type, ad_content, ad_media_url, ad_action_buttons, action_phone,
    action_whatsapp, action_website, action_email, cost_per_impression, total_cost,
    created_at, timezone('utc'::text, now()), user_id, user_email, COALESCE(impression_count, 0)
  FROM public.adds
  WHERE id = p_ad_id
  ON CONFLICT (id) DO UPDATE SET
    completed_at = EXCLUDED.completed_at,
    impression_count = EXCLUDED.impression_count;

  -- Delete from active tables (triggers ON DELETE CASCADE on ad_impressions)
  DELETE FROM public.addsactive WHERE id = p_ad_id;
  DELETE FROM public.adds WHERE id = p_ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Recreate record_ad_impression to call the archive function on budget exhaustion
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_count    BIGINT;
  v_max_impressions  BIGINT;
  v_daily_count      INT;
  v_reset_date       DATE;
  v_daily_cap        INT;
  v_user_freq_cap    INT;
  v_user_views       INT;
  v_rollover_balance INT;
  v_campaign_days    INT;
  v_created_at       TIMESTAMP;
  v_is_rollover      BOOLEAN;
  v_email_lower      TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fetch current parameters for the ad
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
    PERFORM public.archive_completed_ad(p_ad_id);
    RETURN FALSE;
  END IF;

  -- Determine rollover mode
  v_is_rollover := (v_campaign_days IS NOT NULL AND (CURRENT_DATE - v_created_at::date) > v_campaign_days);

  -- Increment daily and total counts
  IF v_reset_date < CURRENT_DATE THEN
    -- Reset daily count for the new day
    IF v_is_rollover THEN
      -- If campaign is active after duration, carry forward unused daily impressions to rollover balance
      UPDATE public.adds
      SET 
        daily_impression_count = 1,
        impression_count = COALESCE(impression_count, 0) + 1,
        last_reset_date = CURRENT_DATE,
        rollover_balance = COALESCE(rollover_balance, 0) + GREATER_OF(0, v_daily_cap - v_daily_count)
      WHERE id = p_ad_id;
    ELSE
      UPDATE public.adds
      SET 
        daily_impression_count = 1,
        impression_count = COALESCE(impression_count, 0) + 1,
        last_reset_date = CURRENT_DATE
      WHERE id = p_ad_id;
    END IF;
  ELSE
    UPDATE public.adds
    SET 
      daily_impression_count = COALESCE(daily_impression_count, 0) + 1,
      impression_count = COALESCE(impression_count, 0) + 1
    WHERE id = p_ad_id;
  END IF;

  -- Sync active count
  UPDATE public.addsactive
  SET impression_count = (SELECT impression_count FROM public.adds WHERE id = p_ad_id)
  WHERE id = p_ad_id;

  -- Add impression record for the user
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count)
  VALUES (p_ad_id, v_email_lower, 1)
  ON CONFLICT (user_email, ad_id)
  DO UPDATE SET view_count = COALESCE(public.ad_impressions.view_count, 0) + 1;

  -- Double check if the new impression exhausted the budget
  IF (v_current_count + 1) >= v_max_impressions THEN
    PERFORM public.archive_completed_ad(p_ad_id);
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Recreate the cleanup function to delete from completed_ads after 24 hours
CREATE OR REPLACE FUNCTION public.delete_expired_completed_ads()
RETURNS void AS $$
BEGIN
  -- Delete completed ads from historical archive after 24 hours of completion
  DELETE FROM public.completed_ads WHERE completed_at < (now() - interval '24 hours');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_expired_completed_ads() TO anon, authenticated, service_role;
