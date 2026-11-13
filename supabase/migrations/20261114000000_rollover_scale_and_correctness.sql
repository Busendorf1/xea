-- ==============================================================================
-- XEA AD ROLLOVER MODE: CORRECTNESS, ATOMIC CONCURRENCY & 500M+ SCALE MIGRATION
-- ==============================================================================
-- Fixes:
-- 1. Unifies rollover state calculation (scheduled_start_at / approved_at /
--    scheduled_end_at / campaign_days / paid vs unpaid platform posts).
-- 2. Allows paid campaigns in Rollover Mode (impressions > impression_count)
--    to continue delivering & earning past scheduled_end_at / duration end.
-- 3. Aligns claim_ad_earning_atomic and get_user_feed with Stage 1 (+1) and
--    Stage 2 (+1/+2) rollover user_frequency_cap expansion so users are not
--    falsely rejected with FREQUENCY_CAP_REACHED during rollover.
-- 4. Fixes archive_expired_platform_ads() to target public.addsactive (was
--    mistakenly targeting public.adds) using bounded FOR UPDATE SKIP LOCKED chunks.
-- 5. Adds increment_ad_impressions_bulk support for both p_delta and p_count
--    (eliminating 2-RPC roundtrips) plus daily cap rollover accounting.
-- 6. Adds keyset-cursor + FOR UPDATE SKIP LOCKED process_ad_rollover_batch()
--    RPC and partial composite indexes for 500M+ user scale.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- SECTION 1: ROLLOVER TRACKING COLUMNS & SCHEMA PARITY
-- ==============================================================================
ALTER TABLE IF EXISTS public.adds
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_cap INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS rollover_balance INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_rollover BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS rollover_started_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rollover_notified_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS broadening_stage SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.addsactive
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_cap INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS rollover_balance INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_rollover BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS rollover_started_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rollover_notified_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS broadening_stage SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.completed_ads
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_cap INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS rollover_balance INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_rollover BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS rollover_started_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rollover_notified_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS broadening_stage SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.addscompleted
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_cap INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_impression_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS rollover_balance INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_rollover BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS rollover_started_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rollover_notified_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS broadening_stage SMALLINT NOT NULL DEFAULT 0;

-- ==============================================================================
-- SECTION 2: 500M+ SCALE PARTIAL & KEYSET CURSOR INDEXES
-- ==============================================================================

-- Keyset-cursor partial index for non-rollover active paid ads (O(batch) rollover sweep)
CREATE INDEX IF NOT EXISTS idx_addsactive_rollover_candidates_keyset
    ON public.addsactive (id ASC)
    WHERE completed_at IS NULL
      AND COALESCE(is_paused, FALSE) = FALSE
      AND COALESCE(is_rollover, FALSE) = FALSE
      AND COALESCE(is_admin_post, FALSE) = FALSE
      AND COALESCE(impressions, 0) > 0
      AND COALESCE(cost_per_impression, 0) > 0;

-- Partial index for active rollover pool ordered by auction bid and rollover wait time
CREATE INDEX IF NOT EXISTS idx_addsactive_rollover_pool_bid
    ON public.addsactive (bid_price DESC NULLS LAST, rollover_started_at ASC NULLS LAST, id ASC)
    WHERE completed_at IS NULL
      AND COALESCE(is_paused, FALSE) = FALSE
      AND is_rollover = TRUE;

-- Partial index for fast O(batch) archiving of expired unpaid platform/admin posts
CREATE INDEX IF NOT EXISTS idx_addsactive_platform_expiry_partial
    ON public.addsactive (id ASC)
    WHERE completed_at IS NULL
      AND (
          COALESCE(is_admin_post, FALSE) = TRUE
          OR COALESCE(cost_per_impression, 0) <= 0
          OR COALESCE(impressions, 0) <= 0
      );

-- Partial index for active ads with daily impression caps needing day-boundary rollover
CREATE INDEX IF NOT EXISTS idx_addsactive_daily_cap_reset_partial
    ON public.addsactive (last_reset_date ASC NULLS FIRST, id ASC)
    WHERE completed_at IS NULL
      AND COALESCE(is_paused, FALSE) = FALSE
      AND daily_impression_cap IS NOT NULL;

-- Fast case-insensitive ad_impressions cap lookup at 500M+ users
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_user_lower
    ON public.ad_impressions (ad_id, lower(user_email))
    INCLUDE (view_count, today_view_count, last_viewed_at);

-- ==============================================================================
-- SECTION 3: UNIFIED ROLLOVER STATE HELPER
-- ==============================================================================
DROP FUNCTION IF EXISTS public.get_campaign_rollover_state(
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
    INT, INT, INT, NUMERIC, BOOLEAN, INT, TIMESTAMPTZ
) CASCADE;

