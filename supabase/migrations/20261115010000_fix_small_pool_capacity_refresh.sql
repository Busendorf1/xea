-- Refresh `ad_capacity_stats` quickly for small active user pools (< 1,000 users)
-- so early-stage/dev environments with ~10 users do not serve stale 1-2 user
-- counts for up to 6 hours while preserving O(1) 6-hour caching at 500M scale.

CREATE OR REPLACE FUNCTION public.get_ad_capacity_counts(
    p_country TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_gender TEXT DEFAULT NULL,
    p_interest TEXT[] DEFAULT NULL,
    p_industry TEXT[] DEFAULT NULL,
    p_lifestyle TEXT[] DEFAULT NULL,
    p_behavior TEXT[] DEFAULT NULL,
    p_personality TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_country TEXT := NULLIF(lower(trim(COALESCE(p_country, ''))), '');
    v_state TEXT := NULLIF(lower(trim(COALESCE(p_state, ''))), '');
    v_gender TEXT := NULLIF(lower(trim(COALESCE(p_gender, ''))), '');
    v_global BIGINT := 0;
    v_country_users BIGINT := 0;
    v_strict_users BIGINT := 0;
    v_sampled BOOLEAN := FALSE;
    v_updated_at TIMESTAMPTZ := NULL;
    v_stats_found BOOLEAN := FALSE;
    v_gender_users BIGINT := NULL;
    v_state_users BIGINT := NULL;
    v_tok_sum BIGINT := 0;
    v_has_fine_array BOOLEAN := FALSE;
BEGIN
    SELECT estimated_users, is_sampled, updated_at
    INTO v_global, v_sampled, v_updated_at
    FROM public.ad_capacity_stats
    WHERE scope_type = 'global' AND scope_key = 'all';
    v_stats_found := FOUND;

    IF NOT v_stats_found
       OR v_updated_at IS NULL
       OR v_updated_at < timezone('utc'::text, now()) - INTERVAL '6 hours'
       OR (COALESCE(v_global, 0) < 1000 AND v_updated_at < timezone('utc'::text, now()) - INTERVAL '15 seconds')
    THEN
        PERFORM public.refresh_ad_capacity_stats();
        SELECT estimated_users, is_sampled, updated_at
        INTO v_global, v_sampled, v_updated_at
        FROM public.ad_capacity_stats
        WHERE scope_type = 'global' AND scope_key = 'all';
    END IF;

    v_global := GREATEST(0, COALESCE(v_global, 0));

    -- Country pool
    IF v_country IS NULL THEN
        v_country_users := v_global;
    ELSE
        SELECT estimated_users
        INTO v_country_users
        FROM public.ad_capacity_stats
        WHERE scope_type = 'country' AND scope_key = v_country;

        IF NOT FOUND THEN
            v_country_users := 0;
        END IF;
    END IF;

    v_strict_users := v_country_users;

    -- Gender slice
    IF v_gender IS NOT NULL THEN
        IF v_country IS NOT NULL THEN
            SELECT estimated_users
            INTO v_gender_users
            FROM public.ad_capacity_stats
            WHERE scope_type = 'country_gender' AND scope_key = (v_country || '|' || v_gender);
        ELSE
            SELECT estimated_users
            INTO v_gender_users
            FROM public.ad_capacity_stats
            WHERE scope_type = 'gender' AND scope_key = v_gender;
        END IF;

        IF FOUND THEN
            v_strict_users := LEAST(v_strict_users, GREATEST(0, v_gender_users));
        ELSE
            v_strict_users := 0;
        END IF;
    END IF;

    -- State slice
    IF v_state IS NOT NULL THEN
        IF v_country IS NOT NULL THEN
            SELECT estimated_users
            INTO v_state_users
            FROM public.ad_capacity_stats
            WHERE scope_type = 'country_state' AND scope_key = (v_country || '|' || v_state);
        END IF;

        IF FOUND AND v_state_users IS NOT NULL THEN
            IF v_gender IS NOT NULL AND v_country_users > 0 THEN
                v_strict_users := ROUND(v_strict_users::NUMERIC * (v_state_users::NUMERIC / v_country_users::NUMERIC))::BIGINT;
            ELSE
                v_strict_users := LEAST(v_strict_users, GREATEST(0, v_state_users));
            END IF;
        ELSE
            IF NOT v_sampled AND v_country IS NOT NULL THEN
                v_strict_users := 0;
            ELSE
                v_strict_users := FLOOR(v_strict_users * 0.18)::BIGINT;
            END IF;
        END IF;
    END IF;

    -- Interest slice (independent set-based rollup lookup)
    IF p_interest IS NOT NULL AND cardinality(p_interest) > 0 THEN
        SELECT COALESCE(SUM(s.estimated_users), 0)::BIGINT
        INTO v_tok_sum
        FROM public.ad_capacity_stats s
        WHERE s.scope_type = CASE WHEN v_country IS NOT NULL THEN 'country_interest' ELSE 'interest' END
          AND s.scope_key IN (
              SELECT DISTINCT CASE WHEN v_country IS NOT NULL THEN v_country || '|' || lower(trim(t)) ELSE lower(trim(t)) END
              FROM unnest(p_interest) AS t
              WHERE trim(t) <> '' AND length(trim(t)) <= 80
              LIMIT 10
          );

        IF v_country_users > 0 THEN
            v_strict_users := LEAST(
                v_strict_users,
                ROUND(v_strict_users::NUMERIC * LEAST(1.0, v_tok_sum::NUMERIC / GREATEST(1, v_country_users)::NUMERIC))::BIGINT
            );
        ELSE
            v_strict_users := 0;
        END IF;
    END IF;

    -- Industry slice (independent set-based rollup lookup)
    IF p_industry IS NOT NULL AND cardinality(p_industry) > 0 THEN
        SELECT COALESCE(SUM(s.estimated_users), 0)::BIGINT
        INTO v_tok_sum
        FROM public.ad_capacity_stats s
        WHERE s.scope_type = CASE WHEN v_country IS NOT NULL THEN 'country_industry' ELSE 'industry' END
          AND s.scope_key IN (
              SELECT DISTINCT CASE WHEN v_country IS NOT NULL THEN v_country || '|' || lower(trim(t)) ELSE lower(trim(t)) END
              FROM unnest(p_industry) AS t
              WHERE trim(t) <> '' AND length(trim(t)) <= 80
              LIMIT 10
          );

        IF v_country_users > 0 THEN
            v_strict_users := LEAST(
                v_strict_users,
                ROUND(v_strict_users::NUMERIC * LEAST(1.0, v_tok_sum::NUMERIC / GREATEST(1, v_country_users)::NUMERIC))::BIGINT
            );
        ELSE
            v_strict_users := 0;
        END IF;
    END IF;

    v_has_fine_array := (
        (p_lifestyle IS NOT NULL AND cardinality(p_lifestyle) > 0)
        OR (p_behavior IS NOT NULL AND cardinality(p_behavior) > 0)
        OR (p_personality IS NOT NULL AND cardinality(p_personality) > 0)
    );
    IF v_has_fine_array THEN
        v_strict_users := FLOOR(v_strict_users * 0.35)::BIGINT;
    END IF;

    RETURN jsonb_build_object(
        'available', true,
        'global_users', v_global,
        'country_users', v_country_users,
        'strict_users', GREATEST(0, v_strict_users),
        'sampled', v_sampled,
        'updated_at', v_updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ad_capacity_counts(TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ad_capacity_counts(TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[]) TO service_role;
