-- MIGRATION: INDEXING & SCALABILITY OPTIMIZATIONS FOR XEA FEED SYSTEM
-- Run this SQL in your Supabase Dashboard -> SQL Editor to enable high-concurrency scaling.

-- 1. Create functional index on users table for email lookup optimization
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));

-- 2. Create functional index on ad_impressions table for lowercase email searches
CREATE INDEX IF NOT EXISTS idx_ad_impressions_lower_email ON public.ad_impressions (lower(user_email));

-- 3. Create functional indexes on campaign and news tables for publisher email lookups
CREATE INDEX IF NOT EXISTS idx_addsactive_lower_user_email ON public.addsactive (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_adds_lower_user_email ON public.adds (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_newsactive_lower_user_email ON public.newsactive (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_news_lower_user_email ON public.news (lower(user_email));

-- 4. Create indexes on daily highlights tables for interest matching and date sorting
CREATE INDEX IF NOT EXISTS idx_newsactive_interest_created_at ON public.newsactive (interest, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsactive_created_at ON public.newsactive (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_interest_created_at ON public.news (interest, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_created_at ON public.news (created_at DESC);

-- 5. Create GIN (Generalized Inverted Indexes) on targeting array columns to avoid full table scans
CREATE INDEX IF NOT EXISTS idx_addsactive_interest ON public.addsactive USING gin (interest);
CREATE INDEX IF NOT EXISTS idx_addsactive_lifestyle ON public.addsactive USING gin (lifestyle);
CREATE INDEX IF NOT EXISTS idx_addsactive_personality ON public.addsactive USING gin (personality);
CREATE INDEX IF NOT EXISTS idx_addsactive_behavior ON public.addsactive USING gin (behavior);
CREATE INDEX IF NOT EXISTS idx_addsactive_industry ON public.addsactive USING gin (industry);

-- 5. Optimize the get_user_feed RPC function
-- Replaces redundant runtime lower() transformations on indexed fields with direct index lookups.
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

  -- Optimization: utilizes unique constraint index on email directly or idx_users_lower_email
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

    -- Optimization: Direct index seek matching v_email_lower against idx_ad_impressions_lower_email
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
        -- Basic profile checks
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
        -- Optimization: utilizes the GIN indexes idx_addsactive_interest, idx_addsactive_lifestyle, etc.
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

GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon, authenticated;