CREATE OR REPLACE FUNCTION public.get_campaign_rollover_state(
    p_created_at TIMESTAMPTZ,
    p_approved_at TIMESTAMPTZ,
    p_scheduled_start_at TIMESTAMPTZ,
    p_scheduled_end_at TIMESTAMPTZ,
    p_campaign_days INT,
    p_impressions INT,
    p_impression_count INT,
    p_cost_per_impression NUMERIC,
    p_is_admin_post BOOLEAN,
    p_user_frequency_cap INT,
    p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
    is_platform_post BOOLEAN,
    is_scheduled_future BOOLEAN,
    duration_ratio NUMERIC,
    impression_ratio NUMERIC,
    broadening_stage SMALLINT,
    is_rollover BOOLEAN,
    effective_user_cap INT,
    is_expired_platform BOOLEAN,
    effective_start_at TIMESTAMPTZ,
    effective_end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_is_platform BOOLEAN;
    v_base_launch TIMESTAMPTZ;
    v_start_at TIMESTAMPTZ;
    v_is_future BOOLEAN;
    v_days INT;
    v_end_at TIMESTAMPTZ;
    v_dur_sec NUMERIC;
    v_elap_sec NUMERIC;
    v_dur_ratio NUMERIC;
    v_imp_ratio NUMERIC;
    v_stage SMALLINT := 0;
    v_rollover BOOLEAN := FALSE;
    v_base_cap INT;
    v_cap_expansion INT := 0;
    v_exp_plat BOOLEAN := FALSE;
    v_target_imps INT := GREATEST(0, COALESCE(p_impressions, 0));
    v_deliv_imps INT := GREATEST(0, COALESCE(p_impression_count, 0));
BEGIN
    v_is_platform := (
        COALESCE(p_is_admin_post, FALSE)
        OR COALESCE(p_cost_per_impression, 0) <= 0
        OR v_target_imps <= 0
    );

    v_base_launch := COALESCE(p_approved_at, p_created_at, p_now);
    v_start_at := CASE
        WHEN p_scheduled_start_at IS NOT NULL THEN GREATEST(v_base_launch, p_scheduled_start_at)
        ELSE v_base_launch
    END;
    v_is_future := (p_scheduled_start_at IS NOT NULL AND p_scheduled_start_at > p_now);

    v_days := GREATEST(1, LEAST(365, COALESCE(p_campaign_days, 1)));
    v_end_at := CASE
        WHEN p_scheduled_end_at IS NOT NULL AND p_scheduled_end_at > v_start_at THEN p_scheduled_end_at
        ELSE v_start_at + make_interval(days => v_days)
    END;

    v_dur_sec := GREATEST(3600.0, EXTRACT(EPOCH FROM (v_end_at - v_start_at)));
    v_elap_sec := CASE WHEN v_is_future THEN 0.0 ELSE GREATEST(0.0, EXTRACT(EPOCH FROM (p_now - v_start_at))) END;
    v_dur_ratio := v_elap_sec / v_dur_sec;

    IF v_is_platform THEN
        v_imp_ratio := 1.0;
        v_stage := 0;
        v_rollover := FALSE;
        v_base_cap := CASE
            WHEN COALESCE(p_is_admin_post, FALSE) AND COALESCE(p_cost_per_impression, 0) <= 0 THEN 10
            ELSE GREATEST(1, LEAST(100, COALESCE(p_user_frequency_cap, 1)))
        END;
        v_cap_expansion := 0;
        v_exp_plat := (NOT v_is_future AND p_now >= v_end_at);
    ELSE
        v_imp_ratio := LEAST(1.0, v_deliv_imps::NUMERIC / GREATEST(1, v_target_imps)::NUMERIC);
        v_base_cap := GREATEST(1, LEAST(100, COALESCE(p_user_frequency_cap, 1)));

        IF NOT v_is_future AND v_dur_ratio >= 1.0 AND v_deliv_imps < v_target_imps THEN
            v_stage := 2;
            v_rollover := TRUE;
            IF v_imp_ratio < 0.50 THEN
                v_cap_expansion := 2;
            ELSIF v_imp_ratio < 0.85 THEN
                v_cap_expansion := 1;
            END IF;
        ELSIF NOT v_is_future AND v_dur_ratio >= 0.8 AND v_imp_ratio < 0.8 THEN
            v_stage := 1;
            v_rollover := FALSE;
            IF v_imp_ratio < 0.65 THEN
                v_cap_expansion := 1;
            END IF;
        ELSE
            v_stage := 0;
            v_rollover := FALSE;
            v_cap_expansion := 0;
        END IF;
    END IF;

    RETURN QUERY SELECT
        v_is_platform,
        v_is_future,
        v_dur_ratio,
        v_imp_ratio,
        v_stage,
        v_rollover,
        (v_base_cap + v_cap_expansion)::INT,
        v_exp_plat,
        v_start_at,
        v_end_at;
END;
$$;

-- ==============================================================================
-- SECTION 4: ATOMIC KEYSET ROLLOVER PROCESSOR & PLATFORM EXPIRY CLEANUP
-- ==============================================================================
DROP FUNCTION IF EXISTS public.process_ad_rollover_batch(UUID, INT) CASCADE;

CREATE OR REPLACE FUNCTION public.process_ad_rollover_batch(
    p_last_id UUID DEFAULT NULL,
    p_batch_size INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_safe_limit INT := GREATEST(1, LEAST(COALESCE(p_batch_size, 200), 500));
    v_now TIMESTAMPTZ := now();
    v_today DATE := CURRENT_DATE;
    v_processed_count INT := 0;
    v_transitioned_count INT := 0;
    v_stage1_updated INT := 0;
    v_daily_rolled_count INT := 0;
    v_next_cursor UUID := NULL;
    v_has_more BOOLEAN := FALSE;
    v_newly_entered JSONB := '[]'::jsonb;
BEGIN
    -- 1. Keyset-paginated lock-free chunk of non-rollover active paid ads
    CREATE TEMP TABLE IF NOT EXISTS _rollover_scan_chunk (
        id UUID PRIMARY KEY,
        user_email TEXT,
        product_name TEXT,
        ad_content TEXT,
        impressions INT,
        impression_count INT,
        prev_stage SMALLINT,
        prev_rollover BOOLEAN,
        new_stage SMALLINT,
        new_rollover BOOLEAN,
        rollover_notified_at TIMESTAMPTZ
    ) ON COMMIT DROP;

    TRUNCATE _rollover_scan_chunk;

    INSERT INTO _rollover_scan_chunk (
        id,
        user_email,
        product_name,
        ad_content,
        impressions,
        impression_count,
        prev_stage,
        prev_rollover,
        new_stage,
        new_rollover,
        rollover_notified_at
    )
    SELECT
        a.id,
        a.user_email,
        a.product_name,
        a.ad_content,
        COALESCE(a.impressions, 0),
        COALESCE(a.impression_count, 0),
        COALESCE(a.broadening_stage, 0),
        COALESCE(a.is_rollover, FALSE),
        rs.broadening_stage,
        rs.is_rollover,
        a.rollover_notified_at
    FROM (
        SELECT a0.*
        FROM public.addsactive a0
        WHERE a0.completed_at IS NULL
          AND COALESCE(a0.is_paused, FALSE) = FALSE
          AND COALESCE(a0.is_rollover, FALSE) = FALSE
          AND COALESCE(a0.is_admin_post, FALSE) = FALSE
          AND COALESCE(a0.impressions, 0) > 0
          AND COALESCE(a0.cost_per_impression, 0) > 0
          AND (p_last_id IS NULL OR a0.id > p_last_id)
        ORDER BY a0.id ASC
        LIMIT v_safe_limit
        FOR UPDATE OF a0 SKIP LOCKED
    ) a
    CROSS JOIN LATERAL public.get_campaign_rollover_state(
        a.created_at,
        a.approved_at,
        a.scheduled_start_at,
        a.scheduled_end_at,
        a.campaign_days,
        a.impressions,
        a.impression_count,
        a.cost_per_impression,
        a.is_admin_post,
        a.user_frequency_cap,
        v_now
    ) rs;

    SELECT COUNT(*), MAX(id)
    INTO v_processed_count, v_next_cursor
    FROM _rollover_scan_chunk;

    IF v_processed_count = v_safe_limit AND v_next_cursor IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.addsactive a_more
            WHERE a_more.completed_at IS NULL
              AND COALESCE(a_more.is_paused, FALSE) = FALSE
              AND COALESCE(a_more.is_rollover, FALSE) = FALSE
              AND COALESCE(a_more.is_admin_post, FALSE) = FALSE
              AND COALESCE(a_more.impressions, 0) > 0
              AND COALESCE(a_more.cost_per_impression, 0) > 0
              AND a_more.id > v_next_cursor
        ) INTO v_has_more;
    END IF;

    -- 2. Apply Stage 1 / Stage 2 rollover transitions on addsactive & sync public.adds
    WITH updated AS (
        UPDATE public.addsactive a
        SET
            is_rollover = c.new_rollover,
            broadening_stage = c.new_stage,
            rollover_started_at = CASE
                WHEN c.new_rollover THEN COALESCE(a.rollover_started_at, v_now)
                ELSE a.rollover_started_at
            END
        FROM _rollover_scan_chunk c
        WHERE a.id = c.id
          AND (
              COALESCE(a.is_rollover, FALSE) IS DISTINCT FROM c.new_rollover
              OR COALESCE(a.broadening_stage, 0) IS DISTINCT FROM c.new_stage
          )
        RETURNING
            a.id,
            a.user_email,
            a.product_name,
            a.ad_content,
            a.impressions,
            a.impression_count,
            a.is_rollover,
            a.broadening_stage,
            a.rollover_started_at,
            a.rollover_notified_at,
            c.prev_rollover
    )
    SELECT
        COUNT(*) FILTER (WHERE is_rollover = TRUE AND prev_rollover = FALSE),
        COUNT(*) FILTER (WHERE broadening_stage = 1 AND is_rollover = FALSE),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'user_email', user_email,
                    'product_name', product_name,
                    'ad_content', LEFT(COALESCE(ad_content, ''), 80),
                    'impressions', COALESCE(impressions, 0),
                    'impression_count', COALESCE(impression_count, 0),
                    'remaining_impressions', GREATEST(0, COALESCE(impressions, 0) - COALESCE(impression_count, 0)),
                    'rollover_notified_at', rollover_notified_at
                )
            ) FILTER (WHERE is_rollover = TRUE AND prev_rollover = FALSE AND rollover_notified_at IS NULL),
            '[]'::jsonb
        )
    INTO v_transitioned_count, v_stage1_updated, v_newly_entered
    FROM updated;

    -- Mirror rollover status flags to public.adds for advertiser dashboards
    UPDATE public.adds a
    SET
        is_rollover = act.is_rollover,
        broadening_stage = act.broadening_stage,
        rollover_started_at = act.rollover_started_at
    FROM public.addsactive act
    JOIN _rollover_scan_chunk c ON c.id = act.id
    WHERE a.id = act.id
      AND (
          COALESCE(a.is_rollover, FALSE) IS DISTINCT FROM act.is_rollover
          OR COALESCE(a.broadening_stage, 0) IS DISTINCT FROM act.broadening_stage
      );

    -- 3. Bounded day-boundary daily_impression_cap rollover (O(batch), never locks entire table)
    WITH daily_due AS (
        SELECT d.id
        FROM public.addsactive d
        WHERE d.completed_at IS NULL
          AND COALESCE(d.is_paused, FALSE) = FALSE
          AND d.daily_impression_cap IS NOT NULL
          AND d.daily_impression_cap > 0
          AND (d.last_reset_date IS NULL OR d.last_reset_date < v_today)
        ORDER BY d.last_reset_date ASC NULLS FIRST, d.id ASC
        LIMIT v_safe_limit
        FOR UPDATE OF d SKIP LOCKED
    ),
    daily_updated AS (
        UPDATE public.addsactive a
        SET
            rollover_balance = CASE
                WHEN COALESCE(a.impressions, 0) > 0 THEN
                    LEAST(
                        GREATEST(0, COALESCE(a.impressions, 0) - COALESCE(a.impression_count, 0)),
                        COALESCE(a.rollover_balance, 0) + GREATEST(0, COALESCE(a.daily_impression_cap, 0) - COALESCE(a.daily_impression_count, 0))
                    )
                ELSE
                    COALESCE(a.rollover_balance, 0) + GREATEST(0, COALESCE(a.daily_impression_cap, 0) - COALESCE(a.daily_impression_count, 0))
            END,
            daily_impression_count = 0,
            last_reset_date = v_today
        FROM daily_due
        WHERE a.id = daily_due.id
        RETURNING a.id
    )
    SELECT COUNT(*) INTO v_daily_rolled_count FROM daily_updated;

    RETURN jsonb_build_object(
        'success', true,
        'processed_count', COALESCE(v_processed_count, 0),
        'transitioned_count', COALESCE(v_transitioned_count, 0),
        'stage1_updated', COALESCE(v_stage1_updated, 0),
        'daily_rolled_count', COALESCE(v_daily_rolled_count, 0),
        'newly_entered', COALESCE(v_newly_entered, '[]'::jsonb),
        'next_cursor_id', v_next_cursor,
        'has_more', COALESCE(v_has_more, FALSE)
    );
