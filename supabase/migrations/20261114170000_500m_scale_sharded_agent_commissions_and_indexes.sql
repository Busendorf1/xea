-- ============================================================================
-- Migration: 20261114170000_500m_scale_sharded_agent_commissions_and_indexes
-- Purpose:
--   1. Eliminate mega-influencer/agent FOR UPDATE hot-row lock contention in
--      `apply_agent_commission_atomic` via 64 lock-free `agent_commission_shards`
--      + `pg_try_advisory_xact_lock` fast path & `flush_agent_commission_shards_atomic`.
--   2. Drain both `affiliate_yield_shards` and `agent_commission_shards` inside
--      `run_database_cleanup_cron()` so sharded credits always settle cleanly.
--   3. Add missing B-tree, functional `(lower(...))`, partial, and GIN trigram
--      indexes across hot tables (`users`, `addsactive`, `adds`, `news`,
--      `newsactive`, `ad_impressions`, `notifications`, `read_announcements`,
--      `payments`, `referrals`, `deactivated_users`, `completed_ads`,
--      `completed_ads_ratings`, `blocked_advertisers`, `help_tickets`) for
--      500M+ daily user scale.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. 64-Shard Lock-Free Agent Commission Overflow Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_commission_shards (
    agent_email TEXT NOT NULL,
    shard_id SMALLINT NOT NULL CHECK (shard_id >= 0 AND shard_id < 64),
    pending_amount NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (agent_email, shard_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_commission_shards_pending
    ON public.agent_commission_shards (agent_email)
    WHERE pending_amount > 0;

ALTER TABLE public.agent_commission_shards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_commission_shards FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.agent_commission_shards TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Lock-Free / Targeted Agent Commission Shard Flush RPC
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.flush_agent_commission_shards_atomic(text, int) CASCADE;
DROP FUNCTION IF EXISTS public.flush_agent_commission_shards_atomic(text) CASCADE;
DROP FUNCTION IF EXISTS public.flush_agent_commission_shards_atomic() CASCADE;

CREATE OR REPLACE FUNCTION public.flush_agent_commission_shards_atomic(
    p_target_email TEXT DEFAULT NULL,
    p_limit INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target TEXT := lower(trim(COALESCE(p_target_email, '')));
    v_agent RECORD;
    v_drained NUMERIC(14,2);
    v_flushed_count INT := 0;
    v_total_credited NUMERIC(14,2) := 0.00;
    v_max_rows INT := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
    v_lock_acquired BOOLEAN;
BEGIN
    IF v_target <> '' THEN
        PERFORM pg_advisory_xact_lock(hashtext('agent_yield_' || v_target));

        WITH drained AS (
            UPDATE public.agent_commission_shards
            SET pending_amount = 0,
                updated_at = timezone('utc'::text, now())
            WHERE agent_email = v_target
              AND pending_amount > 0
            RETURNING pending_amount
        )
        SELECT ROUND(COALESCE(SUM(pending_amount), 0), 2)
        INTO v_drained
        FROM drained;

        IF COALESCE(v_drained, 0) > 0 THEN
            UPDATE public.users
            SET balance = ROUND(COALESCE(balance, 0) + v_drained, 2),
                agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + v_drained, 2)
            WHERE id = (
                SELECT id FROM public.users WHERE lower(email) = v_target ORDER BY created_at ASC LIMIT 1
            );
            v_flushed_count := 1;
            v_total_credited := v_drained;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'flushed', v_flushed_count,
            'credited', v_total_credited
        );
    END IF;

    FOR v_agent IN
        SELECT DISTINCT agent_email
        FROM public.agent_commission_shards
        WHERE pending_amount > 0
        LIMIT v_max_rows
    LOOP
        v_lock_acquired := pg_try_advisory_xact_lock(hashtext('agent_yield_' || v_agent.agent_email));
        IF v_lock_acquired THEN
            WITH drained AS (
                UPDATE public.agent_commission_shards
                SET pending_amount = 0,
                    updated_at = timezone('utc'::text, now())
                WHERE agent_email = v_agent.agent_email
                  AND pending_amount > 0
                RETURNING pending_amount
            )
            SELECT ROUND(COALESCE(SUM(pending_amount), 0), 2)
            INTO v_drained
            FROM drained;

            IF COALESCE(v_drained, 0) > 0 THEN
                UPDATE public.users
                SET balance = ROUND(COALESCE(balance, 0) + v_drained, 2),
                    agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + v_drained, 2)
                WHERE id = (
                    SELECT id FROM public.users WHERE lower(email) = v_agent.agent_email ORDER BY created_at ASC LIMIT 1
                );
                v_flushed_count := v_flushed_count + 1;
                v_total_credited := ROUND(v_total_credited + v_drained, 2);
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'flushed', v_flushed_count,
        'credited', v_total_credited
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Sharded, Non-Contending `apply_agent_commission_atomic`
--    Locks ONLY the earner row (`v_earner_email`), never blocking on hot
--    mega-agent rows (`v_agent_email`). Contended mega-agent credits overflow
--    lock-free into `agent_commission_shards` across 64 shards.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_agent_commission_atomic(
    p_earner_email TEXT,
    p_gross_amount NUMERIC,
    p_ad_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_earner_email TEXT := lower(trim(COALESCE(p_earner_email, '')));
    v_earner_id UUID;
    v_ref_row RECORD;
    v_agent_email TEXT;
    v_agent_id UUID;
    v_earner_is_agent BOOLEAN := FALSE;
    v_earner_monetized BOOLEAN := FALSE;
    v_rate NUMERIC(5,4);
    v_deducted NUMERIC(12,2);
    v_net_earner NUMERIC(12,2);
    v_earner_new_bal NUMERIC(12,2);
    v_agent_new_bal NUMERIC(12,2) := NULL;
    v_drained NUMERIC(14,2) := 0.00;
    v_shard SMALLINT;
    v_sharded BOOLEAN := FALSE;
BEGIN
    IF v_earner_email = '' OR p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    IF EXISTS (SELECT 1 FROM public.deactivated_users WHERE email = v_earner_email) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'EARNER_DEACTIVATED');
    END IF;

    SELECT id, lower(trim(referrer_email)) AS referrer_email, status, opt_out_status
    INTO v_ref_row
    FROM public.referrals
    WHERE lower(referee_email) = v_earner_email
    LIMIT 1;

    IF NOT FOUND
       OR v_ref_row.status = 'opted_out'
       OR v_ref_row.opt_out_status IN ('accepted', 'forced') THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_agent_email := v_ref_row.referrer_email;
    IF v_agent_email IS NULL OR v_agent_email = '' OR v_agent_email = v_earner_email THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    IF EXISTS (SELECT 1 FROM public.deactivated_users WHERE email = v_agent_email) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'REFERRER_DEACTIVATED');
    END IF;

    -- Lock ONLY the earner row (single-user sequential pacing)
    SELECT
        id,
        COALESCE(is_agent, FALSE),
        (
            COALESCE(has_cancelled_monetization, FALSE) = FALSE
            AND (
                COALESCE(monetized::text, 'false') IN ('true', 'yes', '1', 't')
                OR COALESCE(monetization_clicks, 0) >= 500
                OR COALESCE(referral_downloads_count, 0) >= 12
                OR COALESCE(is_affiliate, FALSE) = TRUE
                OR COALESCE(is_career, FALSE) = TRUE
                OR lower(trim(email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
            )
        )
    INTO v_earner_id, v_earner_is_agent, v_earner_monetized
    FROM public.users
    WHERE lower(email) = v_earner_email
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR NOT COALESCE(v_earner_monetized, FALSE) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'EARNER_NOT_MONETIZED');
    END IF;

    -- Non-locking existence check on agent row (prevents hot-row contention)
    SELECT id
    INTO v_agent_id
    FROM public.users
    WHERE lower(email) = v_agent_email
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_agent_id IS NULL THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'REFERRER_NOT_FOUND');
    END IF;

    v_rate := CASE WHEN v_earner_is_agent THEN 0.0200 ELSE 0.0100 END;
    v_deducted := ROUND(p_gross_amount * v_rate, 2);

    IF v_deducted <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_net_earner := ROUND(p_gross_amount - v_deducted, 2);

    UPDATE public.users
    SET balance = GREATEST(0, ROUND(COALESCE(balance, 0) - v_deducted, 2))
    WHERE id = v_earner_id
    RETURNING balance INTO v_earner_new_bal;

    -- Zero-wait credit: direct write if uncontended, 64-shard accumulation under viral load
    IF pg_try_advisory_xact_lock(hashtext('agent_yield_' || v_agent_email)) THEN
        WITH drained AS (
            UPDATE public.agent_commission_shards
            SET pending_amount = 0,
                updated_at = timezone('utc'::text, now())
            WHERE agent_email = v_agent_email
              AND pending_amount > 0
            RETURNING pending_amount
        )
        SELECT ROUND(COALESCE(SUM(pending_amount), 0), 2)
        INTO v_drained
        FROM drained;

        UPDATE public.users
        SET balance = ROUND(COALESCE(balance, 0) + v_deducted + COALESCE(v_drained, 0), 2),
            agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + v_deducted + COALESCE(v_drained, 0), 2)
        WHERE id = v_agent_id
        RETURNING balance INTO v_agent_new_bal;
    ELSE
        v_sharded := TRUE;
        v_shard := (abs(hashtext(v_earner_email)) % 64)::SMALLINT;
        INSERT INTO public.agent_commission_shards (agent_email, shard_id, pending_amount, updated_at)
        VALUES (v_agent_email, v_shard, v_deducted, timezone('utc'::text, now()))
        ON CONFLICT (agent_email, shard_id)
        DO UPDATE SET
            pending_amount = ROUND(public.agent_commission_shards.pending_amount + EXCLUDED.pending_amount, 2),
            updated_at = timezone('utc'::text, now());
    END IF;

    UPDATE public.referrals
    SET total_commission_earned = ROUND(COALESCE(total_commission_earned, 0) + v_deducted, 2),
        commission_rate = v_rate
    WHERE id = v_ref_row.id;

    IF to_regclass('public.agent_commission_logs') IS NOT NULL THEN
        INSERT INTO public.agent_commission_logs (
            agent_email,
            referee_email,
            source_type,
            ad_id,
            gross_earning,
            deducted_commission,
            net_referee_earning,
            commission_rate
        ) VALUES (
            v_agent_email,
            v_earner_email,
            'ad_earn',
            p_ad_id,
            p_gross_amount,
            v_deducted,
            v_net_earner,
            v_rate
        );
    END IF;

    RETURN jsonb_build_object(
        'applied', true,
        'deducted', v_deducted,
        'net_earner_amount', v_net_earner,
        'earner_new_balance', v_earner_new_bal,
        'agent1_email', v_agent_email,
        'agent1_credit', v_deducted,
        'agent1_new_balance', v_agent_new_bal,
        'sharded', v_sharded,
        'rate', v_rate
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Update `run_database_cleanup_cron()` to drain yield + commission shards
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_database_cleanup_cron()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired_ads INT := 0;
    v_expired_news INT := 0;
    v_expired_active_news INT := 0;
    v_completed_ads INT := 0;
    v_tickets INT := 0;
    v_cooldowns INT := 0;
    v_inactive_resets INT := 0;
    v_dormant_res JSONB;
    v_aff_flush JSONB;
    v_agent_flush JSONB;
BEGIN
    DELETE FROM public.adds
    WHERE (status = 'approved_pending_publish' OR admin_statement LIKE 'APPROVED:%')
      AND (
          (approved_at IS NOT NULL AND approved_at < NOW() - INTERVAL '3 days')
          OR (created_at < NOW() - INTERVAL '3 days' AND admin_statement LIKE 'APPROVED:%')
      );
    GET DIAGNOSTICS v_expired_ads = ROW_COUNT;

    DELETE FROM public.news
    WHERE (status = 'approved_pending_publish' OR admin_statement LIKE 'APPROVED:%')
      AND (
          (approved_at IS NOT NULL AND approved_at < NOW() - INTERVAL '3 days')
          OR (created_at < NOW() - INTERVAL '3 days' AND admin_statement LIKE 'APPROVED:%')
      );
    GET DIAGNOSTICS v_expired_news = ROW_COUNT;

    v_expired_active_news := public.delete_expired_news();

    DELETE FROM public.addsactive
    WHERE completed_at IS NOT NULL
      AND completed_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS v_completed_ads = ROW_COUNT;

    DELETE FROM public.help_tickets
    WHERE resolved_at IS NOT NULL
      AND resolved_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS v_tickets = ROW_COUNT;

    UPDATE public.users
    SET suspended_until = NULL
    WHERE suspended_until IS NOT NULL AND suspended_until < NOW();
    GET DIAGNOSTICS v_cooldowns = ROW_COUNT;

    WITH stale_clicks AS (
        SELECT id
        FROM public.users
        WHERE monetization_clicks > 0
          AND monetization_clicks < 500
          AND COALESCE(monetized::text, 'false') NOT IN ('true', 'yes', '1', 't')
          AND COALESCE(is_affiliate, FALSE) = FALSE
          AND COALESCE(is_career, FALSE) = FALSE
          AND last_active_at IS NOT NULL
          AND last_active_at < NOW() - INTERVAL '7 days'
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.users u
    SET monetization_clicks = 0
    FROM stale_clicks sc
    WHERE u.id = sc.id;
    GET DIAGNOSTICS v_inactive_resets = ROW_COUNT;

    v_dormant_res := public.forfeit_dormant_user_balances_60_days();
    v_aff_flush := public.flush_affiliate_yield_shards_atomic(NULL);
    v_agent_flush := public.flush_agent_commission_shards_atomic(NULL, 500);

    RETURN jsonb_build_object(
        'success', true,
        'expired_approved_ads_purged', v_expired_ads,
        'expired_approved_news_purged', v_expired_news,
        'expired_active_news_purged', v_expired_active_news,
        'completed_ads_purged', v_completed_ads,
        'resolved_tickets_purged', v_tickets,
        'cooldowns_cleared', v_cooldowns,
        'inactive_7d_clicks_reset', v_inactive_resets,
        'dormant_60d_forfeiture', v_dormant_res,
        'affiliate_shards_flushed', v_aff_flush,
        'agent_shards_flushed', v_agent_flush,
        'executed_at', NOW()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. 500M-Scale B-tree, Functional, Partial & Trigram Indexes
-- ----------------------------------------------------------------------------

-- Critical: RPCs filter `WHERE lower(email) = ...` (no trim), which cannot use `(lower(trim(email)))`
CREATE INDEX IF NOT EXISTS idx_users_lower_email_raw
    ON public.users (lower(email));

CREATE INDEX IF NOT EXISTS idx_users_email_exact
    ON public.users (email);

CREATE INDEX IF NOT EXISTS idx_deactivated_users_lower_email
    ON public.deactivated_users (lower(email));

CREATE INDEX IF NOT EXISTS idx_deactivated_users_email_trgm
    ON public.deactivated_users USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_referrals_lower_referee
    ON public.referrals (lower(referee_email));

CREATE INDEX IF NOT EXISTS idx_referrals_lower_referrer_created
    ON public.referrals (lower(referrer_email), created_at DESC, referee_email DESC);

-- Feed candidate pool (`country.ilike.%...%` + bid_price ordering)
CREATE INDEX IF NOT EXISTS idx_addsactive_country_trgm
    ON public.addsactive USING gin (country gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_addsactive_bid_feed_active
    ON public.addsactive (bid_price DESC, cost_per_impression DESC, created_at DESC)
    WHERE completed_at IS NULL AND COALESCE(is_paused, FALSE) = FALSE;

CREATE INDEX IF NOT EXISTS idx_addsactive_user_email_trgm
    ON public.addsactive USING gin (user_email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_adds_lower_user_email
    ON public.adds (lower(user_email));

CREATE INDEX IF NOT EXISTS idx_adds_user_email_trgm
    ON public.adds USING gin (user_email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_news_lower_user_email
    ON public.news (lower(user_email));

CREATE INDEX IF NOT EXISTS idx_news_user_email_trgm
    ON public.news USING gin (user_email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_newsactive_lower_user_email
    ON public.newsactive (lower(user_email));

CREATE INDEX IF NOT EXISTS idx_newsactive_user_email_trgm
    ON public.newsactive USING gin (user_email gin_trgm_ops);

-- Feed fallback impression backfill (`ORDER BY last_viewed_at DESC LIMIT 1000`)
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_last_viewed_desc
    ON public.ad_impressions (user_email, last_viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_lower_user_last_viewed_desc
    ON public.ad_impressions (lower(user_email), last_viewed_at DESC);

-- Notifications exact B-tree lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_email_created_desc
    ON public.notifications (user_email, created_at DESC, id DESC);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_user_status_type_created_desc
    ON public.payments (user_email, status, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_lower_user_status_type_created_desc
    ON public.payments (lower(user_email), status, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_user_email_trgm
    ON public.payments USING gin (user_email gin_trgm_ops);

-- Guarded indexes on auxiliary/conditional tables & columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'adds'
          AND column_name = 'completed_at'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_adds_lower_user_active ON public.adds (lower(user_email)) WHERE completed_at IS NULL';
    END IF;

    IF to_regclass('public.read_announcements') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_read_announcements_user_email_ann ON public.read_announcements (user_email, announcement_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_read_announcements_lower_user_email_ann ON public.read_announcements (lower(user_email), announcement_id)';
    END IF;

    IF to_regclass('public.help_tickets') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_help_tickets_lower_user_created ON public.help_tickets (lower(user_email), created_at DESC)';
    END IF;

    IF to_regclass('public.completed_ads') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_completed_ads_lower_user_completed_desc ON public.completed_ads (lower(user_email), completed_at DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_completed_ads_user_email_trgm ON public.completed_ads USING gin (user_email gin_trgm_ops)';
    END IF;

    IF to_regclass('public.completed_ads_ratings') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_completed_ads_ratings_adv_lower ON public.completed_ads_ratings (lower(advertiser_email))';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_completed_ads_ratings_adv_trgm ON public.completed_ads_ratings USING gin (advertiser_email gin_trgm_ops)';
    END IF;

    IF to_regclass('public.blocked_advertisers') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blocked_advertisers_adv_lower ON public.blocked_advertisers (lower(advertiser_email))';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blocked_advertisers_adv_trgm ON public.blocked_advertisers USING gin (advertiser_email gin_trgm_ops)';
    END IF;

    IF to_regclass('public.agent_commission_logs') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_commission_logs_agent_created_desc ON public.agent_commission_logs (lower(agent_email), created_at DESC)';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Strict Security Lockdown on Touched RPCs & Schema Cache Reload
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.flush_agent_commission_shards_atomic(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flush_agent_commission_shards_atomic(TEXT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.run_database_cleanup_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_database_cleanup_cron() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
