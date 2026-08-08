-- ============================================================================
-- MIGRATION: GOOGLE-STANDARD PERFORMANCE & INDEXING OPTIMIZATIONS FOR XEA
-- Run this script in your Supabase Dashboard -> SQL Editor (New Query -> Run)
-- ============================================================================

-- 1. Create functional B-tree indexes for fast lower(email) lookups
CREATE INDEX IF NOT EXISTS idx_users_lower_email 
  ON public.users ((lower(email)));

CREATE INDEX IF NOT EXISTS idx_ad_impressions_lower_user_ad 
  ON public.ad_impressions ((lower(user_email)), ad_id);

CREATE INDEX IF NOT EXISTS idx_addsactive_lower_user_email 
  ON public.addsactive ((lower(user_email)));

-- 2. Create GIN index for high-speed array overlap operations on mutual targets
CREATE INDEX IF NOT EXISTS idx_addsactive_mutual_targets_gin 
  ON public.addsactive USING GIN (mutual_targets);

-- 3. Replace get_user_feed with high-performance query execution plan
DROP FUNCTION IF EXISTS public.get_user_feed(text);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer, integer);

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

  -- Fast indexed user lookup
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
      ARRAY[v_email_lower] && COALESCE(a.mutual_targets, '{}'::text[])
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
    -- Mutual targets first (optimized array overlap check without unnest subquery)
    (CASE WHEN ARRAY[v_email_lower] && COALESCE(a.mutual_targets, '{}'::text[]) THEN 0 ELSE 1 END) ASC,
    -- Then oldest campaign first
    a.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon, authenticated;