END;
$$;

DROP FUNCTION IF EXISTS public.mark_rollover_notified_batch(UUID[]) CASCADE;

CREATE OR REPLACE FUNCTION public.mark_rollover_notified_batch(p_ad_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INT := 0;
BEGIN
    IF p_ad_ids IS NULL OR cardinality(p_ad_ids) = 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.addsactive
    SET rollover_notified_at = COALESCE(rollover_notified_at, now())
    WHERE id = ANY(p_ad_ids)
      AND rollover_notified_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    UPDATE public.adds
    SET rollover_notified_at = COALESCE(rollover_notified_at, now())
    WHERE id = ANY(p_ad_ids)
      AND rollover_notified_at IS NULL;

    RETURN v_updated;
END;
$$;

-- Fix archive_expired_platform_ads(): previously queried public.adds instead of public.addsactive!
DROP FUNCTION IF EXISTS public.archive_expired_platform_ads() CASCADE;
DROP FUNCTION IF EXISTS public.archive_expired_platform_ads(INT) CASCADE;

CREATE OR REPLACE FUNCTION public.archive_expired_platform_ads(
    p_batch_size INT DEFAULT 250
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_safe_limit INT := GREATEST(1, LEAST(COALESCE(p_batch_size, 250), 1000));
    v_archived_count INT := 0;
    v_now TIMESTAMPTZ := now();
    v_ad_id UUID;
BEGIN
    FOR v_ad_id IN
        SELECT a.id
        FROM public.addsactive a
        CROSS JOIN LATERAL public.get_campaign_rollover_state(
            a.created_at,
            a.approved_at,
            a.scheduled_start_at,
            a.scheduled_end_at,
            a.campaign_days,
            a.impressions,
            a.impression_count,
            a.cost_per_impression,
            a.is_admin_post,
            a.user_frequency_cap,
            v_now
        ) rs
        WHERE a.completed_at IS NULL
          AND rs.is_platform_post = TRUE
          AND rs.is_expired_platform = TRUE
        ORDER BY a.id ASC
        LIMIT v_safe_limit
        FOR UPDATE OF a SKIP LOCKED
    LOOP
        UPDATE public.addsactive
        SET completed_at = COALESCE(completed_at, v_now)
        WHERE id = v_ad_id;

        PERFORM public.archive_completed_ad(v_ad_id);
        v_archived_count := v_archived_count + 1;
    END LOOP;

    RETURN v_archived_count;
END;
$$;

-- ==============================================================================
-- SECTION 5: BULK IMPRESSION FLUSH & DAILY ROLLOVER SYNC
-- ==============================================================================
DROP FUNCTION IF EXISTS public.increment_ad_impressions_bulk(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS public.increment_ad_impressions_bulk(UUID, INT, INT) CASCADE;

CREATE OR REPLACE FUNCTION public.increment_ad_impressions_bulk(
    p_ad_id UUID,
    p_delta INT DEFAULT NULL,
    p_count INT DEFAULT NULL
)
RETURNS TABLE (
    new_impression_count BIGINT,
    target_impressions BIGINT,
    is_exhausted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shard INT := floor(random() * 16)::int;
    v_new_total BIGINT := 0;
    v_target BIGINT := 0;
    v_exhausted BOOLEAN := FALSE;
    v_safe_delta INT := GREATEST(1, COALESCE(p_delta, p_count, 1));
    v_today DATE := CURRENT_DATE;
BEGIN
    -- 1. Lock-free shard increment
    INSERT INTO public.ad_impression_shards (ad_id, shard_id, impression_count, updated_at)
    VALUES (p_ad_id, v_shard, v_safe_delta, now())
    ON CONFLICT (ad_id, shard_id) DO UPDATE SET
        impression_count = public.ad_impression_shards.impression_count + EXCLUDED.impression_count,
        updated_at = now();

    SELECT COALESCE(SUM(s.impression_count), 0)::BIGINT
    INTO v_new_total
    FROM public.ad_impression_shards s
    WHERE s.ad_id = p_ad_id;

    -- 2. Sync summary counter + daily rollover counters on active ad & detect exhaustion
    UPDATE public.addsactive a
    SET
        impression_count = GREATEST(COALESCE(a.impression_count, 0), v_new_total)::INT,
        rollover_balance = CASE
            WHEN a.daily_impression_cap IS NOT NULL AND a.daily_impression_cap > 0 AND (a.last_reset_date IS NULL OR a.last_reset_date < v_today) THEN
                GREATEST(
                    0,
                    COALESCE(a.rollover_balance, 0)
                    + GREATEST(0, a.daily_impression_cap - COALESCE(a.daily_impression_count, 0))
                    - GREATEST(0, v_safe_delta - a.daily_impression_cap)
                )
            WHEN a.daily_impression_cap IS NOT NULL AND a.daily_impression_cap > 0 AND (COALESCE(a.daily_impression_count, 0) + v_safe_delta) > a.daily_impression_cap THEN
                GREATEST(
                    0,
                    COALESCE(a.rollover_balance, 0)
                    - ((COALESCE(a.daily_impression_count, 0) + v_safe_delta) - GREATEST(a.daily_impression_cap, COALESCE(a.daily_impression_count, 0)))
                )
            ELSE COALESCE(a.rollover_balance, 0)
        END,
        daily_impression_count = CASE
            WHEN a.last_reset_date IS NULL OR a.last_reset_date < v_today THEN v_safe_delta
            ELSE COALESCE(a.daily_impression_count, 0) + v_safe_delta
        END,
        last_reset_date = v_today,
        completed_at = CASE
            WHEN (COALESCE(a.impressions, 0) > 0 AND GREATEST(COALESCE(a.impression_count, 0), v_new_total) >= a.impressions)
            THEN COALESCE(a.completed_at, now())
            ELSE a.completed_at
        END
    WHERE a.id = p_ad_id
    RETURNING
        GREATEST(COALESCE(impression_count, 0)::BIGINT, v_new_total),
        COALESCE(impressions, 0)::BIGINT,
        (COALESCE(impressions, 0) > 0 AND GREATEST(COALESCE(impression_count, 0)::BIGINT, v_new_total) >= COALESCE(impressions, 0))
    INTO v_new_total, v_target, v_exhausted;

    IF NOT FOUND THEN
        IF to_regclass('public.completed_ads') IS NOT NULL THEN
            SELECT COALESCE(impression_count, 0)::BIGINT, COALESCE(impressions, 0)::BIGINT, TRUE
            INTO v_new_total, v_target, v_exhausted
            FROM public.completed_ads
            WHERE id = p_ad_id;
        END IF;

        RETURN QUERY SELECT COALESCE(v_new_total, 0)::BIGINT, COALESCE(v_target, 0)::BIGINT, COALESCE(v_exhausted, FALSE);
        RETURN;
    END IF;

    -- Keep public.adds impression_count mirrored for advertiser status checks
    UPDATE public.adds
    SET
        impression_count = GREATEST(COALESCE(impression_count, 0), v_new_total)::INT,
        completed_at = CASE
            WHEN v_exhausted THEN COALESCE(completed_at, now())
            ELSE completed_at
        END
    WHERE id = p_ad_id;

    -- 3. Archive exhausted ads to completed_ads & addscompleted and purge from addsactive & bidded_ads
    IF v_exhausted THEN
        PERFORM public.archive_completed_ad(p_ad_id);
    END IF;

    RETURN QUERY SELECT v_new_total, v_target, v_exhausted;
END;
$$;

-- ==============================================================================
-- SECTION 6: ROLLOVER-AWARE claim_ad_earning_atomic & get_user_feed
-- ==============================================================================
DROP FUNCTION IF EXISTS public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) CASCADE;

CREATE OR REPLACE FUNCTION public.claim_ad_earning_atomic(
    p_ad_id UUID,
    p_user_email TEXT,
    p_expected_rate NUMERIC DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL,
    p_skip_ad_counter BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email_lower TEXT := lower(trim(COALESCE(p_user_email, '')));
    v_user_id UUID;
    v_current_bal NUMERIC(12,2);
    v_current_clicks INT;
    v_attention_score NUMERIC(6,2);
    v_current_tier TEXT;
    v_monetized_val TEXT;
    v_ref_downloads INT;
    v_is_affiliate BOOLEAN;
    v_is_career BOOLEAN;
    v_has_cancelled BOOLEAN;
    v_suspended_until TIMESTAMPTZ;
    v_is_exempt BOOLEAN := FALSE;
    v_is_monetized BOOLEAN := FALSE;

    v_raw_cpi NUMERIC(12,2);
    v_user_freq_cap INT;
    v_impressions_target INT;
    v_impressions_count INT;
    v_ad_completed BOOLEAN;
    v_ad_paused BOOLEAN;
    v_ad_is_admin BOOLEAN;
    v_ad_created_at TIMESTAMPTZ;
    v_ad_approved_at TIMESTAMPTZ;
    v_sched_start TIMESTAMPTZ;
    v_sched_end TIMESTAMPTZ;
    v_campaign_days INT;

    v_is_platform BOOLEAN := FALSE;
    v_is_future BOOLEAN := FALSE;
    v_dur_ratio NUMERIC := 0;
    v_imp_ratio NUMERIC := 0;
    v_broadening_stage SMALLINT := 0;
    v_is_rollover BOOLEAN := FALSE;
    v_effective_cap INT := 1;
    v_is_expired_platform BOOLEAN := FALSE;
    v_eff_start TIMESTAMPTZ;
    v_eff_end TIMESTAMPTZ;

    v_existing_views INT := NULL;
    v_next_clicks INT;
    v_next_level INT;
    v_next_tier TEXT;
    v_holding_cap NUMERIC(12,2);
    v_earn_rate NUMERIC(12,2) := 0.00;
    v_next_bal NUMERIC(12,2);
    v_net_credited NUMERIC(12,2) := 0.00;
    v_is_capped BOOLEAN := FALSE;
    v_effective_cpi NUMERIC(12,2) := 0.00;
    v_next_monetized TEXT;
BEGIN
    IF v_email_lower = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_USER',
            'error', 'Invalid user identity.'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM public.deactivated_users du WHERE du.email = v_email_lower) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ACCOUNT_DEACTIVATED',
            'error', 'Account is deactivated.'
        );
    END IF;

    -- 1. Lock User Row Atomically
    SELECT
        id,
        COALESCE(balance, 0),
        COALESCE(monetization_clicks, 0),
        COALESCE(attention_worth_score, 0),
        COALESCE(atw_tier, 'ATW1'),
        lower(COALESCE(monetized::TEXT, 'false')),
        COALESCE(referral_downloads_count, 0),
        COALESCE(is_affiliate, FALSE),
        COALESCE(is_career, FALSE),
        COALESCE(has_cancelled_monetization, FALSE),
        suspended_until
    INTO
        v_user_id,
        v_current_bal,
        v_current_clicks,
        v_attention_score,
        v_current_tier,
        v_monetized_val,
        v_ref_downloads,
        v_is_affiliate,
        v_is_career,
        v_has_cancelled,
        v_suspended_until
    FROM public.users
    WHERE lower(email) = v_email_lower
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'USER_NOT_FOUND',
            'error', 'User account not found.'
        );
    END IF;

    IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'USER_SUSPENDED',
            'error', 'Account is currently suspended.',
            'suspended_until', v_suspended_until
        );
    END IF;

    v_is_exempt := (
        v_is_affiliate
        OR v_is_career
        OR v_email_lower IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
    );

    v_is_monetized := (
        NOT v_has_cancelled
        AND (
            v_monetized_val IN ('true', 'yes', '1', 't')
            OR v_current_clicks >= 300
            OR v_ref_downloads >= 12
            OR v_is_exempt
        )
    );

    -- 2. Resolve Approved Live Ad ONLY from public.addsactive
    SELECT
        cost_per_impression,
        COALESCE(user_frequency_cap, 1),
        COALESCE(impressions, 0),
        COALESCE(impression_count, 0),
        (completed_at IS NOT NULL),
        COALESCE(is_paused, FALSE),
        COALESCE(is_admin_post, FALSE),
        created_at,
        approved_at,
        scheduled_start_at,
        scheduled_end_at,
        COALESCE(campaign_days, 1)
    INTO
        v_raw_cpi,
        v_user_freq_cap,
        v_impressions_target,
        v_impressions_count,
        v_ad_completed,
        v_ad_paused,
        v_ad_is_admin,
        v_ad_created_at,
        v_ad_approved_at,
        v_sched_start,
        v_sched_end,
        v_campaign_days
    FROM public.addsactive
    WHERE id = p_ad_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CAMPAIGN_NOT_FOUND',
            'error', 'Ad campaign is not active or does not exist.'
        );
    END IF;

    SELECT
        rs.is_platform_post,
        rs.is_scheduled_future,
        rs.duration_ratio,
        rs.impression_ratio,
        rs.broadening_stage,
        rs.is_rollover,
        rs.effective_user_cap,
        rs.is_expired_platform,
        rs.effective_start_at,
        rs.effective_end_at
    INTO
        v_is_platform,
        v_is_future,
        v_dur_ratio,
        v_imp_ratio,
        v_broadening_stage,
        v_is_rollover,
        v_effective_cap,
        v_is_expired_platform,
        v_eff_start,
        v_eff_end
    FROM public.get_campaign_rollover_state(
        v_ad_created_at,
        v_ad_approved_at,
        v_sched_start,
        v_sched_end,
        v_campaign_days,
        v_impressions_target,
        v_impressions_count,
        v_raw_cpi,
        v_ad_is_admin,
        v_user_freq_cap,
        now()
    ) rs;

    -- Note: Paid campaigns past scheduled_end_at / campaign_days with remaining impressions
    -- continue in Rollover Mode (v_is_rollover = TRUE, v_is_expired_platform = FALSE).
    IF v_ad_completed
       OR v_ad_paused
       OR v_is_future
       OR v_is_expired_platform
       OR (v_impressions_target > 0 AND v_impressions_count >= v_impressions_target) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CAMPAIGN_COMPLETED',
            'error', 'Campaign has finished, is paused, or is outside its active schedule.'
        );
    END IF;

    -- 3. Rollover-Aware Frequency Cap Check (honors Stage 1 +1 and Stage 2 +1/+2 expansion)
    SELECT COALESCE(view_count, 0)
    INTO v_existing_views
    FROM public.ad_impressions
    WHERE ad_id = p_ad_id
      AND lower(user_email) = v_email_lower
    FOR UPDATE;

    IF FOUND AND v_existing_views >= v_effective_cap THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FREQUENCY_CAP_REACHED',
            'error', 'Frequency cap reached for this campaign.',
            'views', v_existing_views,
            'views_used', v_existing_views,
            'cap', v_effective_cap,
            'max_views', v_effective_cap,
            'is_rollover', v_is_rollover,
            'broadening_stage', v_broadening_stage
        );
    END IF;

    -- 4. Compute Next Clicks, Unified ATW Level & Holding Cap
    v_next_clicks := v_current_clicks + 1;
    v_next_level := public.compute_atw_level(v_next_clicks, v_attention_score, v_current_tier);
    v_next_tier := CASE WHEN v_is_exempt THEN 'Unlimited' ELSE 'ATW' || v_next_level::TEXT END;
    v_holding_cap := CASE
        WHEN v_is_exempt THEN 999999999.00
        ELSE (v_next_level * 30000.00)::NUMERIC(12,2)
    END;

    -- 5. Dynamic 50% Earn Rate Calculation & Holding Cap Truncation
    v_raw_cpi := GREATEST(0.00, COALESCE(v_raw_cpi, 25.00));
    IF NOT v_is_monetized THEN
        v_earn_rate := 0.00;
        v_net_credited := 0.00;
        v_next_bal := v_current_bal;
    ELSE
        v_earn_rate := ROUND((v_raw_cpi * 0.50)::numeric, 2);
        IF p_expected_rate IS NOT NULL AND p_expected_rate > 0 THEN
            v_earn_rate := LEAST(v_earn_rate, ROUND(p_expected_rate::numeric, 2));
        END IF;

        IF v_current_bal >= v_holding_cap THEN
            v_is_capped := TRUE;
            v_next_bal := v_current_bal;
            v_net_credited := 0.00;
        ELSE
            v_next_bal := LEAST(v_holding_cap, ROUND((v_current_bal + v_earn_rate)::numeric, 2));
            v_net_credited := GREATEST(0.00, ROUND((v_next_bal - v_current_bal)::numeric, 2));
            v_is_capped := (v_next_bal >= v_holding_cap AND v_net_credited < v_earn_rate);
        END IF;
    END IF;

    -- 6. Upsert Impression Record
    IF v_existing_views IS NOT NULL THEN
        UPDATE public.ad_impressions
        SET
            view_count = COALESCE(view_count, 0) + 1,
            today_view_count = CASE
                WHEN last_viewed_at::date = CURRENT_DATE THEN COALESCE(today_view_count, 0) + 1
                ELSE 1
            END,
            last_viewed_at = now()
        WHERE ad_id = p_ad_id AND lower(user_email) = v_email_lower;
    ELSE
        INSERT INTO public.ad_impressions (
            ad_id,
            user_email,
            view_count,
            today_view_count,
            last_viewed_at
        ) VALUES (
            p_ad_id,
            v_email_lower,
            1,
            1,
            now()
        );
    END IF;

    IF NOT COALESCE(p_skip_ad_counter, FALSE) THEN
        UPDATE public.addsactive
        SET
            impression_count = COALESCE(impression_count, 0) + 1,
            is_rollover = v_is_rollover,
            broadening_stage = GREATEST(COALESCE(broadening_stage, 0), v_broadening_stage),
            rollover_started_at = CASE
                WHEN v_is_rollover THEN COALESCE(rollover_started_at, now())
                ELSE rollover_started_at
            END,
            completed_at = CASE
                WHEN (impressions > 0 AND (COALESCE(impression_count, 0) + 1) >= impressions) THEN now()
                ELSE completed_at
            END
        WHERE id = p_ad_id;
    END IF;

    -- 7. Atomically Persist Balance, Clicks, ATW Tier & Active Timestamp
    v_next_monetized := CASE
        WHEN v_has_cancelled THEN 'false'
        WHEN (v_is_monetized OR v_next_clicks >= 300) THEN 'true'
        ELSE 'false'
    END;

    UPDATE public.users
    SET
        balance = v_next_bal,
        monetization_clicks = v_next_clicks,
        atw_tier = v_next_tier,
        monetized = v_next_monetized,
        last_active_at = now()
    WHERE id = v_user_id;

    -- 8. Credit Affiliate Share ONLY if Monetized AND Actual Net Credit > 0
    IF v_is_monetized AND v_net_credited > 0 AND v_earn_rate > 0 THEN
        v_effective_cpi := ROUND(v_raw_cpi * (v_net_credited / v_earn_rate), 2);
        IF v_effective_cpi > 0 THEN
            PERFORM public.credit_affiliate_platform_share_atomic(v_effective_cpi, p_ad_id, v_email_lower);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'CLAIMED',
        'new_balance', v_next_bal,
        'credited', v_net_credited,
        'net_credited', v_net_credited,
        'is_capped', v_is_capped,
        'holding_cap', v_holding_cap,
        'clicks', v_next_clicks,
        'atw_tier', v_next_tier,
        'views_used', COALESCE(v_existing_views, 0) + 1,
        'max_views', v_effective_cap,
        'effective_user_cap', v_effective_cap,
        'is_rollover', v_is_rollover,
        'broadening_stage', v_broadening_stage
    );
