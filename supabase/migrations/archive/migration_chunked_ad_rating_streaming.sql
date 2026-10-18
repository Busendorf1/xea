-- ==============================================================================
-- MIGRATION: CHUNKED BATCHING & CURSOR STREAMING FOR 100M+ AUDIENCE RATINGS
-- ==============================================================================

-- 1. Optimized High-Speed Index on ad_impressions for cursor streaming
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_id_email 
  ON public.ad_impressions (ad_id, lower(user_email));

-- 2. Bulk/Chunked ATW Rating Application Function (5,000 users per transaction)
CREATE OR REPLACE FUNCTION public.apply_ad_rating_chunk(
    p_ad_id UUID,
    p_star_rating INT,
    p_batch_size INT DEFAULT 5000,
    p_last_email TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_increment NUMERIC(6,4);
    v_updated_count INT := 0;
    v_last_processed_email TEXT := NULL;
    v_has_more BOOLEAN := FALSE;
BEGIN
    -- Determine score increment based on 1 to 5 star rating
    IF p_star_rating = 1 THEN 
        v_increment := 0.0100;
    ELSIF p_star_rating = 2 THEN 
        v_increment := 0.0200;
    ELSIF p_star_rating = 3 THEN 
        v_increment := 0.0300;
    ELSIF p_star_rating = 4 THEN 
        v_increment := 0.0400;
    ELSIF p_star_rating = 5 THEN 
        v_increment := 0.0500;
    ELSE 
        RAISE EXCEPTION 'Invalid star rating. Must be between 1 and 5.';
    END IF;

    -- Update a bounded chunk of users using cursor pagination (O(1) memory & no table locks)
    WITH batch_listeners AS (
        SELECT DISTINCT lower(user_email) AS listener_email
        FROM public.ad_impressions
        WHERE ad_id = p_ad_id 
          AND user_email IS NOT NULL 
          AND user_email != ''
          AND (p_last_email IS NULL OR lower(user_email) > lower(p_last_email))
        ORDER BY lower(user_email) ASC
        LIMIT p_batch_size
    ),
    updated_users AS (
        UPDATE public.users u
        SET 
            attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
            atw_tier = (
                CASE
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 1000000.0000 THEN 'ATW14'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 500000.0000 THEN 'ATW13'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 250000.0000 THEN 'ATW12'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 150000.0000 THEN 'ATW11'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 90000.0000 THEN 'ATW10'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 70000.0000 THEN 'ATW9'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 50000.0000 THEN 'ATW8'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 40000.0000 THEN 'ATW7'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 30000.0000 THEN 'ATW6'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 20000.0000 THEN 'ATW5'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 10000.0000 THEN 'ATW4'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 5000.0000 THEN 'ATW3'
                    WHEN (COALESCE(u.attention_worth_score, 0.1000) + v_increment) >= 1000.0000 THEN 'ATW2'
                    ELSE 'ATW1'
                END
            )
        FROM batch_listeners b
        WHERE lower(u.email) = b.listener_email
        RETURNING u.email
    )
    SELECT 
        COUNT(*),
        MAX(lower(email))
    INTO 
        v_updated_count,
        v_last_processed_email
    FROM updated_users;

    -- Check if more participants exist after the current cursor
    IF v_last_processed_email IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 
            FROM public.ad_impressions 
            WHERE ad_id = p_ad_id 
              AND user_email IS NOT NULL 
              AND user_email != ''
              AND lower(user_email) > v_last_processed_email
            LIMIT 1
        ) INTO v_has_more;
    ELSE
        v_has_more := FALSE;
    END IF;

    RETURN jsonb_build_object(
        'updated_count', v_updated_count,
        'last_email', v_last_processed_email,
        'has_more', v_has_more,
        'increment', v_increment
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.apply_ad_rating_chunk(UUID, INT, INT, TEXT) TO authenticated, service_role;
