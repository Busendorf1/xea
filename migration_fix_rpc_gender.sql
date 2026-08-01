-- migration_fix_rpc_gender.sql
-- Fixes PostgreSQL PL/pgSQL variable collision error: column reference "gender" is ambiguous

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit      INT DEFAULT 100,
  p_offset     INT DEFAULT 0
)
RETURNS SETOF public.addsactive AS $$
DECLARE
  v_user_dob          DATE;
  v_user_country      TEXT;
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

  -- Fetch user profile traits into explicit scalar variables to avoid PL/pgSQL column name collisions
  SELECT 
    u.dob, u.country, u.gender, u.employment,
    u.interest, u.lifestyle, u.personality, u.behavior, u.industry
  INTO 
    v_user_dob, v_user_country, v_user_gender, v_user_employment,
    v_user_interest, v_user_lifestyle, v_user_personality, v_user_behavior, v_user_industry
  FROM public.users u 
  WHERE lower(u.email) = v_email_lower 
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_user_dob IS NOT NULL THEN
    v_age := date_part('year', age(v_user_dob));
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

    -- Exclude ads where user hit frequency cap
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
        -- Demographics: country
        (a.country IS NULL OR a.country = '' OR lower(a.country) = lower(COALESCE(v_user_country, '')))
        
        -- Demographics: gender (explicitly qualified to avoid ambiguity)
        AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user_gender, '')))
        
        -- Demographics: employment
        AND (
          a.employment_status IS NULL OR a.employment_status = ''
          OR lower(COALESCE(v_user_employment, '')) = ANY(
            string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
          )
        )
        
        -- Demographics: age range
        AND (
          a.age_range IS NULL OR cardinality(a.age_range) < 2
          OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
        )

        -- Targeting: interests, lifestyle, personality, behavior, industry
        AND (
          a.targeting_all = TRUE
          OR (v_user_interest IS NOT NULL AND a.interest && v_user_interest)
          OR (v_user_lifestyle IS NOT NULL AND a.lifestyle && v_user_lifestyle)
          OR (v_user_personality IS NOT NULL AND a.personality && v_user_personality)
          OR (v_user_behavior IS NOT NULL AND a.behavior && v_user_behavior)
          OR (v_user_industry IS NOT NULL AND a.industry && v_user_industry)
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
    (CASE WHEN v_email_lower = ANY(
      ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
    ) THEN 0 ELSE 1 END) ASC,
    a.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon, authenticated;
