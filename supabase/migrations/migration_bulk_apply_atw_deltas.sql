-- ==============================================================================
-- MIGRATION: BULK ATW DELTA APPLIER FOR REDIS WRITE-BEHIND FLUSHER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.bulk_apply_atw_deltas(
    p_emails TEXT[],
    p_deltas NUMERIC[]
) RETURNS VOID AS $$
BEGIN
    IF array_length(p_emails, 1) IS NULL OR array_length(p_emails, 1) = 0 THEN
        RETURN;
    END IF;

    -- Update users in one single set-based statement using unnest
    WITH deltas AS (
        SELECT lower(unnest(p_emails)) AS user_email, unnest(p_deltas) AS score_delta
    )
    UPDATE public.users u
    SET 
        attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + d.score_delta),
        atw_tier = (
            CASE
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 1000000.0000 THEN 'ATW14'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 500000.0000 THEN 'ATW13'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 250000.0000 THEN 'ATW12'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 150000.0000 THEN 'ATW11'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 90000.0000 THEN 'ATW10'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 70000.0000 THEN 'ATW9'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 50000.0000 THEN 'ATW8'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 40000.0000 THEN 'ATW7'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 30000.0000 THEN 'ATW6'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 20000.0000 THEN 'ATW5'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 10000.0000 THEN 'ATW4'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 5000.0000 THEN 'ATW3'
                WHEN (COALESCE(u.attention_worth_score, 0.1000) + d.score_delta) >= 1000.0000 THEN 'ATW2'
                ELSE 'ATW1'
            END
        )
    FROM deltas d
    WHERE lower(u.email) = d.user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.bulk_apply_atw_deltas(TEXT[], NUMERIC[]) TO authenticated, service_role;
