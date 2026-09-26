-- ============================================================
-- MIGRATION: DYNAMIC SPACED FREQUENCY PACING PER USER
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Add last_viewed_at and today_view_count to ad_impressions table
ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS today_view_count INT DEFAULT 1;

-- 2. Create High-Performance Composite B-Tree Indexes for Microsecond RAM Lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_impressions_user_ad_pacing 
ON public.ad_impressions (lower(user_email), ad_id, last_viewed_at, today_view_count);

CREATE INDEX IF NOT EXISTS idx_addsactive_status_pacing 
ON public.addsactive (completed_at, user_frequency_cap, daily_impression_cap, daily_impression_count)
WHERE completed_at IS NULL;

-- 2. Update record_ad_seen / record_ad_impression RPC to update daily and total user view counts
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  INSERT INTO public.ad_impressions (ad_id, user_email, view_count, today_view_count, last_viewed_at)
  VALUES (p_ad_id, v_email_lower, 1, 1, timezone('utc'::text, now()))
  ON CONFLICT (user_email, ad_id)
  DO UPDATE SET 
    view_count = public.ad_impressions.view_count + 1,
    today_view_count = CASE 
      WHEN public.ad_impressions.last_viewed_at::date = CURRENT_DATE 
      THEN public.ad_impressions.today_view_count + 1 
      ELSE 1 
    END,
    last_viewed_at = timezone('utc'::text, now());

  -- Update ad daily impression count in addsactive
  UPDATE public.addsactive
  SET daily_impression_count = COALESCE(daily_impression_count, 0) + 1,
      impression_count = COALESCE(impression_count, 0) + 1
  WHERE id = p_ad_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Alias RPC for record_ad_seen
CREATE OR REPLACE FUNCTION public.record_ad_seen(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.record_ad_impression(p_ad_id, p_user_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update get_user_feed RPC to enforce Dynamic Spaced Frequency Pacing per user
CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS SETOF public.addsactive AS $$
DECLARE
  v_user RECORD;
  v_age INT;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fetch user profile traits
  SELECT * INTO v_user FROM public.users WHERE lower(email) = v_email_lower LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Compute age from DOB
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

    -- Exclude ads that have reached total impression target
    AND (
      a.impressions IS NULL
      OR COALESCE(a.impression_count, 0) < a.impressions
    )

    -- Dynamic Spaced Frequency Pacing Filter per User:
    -- 1. Exclude if user reached total user_frequency_cap across campaign
    -- 2. Exclude if user reached today's dynamic daily cap = CEIL(user_frequency_cap / campaign_days)
    AND NOT EXISTS (
      SELECT 1 FROM public.ad_impressions imp
      WHERE imp.ad_id = a.id
        AND lower(imp.user_email) = v_email_lower
        AND (
          imp.view_count >= COALESCE(a.user_frequency_cap, 1)
          OR (
            COALESCE(a.user_frequency_cap, 1) > 1
            AND imp.last_viewed_at::date = CURRENT_DATE
            AND imp.today_view_count >= GREATEST(1, CEIL(COALESCE(a.user_frequency_cap, 1)::NUMERIC / GREATEST(COALESCE(a.campaign_days, 1), 1)))
          )
        )
    )

    -- Bypass demographics for mutual targets OR enforce demographics
    AND (
      v_email_lower = ANY(
        ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
      )
      OR (
        (a.country IS NULL OR a.country = '' OR lower(a.country) = lower(COALESCE(v_user.country, '')))
        AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user.gender, '')))
        AND (
          a.employment_status IS NULL
          OR a.employment_status = ''
          OR lower(COALESCE(v_user.employment, '')) = ANY(
            string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
          )
        )
        AND (
          a.age_range IS NULL
          OR cardinality(a.age_range) < 2
          OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
        )
        AND (
          a.targeting_all = TRUE
          OR a.interest && v_user.interest
          OR a.lifestyle && v_user.lifestyle
          OR a.personality && v_user.personality
          OR a.behavior && v_user.behavior
          OR a.industry && v_user.industry
        )
      )
    )

    -- Daily platform impression cap check
    AND (
      a.daily_impression_cap IS NULL
      OR COALESCE(a.daily_impression_count, 0) < COALESCE(a.daily_impression_cap + COALESCE(a.rollover_balance, 0), a.daily_impression_cap, 99999999)
    )
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant permissions to execute functions
GRANT EXECUTE ON FUNCTION public.record_ad_impression(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ad_seen(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO anon, authenticated, service_role;
