-- ==============================================================================
-- MIGRATION: 20261119150000_500m_free_tier_20pct_affiliate_and_blocking.sql
-- Purpose:
--   1. Implement 20% Shared Affiliate Pool (20% / N active affiliates, keeping
--      the company's 30% platform share completely untouched: 50% earner +
--      20% shared affiliates + 30% company = 100%) backed by a tiny O(1)
--      `public.platform_affiliates` roster table + sync trigger (zero scan on
--      500M-row `public.users`).
--   2. Enforce admin temporary (`temp_blocked` + `suspended_until`) and
--      permanent (`perm_banned`) account blocks cleanly inside DB helpers.
--   3. Normalize email columns to trimmed lowercase via lightweight trigger
--      and drop bloated `gin_trgm_ops` email indexes to reclaim free-tier
--      Postgres storage and write IOPS.
--   4. Add batched orphan referral cleanup + lock down cron RPC EXECUTE
--      permissions strictly to `service_role`.
--
-- Idempotent: Safe to run multiple times.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ------------------------------------------------------------------------------
-- 1. O(1) Platform Affiliates Roster Table & Automatic Sync Trigger (C-06)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_affiliates (
    email TEXT PRIMARY KEY,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    affiliate_role TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_affiliates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_affiliates_service_role_all ON public.platform_affiliates;
CREATE POLICY platform_affiliates_service_role_all
    ON public.platform_affiliates
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.platform_affiliates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_affiliates TO service_role;

-- Partial B-tree index so any direct users.is_affiliate lookup is instant
CREATE INDEX IF NOT EXISTS idx_users_is_affiliate_true
    ON public.users (LOWER(email))
    WHERE is_affiliate = TRUE;

-- Backfill roster with preconfigured + DB-flagged active affiliates
INSERT INTO public.platform_affiliates (email, is_active, affiliate_role, updated_at)
VALUES
    ('nonsom019@gmail.com', TRUE, 'Co-Founder & Lead Affiliate', NOW()),
    ('nonsom2023@gmail.com', TRUE, 'Affiliate Partner', NOW())
ON CONFLICT (email) DO UPDATE
SET is_active = TRUE, updated_at = NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_affiliate'
    ) THEN
        INSERT INTO public.platform_affiliates (email, is_active, affiliate_role, updated_at)
        SELECT
            LOWER(TRIM(email)),
            (COALESCE(ad_account_status, 'active') NOT IN ('deactivated', 'perm_banned', 'banned')),
            affiliate_role,
            NOW()
        FROM public.users
        WHERE is_affiliate = TRUE AND email IS NOT NULL AND TRIM(email) <> ''
        ON CONFLICT (email) DO UPDATE
        SET is_active = EXCLUDED.is_active,
            affiliate_role = COALESCE(EXCLUDED.affiliate_role, public.platform_affiliates.affiliate_role),
            updated_at = NOW();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_platform_affiliates_from_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_active BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_email := LOWER(TRIM(COALESCE(OLD.email, '')));
        IF v_email <> '' THEN
            DELETE FROM public.platform_affiliates WHERE email = v_email;
        END IF;
        RETURN OLD;
    END IF;

    v_email := LOWER(TRIM(COALESCE(NEW.email, '')));
    IF v_email = '' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.is_affiliate, FALSE) = TRUE THEN
        v_active := COALESCE(NEW.ad_account_status, 'active') NOT IN ('deactivated', 'perm_banned', 'banned');
        INSERT INTO public.platform_affiliates (email, is_active, affiliate_role, updated_at)
        VALUES (v_email, v_active, NEW.affiliate_role, NOW())
        ON CONFLICT (email) DO UPDATE
        SET is_active = EXCLUDED.is_active,
            affiliate_role = COALESCE(EXCLUDED.affiliate_role, public.platform_affiliates.affiliate_role),
            updated_at = NOW();
    ELSE
        DELETE FROM public.platform_affiliates WHERE email = v_email;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_affiliate'
    ) THEN
        DROP TRIGGER IF EXISTS trg_sync_platform_affiliates ON public.users;
        CREATE TRIGGER trg_sync_platform_affiliates
            AFTER INSERT OR UPDATE OF is_affiliate, ad_account_status, affiliate_role OR DELETE
            ON public.users
            FOR EACH ROW
            EXECUTE FUNCTION public.sync_platform_affiliates_from_users();
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. 20% Shared Affiliate Pool RPC (20% / N Active Affiliates; 0 Scan on users)
--    Examples:
--      2 affiliates -> 10.00% each (20% total)
--      3 affiliates ->  6.67% each (20% total)
--      4 affiliates ->  5.00% each (20% total)
--    Company's 30% platform share remains 100% untouched.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_affiliate_platform_share_atomic(
    p_raw_cpi NUMERIC,
    p_ad_id TEXT DEFAULT NULL,
    p_earner_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cpi NUMERIC(15,4);
    v_aff_emails TEXT[];
    v_aff_count INT;
    v_per_aff_cut NUMERIC(15,2);
    v_email TEXT;
    v_lock_key BIGINT;
    v_shard_id INT;
    v_credited_count INT := 0;
    v_sharded_count INT := 0;
