-- ==============================================================================
-- Migration: ATW Level Upgrade Notifications & Previous-Tier Telemetry
-- Ensures rating-triggered ATW level increases and bulk ATW flushes atomically
-- insert congratulatory notifications (with new balance cap + withdrawal reminder)
-- inside PostgreSQL and return upgraded user summaries for Redis/webhook sync.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.apply_ad_rating_to_listeners(
    p_ad_id UUID,
    p_advertiser_email TEXT,
    p_star_rating INT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_increment NUMERIC(12,4);
    v_adv_email TEXT := lower(trim(COALESCE(p_advertiser_email, '')));
BEGIN
    IF p_star_rating < 1 OR p_star_rating > 5 THEN
        RAISE EXCEPTION 'Invalid star rating: %. Must be between 1 and 5.', p_star_rating;
    END IF;

    v_increment := CASE p_star_rating
        WHEN 1 THEN 0.0100
        WHEN 2 THEN 0.0200
        WHEN 3 THEN 0.0300
        WHEN 4 THEN 0.0400
        WHEN 5 THEN 0.0500
    END;

    IF to_regclass('public.completed_ads_ratings') IS NOT NULL THEN
        INSERT INTO public.completed_ads_ratings (ad_id, advertiser_email, star_rating, score_increment)
        VALUES (p_ad_id, v_adv_email, p_star_rating, v_increment)
        ON CONFLICT (ad_id, advertiser_email) DO NOTHING;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ad % has already been rated.', p_ad_id;
        END IF;
    END IF;

    WITH pre_state AS (
        SELECT
            u.id,
            lower(trim(u.email)) AS norm_email,
            public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                COALESCE(u.attention_worth_score, 0.1000),
                COALESCE(u.atw_tier, 'ATW1')
            ) AS old_level,
            (
                COALESCE(u.is_affiliate, FALSE) OR COALESCE(u.is_career, FALSE)
                OR lower(trim(u.email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
            ) AS is_exempt
        FROM public.users u
        JOIN public.ad_impressions ai ON lower(u.email) = lower(ai.user_email)
        WHERE ai.ad_id = p_ad_id
    ),
    updated AS (
        UPDATE public.users u
        SET
            attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
            atw_tier = CASE
                WHEN ps.is_exempt THEN 'Unlimited'
                ELSE 'ATW' || public.compute_atw_level(
                    COALESCE(u.monetization_clicks, 0),
                    LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
                    COALESCE(u.atw_tier, 'ATW1')
                )::TEXT
            END
        FROM pre_state ps
        WHERE u.id = ps.id
        RETURNING
            ps.norm_email,
            ps.is_exempt,
            ps.old_level,
            public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                u.attention_worth_score,
                COALESCE(u.atw_tier, 'ATW1')
            ) AS new_level,
            u.atw_tier
    )
    INSERT INTO public.notifications (user_email, title, message)
    SELECT
        up.norm_email,
        'ATW Level Upgraded to ' || up.atw_tier,
        'Congratulations! Your ATW level has increased to ' || up.atw_tier ||
        ', raising your new balance cap to ₦' || trim(to_char(up.new_level * 30000, '999,999,990')) ||
        '. Please withdraw your earnings promptly so you don''t hit your limit.'
    FROM updated up
    WHERE NOT up.is_exempt
      AND up.new_level >= 2
      AND up.new_level > up.old_level
      AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE lower(n.user_email) = up.norm_email
            AND n.title = 'ATW Level Upgraded to ' || up.atw_tier
            AND n.created_at >= now() - INTERVAL '180 days'
      );

    RETURN v_increment;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_ad_rating_chunk(
    p_ad_id UUID,
    p_star_rating INT,
    p_batch_size INT DEFAULT 5000,
    p_last_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_increment NUMERIC(12,4);
    v_updated_count INT := 0;
    v_max_email TEXT;
    v_has_more BOOLEAN := FALSE;
    v_upgraded JSONB := '[]'::jsonb;
BEGIN
    v_increment := CASE p_star_rating
        WHEN 1 THEN 0.0100
        WHEN 2 THEN 0.0200
        WHEN 3 THEN 0.0300
        WHEN 4 THEN 0.0400
        WHEN 5 THEN 0.0500
        ELSE 0.0000
    END;

    IF v_increment = 0.0000 THEN
        RETURN jsonb_build_object(
            'updated_count', 0,
            'last_email', NULL,
            'has_more', false,
            'increment', 0,
            'upgraded_users', '[]'::jsonb
        );
    END IF;

    WITH batch AS (
        SELECT lower(trim(ai.user_email)) AS norm_email
        FROM public.ad_impressions ai
        WHERE ai.ad_id = p_ad_id
          AND (p_last_email IS NULL OR lower(trim(ai.user_email)) > lower(trim(p_last_email)))
        ORDER BY lower(trim(ai.user_email)) ASC
        LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 5000), 10000))
    ),
    pre_state AS (
        SELECT
            u.id,
            b.norm_email,
            public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                COALESCE(u.attention_worth_score, 0.1000),
                COALESCE(u.atw_tier, 'ATW1')
            ) AS old_level,
            (
                COALESCE(u.is_affiliate, FALSE) OR COALESCE(u.is_career, FALSE)
                OR b.norm_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
            ) AS is_exempt
        FROM batch b
        JOIN public.users u ON lower(trim(u.email)) = b.norm_email
    ),
    updated_users AS (
        UPDATE public.users u
        SET
            attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
            atw_tier = CASE
                WHEN ps.is_exempt THEN 'Unlimited'
                ELSE 'ATW' || public.compute_atw_level(
                    COALESCE(u.monetization_clicks, 0),
                    LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
                    COALESCE(u.atw_tier, 'ATW1')
                )::TEXT
            END
        FROM pre_state ps
        WHERE u.id = ps.id
        RETURNING
            ps.norm_email,
            ps.is_exempt,
            ps.old_level,
            public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                u.attention_worth_score,
                COALESCE(u.atw_tier, 'ATW1')
            ) AS new_level,
            u.atw_tier
    ),
    leveled_up AS (
        SELECT norm_email, atw_tier, new_level
        FROM updated_users
        WHERE NOT is_exempt
          AND new_level >= 2
          AND new_level > old_level
    ),
    inserted_notifs AS (
        INSERT INTO public.notifications (user_email, title, message)
        SELECT
            lu.norm_email,
            'ATW Level Upgraded to ' || lu.atw_tier,
            'Congratulations! Your ATW level has increased to ' || lu.atw_tier ||
            ', raising your new balance cap to ₦' || trim(to_char(lu.new_level * 30000, '999,999,990')) ||
            '. Please withdraw your earnings promptly so you don''t hit your limit.'
        FROM leveled_up lu
        WHERE NOT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE lower(n.user_email) = lu.norm_email
              AND n.title = 'ATW Level Upgraded to ' || lu.atw_tier
              AND n.created_at >= now() - INTERVAL '180 days'
        )
    )
    SELECT
        (SELECT COUNT(*) FROM updated_users),
        (SELECT MAX(norm_email) FROM batch),
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('email', lu.norm_email, 'atw_tier', lu.atw_tier, 'level', lu.new_level))
             FROM leveled_up lu),
            '[]'::jsonb
        )
    INTO v_updated_count, v_max_email, v_upgraded;

    IF v_max_email IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1
            FROM public.ad_impressions ai
            WHERE ai.ad_id = p_ad_id
              AND lower(trim(ai.user_email)) > v_max_email
            LIMIT 1
        ) INTO v_has_more;
    END IF;

    RETURN jsonb_build_object(
        'updated_count', v_updated_count,
        'last_email', v_max_email,
        'has_more', v_has_more,
        'increment', v_increment,
        'upgraded_users', COALESCE(v_upgraded, '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_apply_atw_deltas(
    p_emails TEXT[],
    p_deltas NUMERIC[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_emails IS NULL OR p_deltas IS NULL OR array_length(p_emails, 1) IS NULL THEN
        RETURN;
    END IF;

    WITH deltas AS (
        SELECT lower(trim(e)) AS norm_email, SUM(val) AS delta
        FROM unnest(p_emails, p_deltas) AS t(e, val)
        WHERE e IS NOT NULL AND val > 0
        GROUP BY lower(trim(e))
    ),
    pre_state AS (
        SELECT
            u.id,
            d.norm_email,
            d.delta,
            public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                COALESCE(u.attention_worth_score, 0.1000),
                COALESCE(u.atw_tier, 'ATW1')
            ) AS old_level,
            (
                COALESCE(u.is_affiliate, FALSE) OR COALESCE(u.is_career, FALSE)
                OR d.norm_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
            ) AS is_exempt
        FROM deltas d
        JOIN public.users u ON lower(trim(u.email)) = d.norm_email
    ),
    updated AS (
        UPDATE public.users u
        SET
            attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + ps.delta),
            atw_tier = CASE
                WHEN ps.is_exempt THEN 'Unlimited'
                ELSE 'ATW' || public.compute_atw_level(
                    COALESCE(u.monetization_clicks, 0),
                    LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + ps.delta),
                    COALESCE(u.atw_tier, 'ATW1')
                )::TEXT
            END
        FROM pre_state ps
        WHERE u.id = ps.id
        RETURNING
            ps.norm_email,
            ps.is_exempt,
            ps.old_level,
            public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                u.attention_worth_score,
                COALESCE(u.atw_tier, 'ATW1')
            ) AS new_level,
            u.atw_tier
    )
    INSERT INTO public.notifications (user_email, title, message)
    SELECT
        up.norm_email,
        'ATW Level Upgraded to ' || up.atw_tier,
        'Congratulations! Your ATW level has increased to ' || up.atw_tier ||
        ', raising your new balance cap to ₦' || trim(to_char(up.new_level * 30000, '999,999,990')) ||
        '. Please withdraw your earnings promptly so you don''t hit your limit.'
    FROM updated up
    WHERE NOT up.is_exempt
      AND up.new_level >= 2
      AND up.new_level > up.old_level
      AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE lower(n.user_email) = up.norm_email
            AND n.title = 'ATW Level Upgraded to ' || up.atw_tier
            AND n.created_at >= now() - INTERVAL '180 days'
      );
END;
$$;