END;
$$;

-- Hardened, Rollover-Aware get_user_feed (returns schedule & rollover metadata + daily cap rollover)
DROP FUNCTION IF EXISTS public.get_user_feed(TEXT, INT, INT) CASCADE;

CREATE OR REPLACE FUNCTION public.get_user_feed(
    p_user_email TEXT,
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    ad_type TEXT,
    industry TEXT[],
    interest TEXT[],
    lifestyle TEXT[],
    behavior TEXT[],
    personality TEXT[],
    age_range INT[],
    targeting_all BOOLEAN,
    impressions INT,
    campaign_days INT,
    user_frequency_cap INT,
    country TEXT,
    state TEXT,
    province TEXT,
    gender TEXT,
    employment_status TEXT,
    ad_media_type TEXT,
    ad_content TEXT,
    ad_action_buttons TEXT[],
    action_phone TEXT,
    action_whatsapp TEXT,
    action_website TEXT,
    action_email TEXT,
    action_ios TEXT,
    action_android TEXT,
    action_watch_now TEXT,
    display_mutual_button BOOLEAN,
    product_name TEXT,
    product_price NUMERIC(12,2),
    product_cta_type TEXT,
    product_cta_link TEXT,
    ad_media TEXT,
    user_email TEXT,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    impression_count INT,
    cost_per_impression NUMERIC(12,2),
    is_bidded BOOLEAN,
    bid_price NUMERIC(12,2),
    scheduled_start_at TIMESTAMPTZ,
    scheduled_end_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    is_admin_post BOOLEAN,
    is_rollover BOOLEAN,
    broadening_stage SMALLINT,
    rollover_balance INT,
    daily_impression_cap INT,
    daily_impression_count INT,
    last_reset_date DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email_lower TEXT := lower(trim(COALESCE(p_user_email, '')));
    v_user_dob DATE;
    v_age INT := 25;
    v_user_country TEXT;
    v_user_state TEXT;
    v_user_location TEXT;
    v_user_gender TEXT;
    v_user_employment TEXT;
    v_user_interest TEXT[];
    v_user_lifestyle TEXT[];
    v_user_personality TEXT[];
    v_user_behavior TEXT[];
    v_user_industry TEXT[];
    v_safe_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
    v_safe_offset INT := GREATEST(0, COALESCE(p_offset, 0));
    v_now TIMESTAMPTZ := now();
    v_today DATE := CURRENT_DATE;
BEGIN
    IF v_email_lower = '' OR EXISTS (SELECT 1 FROM public.deactivated_users du WHERE du.email = v_email_lower) THEN
        RETURN;
    END IF;

    SELECT
        CASE
            WHEN u.dob IS NOT NULL
                 AND u.dob::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
                 AND u.dob::TEXT != '1970-01-01'
            THEN (u.dob::TEXT)::DATE
            ELSE NULL
        END,
        NULLIF(u.country, 'PLACEHOLDER'),
        NULLIF(u.state, 'PLACEHOLDER'),
        NULLIF(u.location, 'PLACEHOLDER'),
        u.gender,
        COALESCE(u.employment, u.employment_status),
        u.interest,
        u.lifestyle,
        u.personality,
        u.behavior,
        u.industry
    INTO
        v_user_dob, v_user_country, v_user_state, v_user_location,
        v_user_gender, v_user_employment,
        v_user_interest, v_user_lifestyle, v_user_personality, v_user_behavior, v_user_industry
    FROM public.users u
    WHERE lower(u.email) = v_email_lower
      AND COALESCE(u.ad_account_status, 'active') <> 'deactivated'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_user_dob IS NOT NULL THEN
        v_age := date_part('year', age(v_user_dob))::INT;
    END IF;

    RETURN QUERY
    WITH candidate_ads AS (
        SELECT
            a.id,
            a.ad_type::TEXT AS ad_type,
            a.industry,
            a.interest,
            a.lifestyle,
            a.behavior,
            a.personality,
            a.age_range,
            a.targeting_all,
            a.impressions,
            a.campaign_days,
            a.user_frequency_cap,
            a.country::TEXT AS country,
            a.state::TEXT AS state,
            a.province::TEXT AS province,
            a.gender::TEXT AS gender,
            a.employment_status::TEXT AS employment_status,
            a.ad_media_type::TEXT AS ad_media_type,
            a.ad_content::TEXT AS ad_content,
            a.ad_action_buttons,
            a.action_phone::TEXT AS action_phone,
            a.action_whatsapp::TEXT AS action_whatsapp,
            a.action_website::TEXT AS action_website,
            a.action_email::TEXT AS action_email,
            a.action_ios::TEXT AS action_ios,
            a.action_android::TEXT AS action_android,
            a.action_watch_now::TEXT AS action_watch_now,
            a.display_mutual_button,
            a.product_name::TEXT AS product_name,
            a.product_price,
            a.product_cta_type::TEXT AS product_cta_type,
            a.product_cta_link::TEXT AS product_cta_link,
            a.ad_media::TEXT AS ad_media,
            a.user_email::TEXT AS user_email,
            a.created_at,
            a.completed_at,
            a.impression_count,
            a.cost_per_impression,
            CASE WHEN b.id IS NOT NULL THEN true ELSE false END AS is_bidded,
            COALESCE(b.bid_price, a.cost_per_impression) AS bid_price,
            a.scheduled_start_at,
            a.scheduled_end_at,
            a.approved_at,
            COALESCE(a.is_admin_post, FALSE) AS is_admin_post,
            rs.is_rollover,
            rs.broadening_stage,
            COALESCE(a.rollover_balance, 0) AS rollover_balance,
            a.daily_impression_cap,
            COALESCE(a.daily_impression_count, 0) AS daily_impression_count,
            a.last_reset_date,
            (
                CASE WHEN a.state IS NOT NULL AND v_user_state IS NOT NULL AND lower(a.state) = lower(v_user_state) THEN 15.0 ELSE 0.0 END +
                CASE WHEN v_user_interest IS NOT NULL AND a.interest && v_user_interest THEN 10.0 ELSE 0.0 END +
                CASE WHEN v_user_industry IS NOT NULL AND a.industry && v_user_industry THEN 5.0 ELSE 0.0 END +
                CASE WHEN v_user_lifestyle IS NOT NULL AND a.lifestyle && v_user_lifestyle THEN 5.0 ELSE 0.0 END
            ) AS relevance_affinity,
            CASE
                WHEN b.id IS NOT NULL THEN 75.0 + (COALESCE(b.bid_price, 0) / 50.0)
                ELSE 0.0
            END AS auction_base_score
        FROM public.addsactive a
        LEFT JOIN public.bidded_ads b ON b.ad_id = a.id AND b.is_active = true
        CROSS JOIN LATERAL public.get_campaign_rollover_state(
            a.created_at,
            a.approved_at,
            a.scheduled_start_at,
            a.scheduled_end_at,
            a.campaign_days,
            a.impressions,
            a.impression_count,
            a.cost_per_impression,
            a.is_admin_post,
            a.user_frequency_cap,
            v_now
        ) rs
        WHERE a.completed_at IS NULL
          AND COALESCE(a.is_paused, FALSE) = FALSE
          AND NOT rs.is_scheduled_future
          AND NOT rs.is_expired_platform
          AND (COALESCE(a.impressions, 0) <= 0 OR COALESCE(a.impression_count, 0) < a.impressions)
          AND (
              a.daily_impression_cap IS NULL
              OR a.last_reset_date IS NULL
              OR a.last_reset_date < v_today
              OR COALESCE(a.daily_impression_count, 0) < (a.daily_impression_cap + COALESCE(a.rollover_balance, 0))
          )
          AND LOWER(a.user_email) <> v_email_lower
          AND NOT EXISTS (
              SELECT 1 FROM public.deactivated_users du
              WHERE du.email = LOWER(a.user_email)
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.blocked_ads ba
              WHERE ba.ad_id::TEXT = a.id::TEXT AND LOWER(ba.reporter_email) = v_email_lower
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.blocked_advertisers bav
              WHERE LOWER(bav.advertiser_email) = LOWER(a.user_email)
                AND LOWER(bav.reporter_email) = v_email_lower
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.ad_impressions ai
              WHERE ai.ad_id = a.id
                AND LOWER(ai.user_email) = v_email_lower
                AND COALESCE(ai.view_count, 0) >= rs.effective_user_cap
          )
          AND (
              (a.mutual_targets IS NOT NULL AND v_email_lower = ANY(
                  ARRAY(SELECT lower(t) FROM unnest(a.mutual_targets) t)
              ))
              OR (
                  (a.country IS NULL OR a.country = '' OR lower(a.country) = 'all' OR lower(a.country) = lower(COALESCE(v_user_country, '')))
                  AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) IN ('both', 'all') OR lower(a.gender) = lower(COALESCE(v_user_gender, '')))
                  AND (
                      a.age_range IS NULL OR cardinality(a.age_range) < 2
                      OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
                  )
                  AND (
                      a.state IS NULL OR a.state = '' OR lower(a.state) = 'all'
                      OR lower(a.state) = lower(COALESCE(v_user_state, ''))
                      OR (a.province IS NOT NULL AND v_user_state IS NOT NULL AND a.province ILIKE '%' || v_user_state || '%')
                      OR (a.province IS NOT NULL AND v_user_location IS NOT NULL AND a.province ILIKE '%' || v_user_location || '%')
                      OR (
                          rs.broadening_stage >= 2
                          AND (a.country IS NOT NULL AND lower(a.country) = lower(COALESCE(v_user_country, '')))
                      )
                  )
                  AND (
                      a.employment_status IS NULL OR a.employment_status = '' OR lower(a.employment_status) = 'all'
                      OR lower(COALESCE(v_user_employment, '')) = ANY(
                          string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
                      )
                      OR rs.broadening_stage >= 1
                  )
                  AND (
                      a.targeting_all = TRUE
                      OR (
                          cardinality(COALESCE(a.interest, '{}')) = 0
                          AND cardinality(COALESCE(a.lifestyle, '{}')) = 0
                          AND cardinality(COALESCE(a.personality, '{}')) = 0
                          AND cardinality(COALESCE(a.behavior, '{}')) = 0
                          AND cardinality(COALESCE(a.industry, '{}')) = 0
                      )
                      OR (v_user_interest IS NOT NULL AND a.interest && v_user_interest)
                      OR (v_user_lifestyle IS NOT NULL AND a.lifestyle && v_user_lifestyle)
                      OR (v_user_personality IS NOT NULL AND a.personality && v_user_personality)
                      OR (v_user_behavior IS NOT NULL AND a.behavior && v_user_behavior)
                      OR (v_user_industry IS NOT NULL AND a.industry && v_user_industry)
                      OR rs.broadening_stage >= 1
                  )
              )
          )
    )
    SELECT
        ca.id,
        ca.ad_type,
        ca.industry,
        ca.interest,
        ca.lifestyle,
        ca.behavior,
        ca.personality,
        ca.age_range,
        ca.targeting_all,
        ca.impressions,
        ca.campaign_days,
        ca.user_frequency_cap,
        ca.country,
        ca.state,
        ca.province,
        ca.gender,
        ca.employment_status,
        ca.ad_media_type,
        ca.ad_content,
        ca.ad_action_buttons,
        ca.action_phone,
        ca.action_whatsapp,
        ca.action_website,
        ca.action_email,
        ca.action_ios,
        ca.action_android,
        ca.action_watch_now,
        ca.display_mutual_button,
        ca.product_name,
        ca.product_price,
        ca.product_cta_type,
        ca.product_cta_link,
        ca.ad_media,
        ca.user_email,
        ca.created_at,
        ca.completed_at,
        ca.impression_count,
        ca.cost_per_impression,
        ca.is_bidded,
        ca.bid_price,
        ca.scheduled_start_at,
        ca.scheduled_end_at,
        ca.approved_at,
        ca.is_admin_post,
        ca.is_rollover,
        ca.broadening_stage,
        ca.rollover_balance,
        ca.daily_impression_cap,
        ca.daily_impression_count,
        ca.last_reset_date
    FROM candidate_ads ca
    ORDER BY (
        ca.auction_base_score
        + ca.relevance_affinity
        + (CASE WHEN ca.is_rollover THEN 25.0 WHEN ca.broadening_stage >= 1 THEN 10.0 ELSE 0.0 END)
        + random() * 10.0
    ) DESC
    LIMIT v_safe_limit OFFSET v_safe_offset;
END;
$$;

-- Lock down SECURITY DEFINER RPC permissions strictly to service_role
REVOKE ALL ON FUNCTION public.process_ad_rollover_batch(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ad_rollover_batch(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.mark_rollover_notified_batch(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_rollover_notified_batch(UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.archive_expired_platform_ads(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_platform_ads(INT) TO service_role;

REVOKE ALL ON FUNCTION public.increment_ad_impressions_bulk(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_impressions_bulk(UUID, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_feed(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO service_role;

ALTER FUNCTION public.get_campaign_rollover_state(
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
    INT, INT, INT, NUMERIC, BOOLEAN, INT, TIMESTAMPTZ
) SET search_path = public;

NOTIFY pgrst, 'reload schema';

COMMIT;