BEGIN
    v_cpi := COALESCE(p_raw_cpi, 0);
    IF v_cpi <= 0 THEN
        RETURN jsonb_build_object('success', true, 'credited', 0, 'per_affiliate_cut', 0);
    END IF;

    -- Read ONLY tiny O(1) platform_affiliates roster (never scans public.users)
    SELECT ARRAY_AGG(pa.email ORDER BY pa.email)
    INTO v_aff_emails
    FROM public.platform_affiliates pa
    WHERE pa.is_active = TRUE
      AND NOT EXISTS (
          SELECT 1 FROM public.deactivated_users du
          WHERE LOWER(du.email) = pa.email
      );

    v_aff_count := COALESCE(array_length(v_aff_emails, 1), 0);
    IF v_aff_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'credited', 0, 'affiliate_count', 0, 'per_affiliate_cut', 0);
    END IF;

    -- Divide the fixed 20% affiliate pool evenly across all N active affiliates
    v_per_aff_cut := ROUND((v_cpi * 0.20) / v_aff_count, 2);
    IF v_per_aff_cut <= 0 THEN
        RETURN jsonb_build_object('success', true, 'credited', 0, 'affiliate_count', v_aff_count, 'per_affiliate_cut', 0);
    END IF;

    FOREACH v_email IN ARRAY v_aff_emails LOOP
        v_lock_key := hashtext('aff_bal:' || v_email)::BIGINT;
        IF pg_try_advisory_xact_lock(v_lock_key) THEN
            UPDATE public.users
            SET balance = ROUND(COALESCE(balance, 0) + v_per_aff_cut, 2),
                affiliate_earned_total = ROUND(COALESCE(affiliate_earned_total, 0) + v_per_aff_cut, 2),
                monetized = 'true'
            WHERE LOWER(email) = v_email;
            IF FOUND THEN
                v_credited_count := v_credited_count + 1;
            END IF;
        ELSE
            -- Lock-free 64-shard overflow bucket under extreme 500M+ concurrent spikes
            IF to_regclass('public.affiliate_yield_shards') IS NOT NULL THEN
                v_shard_id := (ABS(hashtext(COALESCE(p_earner_email, '') || ':' || COALESCE(p_ad_id, '') || ':' || clock_timestamp()::TEXT)) % 64);
                INSERT INTO public.affiliate_yield_shards (affiliate_email, shard_id, pending_amount, updated_at)
                VALUES (v_email, v_shard_id, v_per_aff_cut, NOW())
                ON CONFLICT (affiliate_email, shard_id)
                DO UPDATE SET
                    pending_amount = ROUND(public.affiliate_yield_shards.pending_amount + EXCLUDED.pending_amount, 2),
                    updated_at = NOW();
                v_sharded_count := v_sharded_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'affiliate_count', v_aff_count,
        'total_pool_share_pct', 20,
        'per_affiliate_cut', v_per_aff_cut,
        'credited_direct', v_credited_count,
        'credited_sharded', v_sharded_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_affiliate_platform_share_atomic(NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_affiliate_platform_share_atomic(NUMERIC, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Lowercase Email Normalization Trigger + Exact B-Tree Indexes
--    + Drop Bloated GIN Email Trigram Indexes (C-12, M-05)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_email_columns_lower()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME IN ('users', 'deactivated_users', 'newsletter_subscribers') THEN
        IF NEW.email IS NOT NULL THEN
            NEW.email := LOWER(TRIM(NEW.email));
        END IF;
    END IF;
    IF TG_TABLE_NAME IN ('ad_impressions', 'notifications', 'payments', 'adds', 'addsactive', 'news', 'newsactive', 'premium_subscribers') THEN
        IF NEW.user_email IS NOT NULL THEN
            NEW.user_email := LOWER(TRIM(NEW.user_email));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users',
        'deactivated_users',
        'ad_impressions',
        'notifications',
        'payments',
        'adds',
        'addsactive',
        'news',
        'newsactive'
    ] LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_normalize_email_lower ON public.%I', tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_normalize_email_lower BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.normalize_email_columns_lower()',
                tbl
            );
        END IF;
    END LOOP;
END $$;

-- Drop oversized pg_trgm GIN indexes on exact-match email columns (reclaims free-tier disk & write IOPS)
DROP INDEX IF EXISTS public.idx_users_email_trgm;
DROP INDEX IF EXISTS public.idx_adds_user_email_trgm;
DROP INDEX IF EXISTS public.idx_addsactive_user_email_trgm;
DROP INDEX IF EXISTS public.idx_completed_ads_user_email_trgm;
DROP INDEX IF EXISTS public.idx_news_user_email_trgm;
DROP INDEX IF EXISTS public.idx_newsactive_user_email_trgm;
DROP INDEX IF EXISTS public.idx_payments_user_email_trgm;
DROP INDEX IF EXISTS public.idx_notifications_user_email_trgm;
DROP INDEX IF EXISTS public.idx_ad_impressions_user_email_trgm;
DROP INDEX IF EXISTS public.idx_referrals_referrer_email_trgm;
DROP INDEX IF EXISTS public.idx_referrals_referee_email_trgm;

-- Fast exact-match B-tree indexes aligned with lowercase email queries
CREATE INDEX IF NOT EXISTS idx_users_email_lower_btree ON public.users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_notifications_user_email_created_btree ON public.notifications (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_email_created_btree ON public.payments (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_ad_btree ON public.ad_impressions (user_email, ad_id);
CREATE INDEX IF NOT EXISTS idx_users_ad_account_status_blocked
    ON public.users (ad_account_status, suspended_until)
    WHERE ad_account_status IN ('temp_blocked', 'perm_banned', 'banned', 'suspended');

-- ------------------------------------------------------------------------------
-- 4. Batched Orphan Referral Cleanup Helper + Security Lockdown (H-03, C-21)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_referrals_batch(p_batch_size INT DEFAULT 5000)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INT := 0;
BEGIN
    WITH target_rows AS (
        SELECT u.id
        FROM public.users u
        INNER JOIN public.deactivated_users du
            ON LOWER(du.email) = LOWER(u.referred_by)
        WHERE u.referred_by IS NOT NULL
        LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 5000), 10000))
    )
    UPDATE public.users u
    SET referred_by = NULL
    FROM target_rows t
    WHERE u.id = t.id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphaned_referrals_batch(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_referrals_batch(INT) TO service_role;

-- Ensure sensitive cron/reconciliation RPCs can NEVER be invoked by anon or authenticated clients
DO $$
DECLARE
    fn_rec RECORD;
BEGIN
    FOR fn_rec IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'run_ledger_reconciliation_cron',
              'forfeit_dormant_user_balances_60_days',
              'flush_affiliate_yield_shards_atomic',
              'deactivate_user_atomic',
              'increment_user_balance_atomic',
              'deduct_wallet_atomic',
              'refund_wallet_atomic'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn_rec.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_rec.sig);
    END LOOP;
END $$;

COMMIT;
