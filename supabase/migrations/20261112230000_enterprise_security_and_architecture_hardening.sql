-- ==============================================================================
-- MIGRATION: 20261112230000_enterprise_security_and_architecture_hardening.sql
-- Consolidates Security Lockdown, Unified ATW + Rating Progression, Wallet
-- Atomicity, Single-Tier Referral/Affiliate Enforcement, Ad Lifecycle &
-- Deactivation Hygiene, Dormancy Sweeps, Windowed Reconciliation, and
-- 500M+ Scale Composite/Partial Indexing.
--
-- Idempotent: Safe to execute repeatedly.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ==============================================================================
-- SECTION 1: SCHEMA EXTENSIONS & SUPPORT TABLES (IDEMPOTENT)
-- ==============================================================================

-- 1.1 DB-Backed Wallet PIN Lockout Columns on public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_pin_failed_attempts INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_pin_locked_until TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS attention_worth_score NUMERIC(12,4) DEFAULT 0.1000;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS atw_tier VARCHAR(16) DEFAULT 'ATW1';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_account_status TEXT DEFAULT 'active';

-- 1.2 Atomic Wallet Operation Idempotency Log (deduct / refund)
CREATE TABLE IF NOT EXISTS public.wallet_atomic_ops (
    id BIGSERIAL PRIMARY KEY,
    op_reference TEXT NOT NULL,
    op_type TEXT NOT NULL CHECK (op_type IN ('deduct', 'refund')),
    user_email TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_wallet_atomic_ops_ref_type UNIQUE (op_reference, op_type)
);

-- 1.3 Incremental Ledger Reconciliation Checkpoint Table (avoids full-table SUM)
CREATE TABLE IF NOT EXISTS public.ledger_reconciliation_checkpoints (
    id INT PRIMARY KEY DEFAULT 1,
    last_reconciled_at TIMESTAMPTZ,
    cumulative_sent NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    cumulative_received NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- SECTION 2: ENTERPRISE RLS & PRIVILEGE LOCKDOWN
-- ==============================================================================

-- 2.1 REVOKE Direct Client UPDATE / INSERT / DELETE on public.users
-- All profile updates MUST pass server-side RPC/API validation, cooldown,
-- encryption, and 18+ age verification.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- 2.2 Lock down sensitive internal / financial / admin / sharded tables
DO $$
DECLARE
    v_tbl TEXT;
    v_pol RECORD;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'pending_admin_requests',
        'ad_impression_shards',
        'forfeited_balances',
        'platform_treasury',
        'completed_ads_ratings',
        'admin_audit_logs',
        'ledger_entries',
        'system_reconciliation_logs',
        'agent_commission_logs',
        'affiliate_yield_shards',
        'deactivated_users',
        'wallet_atomic_ops',
        'ledger_reconciliation_checkpoints',
        'bidded_ads',
        'bidded_highlights',
        'completed_ads',
        'addscompleted',
        'adds',
        'news'
    ] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);

            -- Drop any overly permissive policies from legacy migrations
            FOR v_pol IN
                SELECT policyname
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = v_tbl
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_tbl);
            END LOOP;

            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_tbl);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_tbl);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                'service_role_only_' || v_tbl,
                v_tbl
            );
        END IF;
    END LOOP;
END $$;

-- Ensure sequences used by internal tables are service_role only
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ==============================================================================
-- SECTION 3: CANONICAL UNIFIED ATW ENGINE (CLICKS + RATING SCORE)
-- ==============================================================================
-- Tiers: ATW1..ATW14 (N30,000 per tier, max N420,000 at ATW14)
-- Rating score increments: 1*=0.01, 2*=0.02, 3*=0.03, 4*=0.04, 5*=0.05
-- Rating score contribution: each +1.00 above baseline 0.1000 adds +300
-- effective clicks (+1 ATW level), so rating boosts genuinely increase ATW.

CREATE OR REPLACE FUNCTION public.compute_atw_level(
    p_clicks INT,
    p_score NUMERIC,
    p_current_tier TEXT DEFAULT 'ATW1'
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_safe_clicks INT := GREATEST(0, COALESCE(p_clicks, 0));
    v_safe_score NUMERIC(12,4) := GREATEST(0.0000, LEAST(1000000.0000, COALESCE(p_score, 0.1000)));
    v_rating_bonus_clicks INT;
    v_effective_clicks INT;
    v_computed_level INT;
    v_parsed_tier INT := 1;
BEGIN
    IF p_current_tier IS NOT NULL AND p_current_tier ~* '^ATW[0-9]+$' THEN
        v_parsed_tier := GREATEST(1, LEAST(14, substring(upper(trim(p_current_tier)) from '[0-9]+')::INT));
    END IF;

    v_rating_bonus_clicks := FLOOR(GREATEST(0::NUMERIC, v_safe_score - 0.1000) * 300)::INT;
    v_effective_clicks := v_safe_clicks + v_rating_bonus_clicks;

    IF v_effective_clicks >= 300 THEN
        v_computed_level := FLOOR(v_effective_clicks / 300.0)::INT;
    ELSE
        v_computed_level := 1;
    END IF;

    RETURN GREATEST(1, LEAST(14, GREATEST(v_parsed_tier, v_computed_level)));
END;
$$;

-- ==============================================================================
-- SECTION 4: WALLET & EARN ATOMICITY RPCS
-- ==============================================================================

-- 4.1 Hardened Single-Tier Referral / Agent Commission (1% Follower, 2% Agent)
-- Direct referrer ONLY, zero downline payouts, skips deactivated/unmonetized.
DROP FUNCTION IF EXISTS public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) CASCADE;
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
    v_ref_row RECORD;
    v_agent_email TEXT;
    v_earner_is_agent BOOLEAN := FALSE;
    v_earner_monetized BOOLEAN := FALSE;
    v_rate NUMERIC(5,4) := 0.0100;
    v_deducted NUMERIC(12,2) := 0.00;
    v_net_earner NUMERIC(12,2) := 0.00;
    v_earner_new_bal NUMERIC(12,2);
    v_agent_new_bal NUMERIC(12,2);
BEGIN
    IF v_earner_email = '' OR p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    IF EXISTS (SELECT 1 FROM public.deactivated_users WHERE email = v_earner_email) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'EARNER_DEACTIVATED');
    END IF;

    -- Single-tier direct referrer lookup
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

    -- Do not credit a deactivated direct referrer
    IF EXISTS (SELECT 1 FROM public.deactivated_users WHERE email = v_agent_email) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'REFERRER_DEACTIVATED');
    END IF;

    SELECT
        COALESCE(is_agent, FALSE),
        (
            COALESCE(has_cancelled_monetization, FALSE) = FALSE
            AND (
                COALESCE(monetized::text, 'false') IN ('true', 'yes', '1', 't')
                OR COALESCE(monetization_clicks, 0) >= 300
                OR COALESCE(referral_downloads_count, 0) >= 12
                OR COALESCE(is_affiliate, FALSE) = TRUE
                OR COALESCE(is_career, FALSE) = TRUE
                OR lower(trim(email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
            )
        )
    INTO v_earner_is_agent, v_earner_monetized
    FROM public.users
    WHERE lower(email) = v_earner_email
    LIMIT 1;

    IF NOT COALESCE(v_earner_monetized, FALSE) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'EARNER_NOT_MONETIZED');
    END IF;

    -- Single-tier commission: 1% regular follower, 2% verified Agent
    v_rate := CASE WHEN v_earner_is_agent THEN 0.0200 ELSE 0.0100 END;
    v_deducted := ROUND(p_gross_amount * v_rate, 2);

    IF v_deducted <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_net_earner := ROUND(p_gross_amount - v_deducted, 2);

    -- Lock in deterministic email order to prevent deadlocks
    IF v_earner_email < v_agent_email THEN
        PERFORM 1 FROM public.users WHERE lower(email) = v_earner_email FOR UPDATE;
        PERFORM 1 FROM public.users WHERE lower(email) = v_agent_email FOR UPDATE;
    ELSE
        PERFORM 1 FROM public.users WHERE lower(email) = v_agent_email FOR UPDATE;
        PERFORM 1 FROM public.users WHERE lower(email) = v_earner_email FOR UPDATE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE lower(email) = v_agent_email) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'REFERRER_NOT_FOUND');
    END IF;

    UPDATE public.users
    SET balance = GREATEST(0, ROUND(COALESCE(balance, 0) - v_deducted, 2))
    WHERE lower(email) = v_earner_email
    RETURNING balance INTO v_earner_new_bal;

    UPDATE public.users
    SET balance = ROUND(COALESCE(balance, 0) + v_deducted, 2),
        agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + v_deducted, 2)
    WHERE lower(email) = v_agent_email
    RETURNING balance INTO v_agent_new_bal;

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
        'rate', v_rate
    );
END;
$$;

-- 4.2 Hardened Affiliate Platform Share + Single-Tier Referrer Check
-- Skips when CPI <= 0 or earner is deactivated/unmonetized, and never pays downlines.
DROP FUNCTION IF EXISTS public.credit_affiliate_platform_share_atomic(NUMERIC, UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.credit_affiliate_platform_share_atomic(
    p_raw_cpi NUMERIC,
    p_ad_id UUID DEFAULT NULL,
    p_earner_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cpi NUMERIC(12,2) := GREATEST(COALESCE(p_raw_cpi, 0.00), 0.00);
    v_aff_cut NUMERIC(12,2);
    v_aff_email TEXT;
    v_drained NUMERIC(14,2) := 0.00;
    v_shard INT;
    v_credited_count INT := 0;
    v_earner TEXT := lower(trim(COALESCE(p_earner_email, '')));
    v_earner_ok BOOLEAN := TRUE;
BEGIN
    v_aff_cut := ROUND(v_cpi * 0.10, 2);
    IF v_aff_cut <= 0 THEN
        RETURN jsonb_build_object('success', true, 'credited', 0, 'skipped', 'ZERO_CPI');
    END IF;

    -- Guard against crediting when earner is deactivated or not monetized
    IF v_earner <> '' THEN
        SELECT (
            NOT EXISTS (SELECT 1 FROM public.deactivated_users du WHERE du.email = v_earner)
            AND EXISTS (
                SELECT 1 FROM public.users u
                WHERE lower(u.email) = v_earner
                  AND COALESCE(u.has_cancelled_monetization, FALSE) = FALSE
                  AND (
                    COALESCE(u.monetized::text, 'false') IN ('true', 'yes', '1', 't')
                    OR COALESCE(u.monetization_clicks, 0) >= 300
                    OR COALESCE(u.referral_downloads_count, 0) >= 12
                    OR COALESCE(u.is_affiliate, FALSE) = TRUE
                    OR COALESCE(u.is_career, FALSE) = TRUE
                    OR lower(trim(u.email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
                  )
            )
        ) INTO v_earner_ok;

        IF NOT COALESCE(v_earner_ok, FALSE) THEN
            RETURN jsonb_build_object('success', true, 'credited', 0, 'skipped', 'EARNER_NOT_ELIGIBLE');
        END IF;
    END IF;

    FOR v_aff_email IN
        SELECT DISTINCT lower(trim(u.email))
        FROM public.users u
        WHERE (u.is_affiliate = TRUE OR lower(trim(u.email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com'))
          AND NOT EXISTS (SELECT 1 FROM public.deactivated_users du WHERE du.email = lower(trim(u.email)))
    LOOP
        IF pg_try_advisory_xact_lock(hashtext('aff_yield_' || v_aff_email)) THEN
            WITH drained AS (
                UPDATE public.affiliate_yield_shards
                SET pending_amount = 0,
                    updated_at = now()
                WHERE affiliate_email = v_aff_email
                  AND pending_amount > 0
                RETURNING pending_amount
            )
            SELECT ROUND(COALESCE(SUM(pending_amount), 0), 2)
            INTO v_drained
            FROM drained;

            UPDATE public.users
            SET balance = ROUND(COALESCE(balance, 0) + v_aff_cut + COALESCE(v_drained, 0), 2),
                affiliate_earned_total = ROUND(COALESCE(affiliate_earned_total, 0) + v_aff_cut + COALESCE(v_drained, 0), 2),
                is_affiliate = TRUE,
                is_career = CASE
                    WHEN v_aff_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com') THEN TRUE
                    ELSE COALESCE(is_career, FALSE)
                END,
                affiliate_role = CASE
                    WHEN v_aff_email = 'nonsom019@gmail.com' THEN COALESCE(NULLIF(trim(affiliate_role), ''), 'Affiliate Developer')
                    WHEN v_aff_email = 'nonsom2023@gmail.com' THEN COALESCE(NULLIF(trim(affiliate_role), ''), 'Affiliate First Agent')
                    ELSE COALESCE(NULLIF(trim(affiliate_role), ''), 'Platform Affiliate')
                END,
                monetized = 'true'
            WHERE lower(trim(email)) = v_aff_email;

            v_credited_count := v_credited_count + 1;
        ELSE
            v_shard := floor(random() * 64)::int;
            INSERT INTO public.affiliate_yield_shards (affiliate_email, shard_id, pending_amount, updated_at)
            VALUES (v_aff_email, v_shard, v_aff_cut, now())
            ON CONFLICT (affiliate_email, shard_id)
            DO UPDATE SET
                pending_amount = public.affiliate_yield_shards.pending_amount + EXCLUDED.pending_amount,
                updated_at = now();
            v_credited_count := v_credited_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'per_affiliate_cut', v_aff_cut,
        'credited_count', v_credited_count
    );
END;
$$;

-- 4.3 Hardened claim_ad_earning_atomic
-- * NEVER falls back to unapproved public.adds
-- * Uses unified compute_atw_level (clicks + attention_worth_score)
-- * Returns ACTUAL net credited amount in 'amount' (0 or capped delta, never uncapped rate)
-- * Skips affiliate crediting if net credit <= 0 or unmonetized
-- * Scales affiliate CPI proportionally if partially capped
DROP FUNCTION IF EXISTS public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT) CASCADE;
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
    v_email_lower        TEXT;
    v_user_id            UUID;
    v_current_bal        NUMERIC(12,2);
    v_current_clicks     INT;
    v_monetized_val      TEXT;
    v_ref_downloads      INT;
    v_suspended_until    TIMESTAMP WITH TIME ZONE;
    v_has_cancelled      BOOLEAN;
    v_is_affiliate       BOOLEAN;
    v_is_career          BOOLEAN;
    v_is_exempt          BOOLEAN;
    v_ad_account_status  TEXT;
    v_attention_score    NUMERIC(12,4);
    v_current_tier       TEXT;
    v_is_monetized       BOOLEAN;
    v_raw_cpi            NUMERIC(12,2);
    v_earn_rate          NUMERIC(12,2);
    v_net_credited       NUMERIC(12,2) := 0.00;
    v_next_bal           NUMERIC(12,2);
    v_next_clicks        INT;
    v_next_level         INT;
    v_next_tier          TEXT;
    v_next_monetized     TEXT;
    v_existing_views     INT;
    v_user_freq_cap      INT;
    v_impressions_target INT;
    v_impressions_count  INT;
    v_ad_completed       BOOLEAN;
    v_ad_paused          BOOLEAN;
    v_sched_start        TIMESTAMPTZ;
    v_sched_end          TIMESTAMPTZ;
    v_holding_cap        NUMERIC(12,2);
    v_is_capped          BOOLEAN := FALSE;
    v_aff_credited       BOOLEAN := FALSE;
    v_effective_cpi      NUMERIC(12,2) := 0.00;
BEGIN
    v_email_lower := lower(trim(COALESCE(p_user_email, '')));

    IF v_email_lower = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_EMAIL',
            'error', 'Valid user email is required.'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM public.deactivated_users WHERE email = v_email_lower) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ACCOUNT_DEACTIVATED',
            'error', 'Account has been permanently deactivated.'
        );
    END IF;

    -- 1. Row Lock on Viewer Profile
    SELECT
        id,
        COALESCE(balance, 0.00),
        COALESCE(monetization_clicks, 0),
        COALESCE(monetized::text, 'false'),
        COALESCE(referral_downloads_count, 0),
        suspended_until,
        COALESCE(has_cancelled_monetization, FALSE),
        COALESCE(is_affiliate, FALSE),
        COALESCE(is_career, FALSE),
        COALESCE(ad_account_status, 'active'),
        COALESCE(attention_worth_score, 0.1000),
        COALESCE(atw_tier, 'ATW1')
    INTO
        v_user_id,
        v_current_bal,
        v_current_clicks,
        v_monetized_val,
        v_ref_downloads,
        v_suspended_until,
        v_has_cancelled,
        v_is_affiliate,
        v_is_career,
        v_ad_account_status,
        v_attention_score,
        v_current_tier
    FROM public.users
    WHERE lower(trim(email)) = v_email_lower
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'USER_NOT_FOUND',
            'error', 'Viewer profile not found.'
        );
    END IF;

    IF v_ad_account_status = 'deactivated' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ACCOUNT_DEACTIVATED',
            'error', 'Account has been deactivated.'
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

    -- 2. Resolve Approved Live Ad ONLY from public.addsactive (NO unapproved fallback)
    SELECT
        cost_per_impression,
        COALESCE(user_frequency_cap, 1),
        COALESCE(impressions, 0),
        COALESCE(impression_count, 0),
        (completed_at IS NOT NULL),
        COALESCE(is_paused, FALSE),
        scheduled_start_at,
        scheduled_end_at
    INTO
        v_raw_cpi,
        v_user_freq_cap,
        v_impressions_target,
        v_impressions_count,
        v_ad_completed,
        v_ad_paused,
        v_sched_start,
        v_sched_end
    FROM public.addsactive
    WHERE id = p_ad_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CAMPAIGN_NOT_FOUND',
            'error', 'Ad campaign is not active or does not exist.'
        );
    END IF;

    IF v_ad_completed
       OR v_ad_paused
       OR (v_sched_start IS NOT NULL AND v_sched_start > now())
       OR (v_sched_end IS NOT NULL AND v_sched_end < now())
       OR (v_impressions_target > 0 AND v_impressions_count >= v_impressions_target) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CAMPAIGN_COMPLETED',
            'error', 'Campaign has finished, is paused, or is outside its active schedule.'
        );
    END IF;

    -- 3. Frequency Cap Check
    SELECT COALESCE(view_count, 0)
    INTO v_existing_views
    FROM public.ad_impressions
    WHERE ad_id = p_ad_id
      AND lower(user_email) = v_email_lower
    FOR UPDATE;

    IF FOUND AND v_existing_views >= v_user_freq_cap THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FREQUENCY_CAP_REACHED',
            'error', 'Frequency cap reached for this campaign.',
            'views', v_existing_views,
            'views_used', v_existing_views,
            'cap', v_user_freq_cap,
            'max_views', v_user_freq_cap
        );
    END IF;

    -- 4. Compute Next Clicks, Unified ATW Level (Clicks + Rating Score), & Cap
    v_next_clicks := v_current_clicks + 1;
    v_next_level := public.compute_atw_level(v_next_clicks, v_attention_score, v_current_tier);
    v_next_tier := CASE WHEN v_is_exempt THEN 'Unlimited' ELSE 'ATW' || v_next_level::TEXT END;
    v_holding_cap := CASE
        WHEN v_is_exempt THEN 999999999.00
        ELSE (v_next_level * 30000.00)::NUMERIC(12,2)
    END;

    -- 5. Dynamic 50% / 60% Earn Rate Calculation & Holding Cap Truncation
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
            v_aff_credited := TRUE;

            IF v_is_affiliate OR v_email_lower IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com') THEN
                SELECT COALESCE(balance, v_next_bal)
                INTO v_next_bal
                FROM public.users
                WHERE id = v_user_id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'EARN_SUCCESS',
        'amount', v_net_credited,
        'net_credited', v_net_credited,
        'raw_earn_rate', v_earn_rate,
        'raw_cpi', v_raw_cpi,
        'balance', v_next_bal,
        'new_balance', v_next_bal,
        'clicks', v_next_clicks,
        'new_clicks', v_next_clicks,
        'atw_tier', v_next_tier,
        'atw_level', v_next_level,
        'attention_worth_score', v_attention_score,
        'views', COALESCE(v_existing_views, 0) + 1,
        'views_used', COALESCE(v_existing_views, 0) + 1,
        'cap', v_user_freq_cap,
        'max_views', v_user_freq_cap,
        'holding_cap', v_holding_cap,
        'is_capped', v_is_capped,
        'capped', v_is_capped,
        'is_monetized', v_is_monetized,
        'monetized', (v_next_monetized = 'true'),
        'device_id', p_device_id,
        'affiliate_credited', v_aff_credited
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DB_ERROR',
            'error', SQLERRM
        );
END;
$$;

-- 4.4 Canonical Atomic Wallet Deduction & Refund RPCs (with optional reference idempotency)
DROP FUNCTION IF EXISTS public.deduct_wallet_atomic(TEXT, NUMERIC, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.deduct_wallet_atomic(
    p_user_email TEXT,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT 'wallet_spend',
    p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(p_user_email, '')));
    v_ref TEXT := NULLIF(trim(COALESCE(p_reference, '')), '');
    v_amount NUMERIC(12,2);
    v_current_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
BEGIN
    IF v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'User email is required');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid deduction amount');
    END IF;

    v_amount := ROUND(p_amount::numeric, 2);

    IF v_ref IS NOT NULL THEN
        INSERT INTO public.wallet_atomic_ops (op_reference, op_type, user_email, amount, reason)
        VALUES (v_ref, 'deduct', v_email, v_amount, p_reason)
        ON CONFLICT (op_reference, op_type) DO NOTHING;

        IF NOT FOUND THEN
            SELECT COALESCE(balance, 0.00) INTO v_current_balance
            FROM public.users
            WHERE lower(email) = v_email;

            RETURN jsonb_build_object(
                'success', true,
                'already_processed', true,
                'previous_balance', COALESCE(v_current_balance, 0.00),
                'new_balance', COALESCE(v_current_balance, 0.00),
                'amount_deducted', 0.00,
                'reference', v_ref,
                'reason', p_reason
            );
        END IF;
    END IF;

    SELECT COALESCE(balance, 0.00)
    INTO v_current_balance
    FROM public.users
    WHERE lower(email) = v_email
    FOR UPDATE;

    IF NOT FOUND THEN
        IF v_ref IS NOT NULL THEN
            DELETE FROM public.wallet_atomic_ops WHERE op_reference = v_ref AND op_type = 'deduct';
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_current_balance < v_amount THEN
        IF v_ref IS NOT NULL THEN
            DELETE FROM public.wallet_atomic_ops WHERE op_reference = v_ref AND op_type = 'deduct';
        END IF;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient wallet balance',
            'current_balance', v_current_balance
        );
    END IF;

    v_new_balance := ROUND(v_current_balance - v_amount, 2);

    UPDATE public.users
    SET balance = v_new_balance,
        last_active_at = now()
    WHERE lower(email) = v_email;

    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'previous_balance', v_current_balance,
        'new_balance', v_new_balance,
        'amount_deducted', v_amount,
        'reference', v_ref,
        'reason', p_reason
    );
END;
$$;

DROP FUNCTION IF EXISTS public.refund_wallet_atomic(TEXT, NUMERIC, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.refund_wallet_atomic(
    p_user_email TEXT,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT 'wallet_spend_rollback',
    p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(p_user_email, '')));
    v_ref TEXT := NULLIF(trim(COALESCE(p_reference, '')), '');
    v_amount NUMERIC(12,2);
    v_current_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
BEGIN
    IF v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'User email is required');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
    END IF;

    v_amount := ROUND(p_amount::numeric, 2);

    IF v_ref IS NOT NULL THEN
        INSERT INTO public.wallet_atomic_ops (op_reference, op_type, user_email, amount, reason)
        VALUES (v_ref, 'refund', v_email, v_amount, p_reason)
        ON CONFLICT (op_reference, op_type) DO NOTHING;

        IF NOT FOUND THEN
            SELECT COALESCE(balance, 0.00) INTO v_current_balance
            FROM public.users
            WHERE lower(email) = v_email;

            RETURN jsonb_build_object(
                'success', true,
                'already_processed', true,
                'previous_balance', COALESCE(v_current_balance, 0.00),
                'new_balance', COALESCE(v_current_balance, 0.00),
                'amount_refunded', 0.00,
                'reference', v_ref,
                'reason', p_reason
            );
        END IF;
    END IF;

    SELECT COALESCE(balance, 0.00)
    INTO v_current_balance
    FROM public.users
    WHERE lower(email) = v_email
    FOR UPDATE;

    IF NOT FOUND THEN
        IF v_ref IS NOT NULL THEN
            DELETE FROM public.wallet_atomic_ops WHERE op_reference = v_ref AND op_type = 'refund';
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    v_new_balance := ROUND(v_current_balance + v_amount, 2);

    UPDATE public.users
    SET balance = v_new_balance
    WHERE lower(email) = v_email;

    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'previous_balance', v_current_balance,
        'new_balance', v_new_balance,
        'amount_refunded', v_amount,
        'reference', v_ref,
        'reason', p_reason
    );
END;
$$;

-- Compatibility wrappers delegating to canonical atomic deduct/refund
CREATE OR REPLACE FUNCTION public.spend_wallet_balance_atomic(
    p_user_email TEXT,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT 'wallet_spend',
    p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.deduct_wallet_atomic(p_user_email, p_amount, p_reason, p_reference);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_wallet_deduction_atomic(
    p_user_email TEXT,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT 'wallet_spend_rollback',
    p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.refund_wallet_atomic(p_user_email, p_amount, p_reason, p_reference);
END;
$$;

-- 4.5 DB-Backed Wallet PIN Lockout RPCs (5 failed -> 45 min lockout)
CREATE OR REPLACE FUNCTION public.check_wallet_pin_lockout(
    p_user_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(p_user_email, '')));
    v_attempts INT := 0;
    v_locked_until TIMESTAMPTZ;
    v_pin_hash TEXT;
    v_is_locked BOOLEAN := FALSE;
    v_rem_secs INT := 0;
BEGIN
    SELECT
        COALESCE(wallet_pin_failed_attempts, 0),
        wallet_pin_locked_until,
        wallet_pin_hash
    INTO v_attempts, v_locked_until, v_pin_hash
    FROM public.users
    WHERE lower(email) = v_email
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'is_locked', false,
            'failed_attempts', 0,
            'locked_until', NULL,
            'remaining_seconds', 0,
            'has_pin', false
        );
    END IF;

    IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
        v_is_locked := TRUE;
        v_rem_secs := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_locked_until - now())))::INT);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'is_locked', v_is_locked,
        'failed_attempts', v_attempts,
        'locked_until', v_locked_until,
        'remaining_seconds', v_rem_secs,
        'has_pin', (v_pin_hash IS NOT NULL AND trim(v_pin_hash) <> '')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wallet_pin_attempt(
    p_user_email TEXT,
    p_success BOOLEAN,
    p_max_attempts INT DEFAULT 5,
    p_lock_minutes INT DEFAULT 45
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(p_user_email, '')));
    v_attempts INT := 0;
    v_locked_until TIMESTAMPTZ;
    v_is_locked BOOLEAN := FALSE;
    v_rem_secs INT := 0;
    v_max INT := GREATEST(1, COALESCE(p_max_attempts, 5));
    v_lock_mins INT := GREATEST(1, COALESCE(p_lock_minutes, 45));
BEGIN
    SELECT
        COALESCE(wallet_pin_failed_attempts, 0),
        wallet_pin_locked_until
    INTO v_attempts, v_locked_until
    FROM public.users
    WHERE lower(email) = v_email
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
        v_rem_secs := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_locked_until - now())))::INT);
        RETURN jsonb_build_object(
            'success', false,
            'is_locked', true,
            'failed_attempts', v_attempts,
            'locked_until', v_locked_until,
            'remaining_seconds', v_rem_secs
        );
    END IF;

    IF COALESCE(p_success, FALSE) THEN
        UPDATE public.users
        SET wallet_pin_failed_attempts = 0,
            wallet_pin_locked_until = NULL
        WHERE lower(email) = v_email;

        RETURN jsonb_build_object(
            'success', true,
            'is_locked', false,
            'failed_attempts', 0,
            'locked_until', NULL,
            'remaining_seconds', 0
        );
    END IF;

    -- Previous lock expired -> reset counter before incrementing
    IF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
        v_attempts := 0;
    END IF;

    v_attempts := v_attempts + 1;
    IF v_attempts >= v_max THEN
        v_locked_until := now() + make_interval(mins => v_lock_mins);
        v_is_locked := TRUE;
        v_rem_secs := v_lock_mins * 60;
    ELSE
        v_locked_until := NULL;
        v_is_locked := FALSE;
        v_rem_secs := 0;
    END IF;

    UPDATE public.users
    SET wallet_pin_failed_attempts = v_attempts,
        wallet_pin_locked_until = v_locked_until
    WHERE lower(email) = v_email;

    RETURN jsonb_build_object(
        'success', false,
        'is_locked', v_is_locked,
        'failed_attempts', v_attempts,
        'locked_until', v_locked_until,
        'remaining_seconds', v_rem_secs
    );
END;
$$;

-- 4.6 Fix reverse_user_transfer (remove unsafe sender_email fallback, add deadlock ordering)
CREATE OR REPLACE FUNCTION public.reverse_user_transfer(
    p_admin_email TEXT,
    p_reference TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_ref TEXT := TRIM(COALESCE(p_reference, ''));
    v_admin_clean TEXT := LOWER(TRIM(COALESCE(p_admin_email, '')));
    v_sent_payment RECORD;
    v_rcv_payment RECORD;
    v_recipient_email TEXT;
    v_sender_email TEXT;
    v_sender RECORD;
    v_recipient RECORD;
    v_amount NUMERIC(15,2);
    v_reversal_ref TEXT;
    v_new_recipient_bal NUMERIC(15,2);
    v_new_sender_bal NUMERIC(15,2);
BEGIN
    IF v_clean_ref = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction reference is required');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.payments
        WHERE reference = 'rev_' || v_clean_ref
           OR metadata->>'original_reference' = v_clean_ref
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This transfer has already been reversed');
    END IF;

    SELECT * INTO v_sent_payment
    FROM public.payments
    WHERE reference = v_clean_ref
      AND type = 'transfer_sent'
      AND status = 'success'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Original successful transfer record not found for reference: ' || v_clean_ref);
    END IF;

    v_amount := v_sent_payment.amount;
    v_sender_email := LOWER(TRIM(v_sent_payment.user_email));

    -- Strictly match deterministic linked receive record ONLY (NO arbitrary latest sender_email fallback)
    SELECT * INTO v_rcv_payment
    FROM public.payments
    WHERE type = 'transfer_received'
      AND status = 'success'
      AND (
          reference = v_clean_ref || '_rcv'
          OR (
              metadata ? 'idempotency_key'
              AND metadata->>'idempotency_key' = v_clean_ref
          )
      )
    LIMIT 1;

    IF FOUND THEN
        v_recipient_email := LOWER(TRIM(v_rcv_payment.user_email));
    ELSIF v_sent_payment.metadata ? 'recipient_email'
          AND NULLIF(TRIM(v_sent_payment.metadata->>'recipient_email'), '') IS NOT NULL THEN
        v_recipient_email := LOWER(TRIM(v_sent_payment.metadata->>'recipient_email'));
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Could not deterministically locate recipient for transfer reference: ' || v_clean_ref);
    END IF;

    IF v_recipient_email = v_sender_email THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid transfer: sender and recipient are identical');
    END IF;

    -- Lock in deterministic email order to avoid deadlocks
    IF v_recipient_email < v_sender_email THEN
        SELECT id, email, balance INTO v_recipient FROM public.users WHERE LOWER(email) = v_recipient_email FOR UPDATE;
        SELECT id, email, balance INTO v_sender FROM public.users WHERE LOWER(email) = v_sender_email FOR UPDATE;
    ELSE
        SELECT id, email, balance INTO v_sender FROM public.users WHERE LOWER(email) = v_sender_email FOR UPDATE;
        SELECT id, email, balance INTO v_recipient FROM public.users WHERE LOWER(email) = v_recipient_email FOR UPDATE;
    END IF;

    IF v_recipient.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient account not found for clawback');
    END IF;

    IF v_sender.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Original sender account not found');
    END IF;

    IF COALESCE(v_recipient.balance, 0.00) < v_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Recipient account has insufficient available balance (₦' || COALESCE(v_recipient.balance, 0.00) || ') to claw back ₦' || v_amount || '. Freeze account or manual intervention required.'
        );
    END IF;

    v_new_recipient_bal := ROUND(COALESCE(v_recipient.balance, 0.00) - v_amount, 2);
    v_new_sender_bal := ROUND(COALESCE(v_sender.balance, 0.00) + v_amount, 2);

    UPDATE public.users SET balance = v_new_recipient_bal WHERE id = v_recipient.id;
    UPDATE public.users SET balance = v_new_sender_bal WHERE id = v_sender.id;

    v_reversal_ref := 'rev_' || v_clean_ref;

    INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
    VALUES (
        v_recipient.email,
        v_reversal_ref || '_clawback',
        v_amount,
        'success',
        'transfer_reversal_debit',
        'Transfer reversal clawback: ₦' || v_amount || ' for ref ' || v_clean_ref,
        jsonb_build_object(
            'original_reference', v_clean_ref,
            'reversed_by', v_admin_clean,
            'reason', p_reason,
            'target_user', v_sender.email
        )
    );

    INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
    VALUES (
        v_sender.email,
        v_reversal_ref || '_refund',
        v_amount,
        'success',
        'transfer_reversal_credit',
        'Transfer reversal refund: ₦' || v_amount || ' for ref ' || v_clean_ref,
        jsonb_build_object(
            'original_reference', v_clean_ref,
            'reversed_by', v_admin_clean,
            'reason', p_reason,
            'source_user', v_recipient.email
        )
    );

    INSERT INTO public.notifications (user_email, title, message)
    VALUES
        (
            v_sender.email,
            'Transfer Reversed & Refunded',
            'Your transfer of ₦' || TO_CHAR(v_amount, 'FM999,999,990.00') || ' [Ref: ' || v_clean_ref || '] was reversed and credited back to your wallet. Reason: ' || p_reason
        ),
        (
            v_recipient.email,
            'Transfer Reversal Notice',
            'A transfer of ₦' || TO_CHAR(v_amount, 'FM999,999,990.00') || ' [Ref: ' || v_clean_ref || '] received was reversed by administrative dispute resolution. Reason: ' || p_reason
        );

    INSERT INTO public.admin_audit_logs (
        admin_email,
        action,
        target_id,
        target_type,
        reason,
        previous_state,
        new_state
    ) VALUES (
        v_admin_clean,
        'reverse_transfer',
        v_clean_ref,
        'payment',
        p_reason,
        jsonb_build_object(
            'sender', v_sender.email,
            'sender_bal_before', v_sender.balance,
            'recipient', v_recipient.email,
            'recipient_bal_before', v_recipient.balance
        ),
        jsonb_build_object(
            'sender_bal_after', v_new_sender_bal,
            'recipient_bal_after', v_new_recipient_bal,
            'amount_reversed', v_amount
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'amount_reversed', v_amount,
        'sender_email', v_sender.email,
        'sender_new_balance', v_new_sender_bal,
        'recipient_email', v_recipient.email,
        'recipient_new_balance', v_new_recipient_bal,
        'reversal_reference', v_reversal_ref
    );
END;
$$;

-- ==============================================================================
-- SECTION 5: AD RATINGS & UNIFIED ATW TIER RECALCULATION
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

    UPDATE public.users u
    SET
        attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
        atw_tier = CASE
            WHEN COALESCE(u.is_affiliate, FALSE) OR COALESCE(u.is_career, FALSE)
                 OR lower(trim(u.email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
            THEN 'Unlimited'
            ELSE 'ATW' || public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
                COALESCE(u.atw_tier, 'ATW1')
            )::TEXT
        END
    FROM public.ad_impressions ai
    WHERE ai.ad_id = p_ad_id
      AND lower(u.email) = lower(ai.user_email);

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
            'increment', 0
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
    updated_users AS (
        UPDATE public.users u
        SET
            attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
            atw_tier = CASE
                WHEN COALESCE(u.is_affiliate, FALSE) OR COALESCE(u.is_career, FALSE)
                     OR lower(trim(u.email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
                THEN 'Unlimited'
                ELSE 'ATW' || public.compute_atw_level(
                    COALESCE(u.monetization_clicks, 0),
                    LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + v_increment),
                    COALESCE(u.atw_tier, 'ATW1')
                )::TEXT
            END
        FROM batch b
        WHERE lower(trim(u.email)) = b.norm_email
        RETURNING b.norm_email
    )
    SELECT
        (SELECT COUNT(*) FROM updated_users),
        (SELECT MAX(norm_email) FROM batch)
    INTO v_updated_count, v_max_email;

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
        'increment', v_increment
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

    UPDATE public.users u
    SET
        attention_worth_score = LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + d.delta),
        atw_tier = CASE
            WHEN COALESCE(u.is_affiliate, FALSE) OR COALESCE(u.is_career, FALSE)
                 OR lower(trim(u.email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
            THEN 'Unlimited'
            ELSE 'ATW' || public.compute_atw_level(
                COALESCE(u.monetization_clicks, 0),
                LEAST(1000000.0000, COALESCE(u.attention_worth_score, 0.1000) + d.delta),
                COALESCE(u.atw_tier, 'ATW1')
            )::TEXT
        END
    FROM (
        SELECT lower(trim(e)) AS norm_email, SUM(val) AS delta
        FROM unnest(p_emails, p_deltas) AS t(e, val)
        WHERE e IS NOT NULL AND val > 0
        GROUP BY lower(trim(e))
    ) d
    WHERE lower(trim(u.email)) = d.norm_email;
END;
$$;

-- ==============================================================================
-- SECTION 6: AD IMPRESSION ARCHIVAL (BOTH addscompleted + completed_ads, DELETE
--            addsactive + bidded_ads) & SECURED FEED RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.archive_completed_ad(p_ad_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_common_cols TEXT;
BEGIN
    IF to_regclass('public.completed_ads') IS NOT NULL THEN
        INSERT INTO public.completed_ads (
            id, ad_type, industry, interest, lifestyle, behavior, personality, age_range,
            targeting_all, impressions, country, state, province, gender, employment_status,
            ad_media_type, ad_content, ad_media_url, ad_action_buttons, action_phone,
            action_whatsapp, action_website, action_email, cost_per_impression, total_cost,
            created_at, completed_at, user_id, user_email, impression_count
        )
        SELECT
            id, ad_type, industry, interest, lifestyle, behavior, personality, age_range,
            targeting_all, impressions, country, state, province, gender, employment_status,
            ad_media_type, ad_content, ad_media, ad_action_buttons, action_phone,
            action_whatsapp, action_website, action_email, cost_per_impression, total_cost,
            created_at, COALESCE(completed_at, timezone('utc'::text, now())), user_id, user_email, COALESCE(impression_count, 0)
        FROM public.addsactive
        WHERE id = p_ad_id
        ON CONFLICT (id) DO UPDATE SET
            completed_at = COALESCE(EXCLUDED.completed_at, timezone('utc'::text, now())),
            impression_count = GREATEST(COALESCE(public.completed_ads.impression_count, 0), COALESCE(EXCLUDED.impression_count, 0));
    END IF;

    IF to_regclass('public.addscompleted') IS NOT NULL THEN
        SELECT string_agg(quote_ident(c1.column_name), ', ' ORDER BY c1.ordinal_position)
        INTO v_common_cols
        FROM information_schema.columns c1
        JOIN information_schema.columns c2
          ON c1.table_schema = c2.table_schema
         AND c1.column_name = c2.column_name
        WHERE c1.table_schema = 'public'
          AND c1.table_name = 'addscompleted'
          AND c2.table_name = 'addsactive';

        IF v_common_cols IS NOT NULL AND v_common_cols <> '' THEN
            EXECUTE format(
                'INSERT INTO public.addscompleted (%s) SELECT %s FROM public.addsactive WHERE id = $1 ' ||
                'ON CONFLICT (id) DO UPDATE SET ' ||
                'completed_at = COALESCE(EXCLUDED.completed_at, timezone(''utc''::text, now())), ' ||
                'impression_count = GREATEST(COALESCE(public.addscompleted.impression_count, 0), COALESCE(EXCLUDED.impression_count, 0))',
                v_common_cols,
                v_common_cols
            ) USING p_ad_id;
        END IF;
    END IF;

    IF to_regclass('public.bidded_ads') IS NOT NULL THEN
        DELETE FROM public.bidded_ads WHERE ad_id = p_ad_id;
    END IF;

    DELETE FROM public.addsactive WHERE id = p_ad_id;
END;
$$;

DROP FUNCTION IF EXISTS public.increment_ad_impressions_bulk(UUID, INT) CASCADE;
CREATE OR REPLACE FUNCTION public.increment_ad_impressions_bulk(
    p_ad_id UUID,
    p_delta INT DEFAULT 1
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
    v_safe_delta INT := GREATEST(1, COALESCE(p_delta, 1));
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

    -- 2. Sync summary counter on active ad & detect exhaustion
    UPDATE public.addsactive a
    SET
        impression_count = GREATEST(COALESCE(a.impression_count, 0), v_new_total)::INT,
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
        -- Already archived or missing
        IF to_regclass('public.completed_ads') IS NOT NULL THEN
            SELECT COALESCE(impression_count, 0)::BIGINT, COALESCE(impressions, 0)::BIGINT, TRUE
            INTO v_new_total, v_target, v_exhausted
            FROM public.completed_ads
            WHERE id = p_ad_id;
        END IF;

        RETURN QUERY SELECT COALESCE(v_new_total, 0)::BIGINT, COALESCE(v_target, 0)::BIGINT, COALESCE(v_exhausted, FALSE);
        RETURN;
    END IF;

    -- 3. Archive exhausted ads to BOTH completed_ads & addscompleted, and delete from addsactive & bidded_ads
    IF v_exhausted THEN
        PERFORM public.archive_completed_ad(p_ad_id);
    END IF;

    RETURN QUERY SELECT v_new_total, v_target, v_exhausted;
END;
$$;

-- Harden get_user_feed (adds deactivated_users, blocked_ads, blocked_advertisers, schedule, cap & service_role lockdown)
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
    bid_price NUMERIC(12,2)
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
            (
                a.campaign_days IS NOT NULL
                AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
                AND COALESCE(a.impressions, 0) > 0
                AND COALESCE(a.impression_count, 0) < a.impressions
            ) AS ad_is_rollover,
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
        WHERE a.completed_at IS NULL
          AND COALESCE(a.is_paused, FALSE) = FALSE
          AND (a.scheduled_start_at IS NULL OR a.scheduled_start_at <= now())
          AND (a.scheduled_end_at IS NULL OR a.scheduled_end_at >= now())
          AND (COALESCE(a.impressions, 0) <= 0 OR COALESCE(a.impression_count, 0) < a.impressions)
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
                AND COALESCE(ai.view_count, 0) >= COALESCE(a.user_frequency_cap, 1)
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
                          a.campaign_days IS NOT NULL
                          AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day')
                          AND (a.country IS NOT NULL AND lower(a.country) = lower(COALESCE(v_user_country, '')))
                      )
                  )
                  AND (
                      a.employment_status IS NULL OR a.employment_status = '' OR lower(a.employment_status) = 'all'
                      OR lower(COALESCE(v_user_employment, '')) = ANY(
                          string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
                      )
                      OR (a.campaign_days IS NOT NULL AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day'))
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
                      OR (a.campaign_days IS NOT NULL AND (now() - a.created_at) > (a.campaign_days * INTERVAL '1 day'))
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
        ca.bid_price
    FROM candidate_ads ca
    ORDER BY (
        ca.auction_base_score
        + ca.relevance_affinity
        + (CASE WHEN ca.ad_is_rollover THEN 25.0 ELSE 0.0 END)
        + random() * 10.0
    ) DESC
    LIMIT v_safe_limit OFFSET v_safe_offset;
END;
$$;

-- ==============================================================================
-- SECTION 7: DEACTIVATION, DORMANCY FORFEITURE, NEWS EXPIRY & RECONCILIATION
-- ==============================================================================

-- 7.1 Hardened deactivate_user_atomic
-- * Removes silent LIMIT 5000 truncation
-- * Case-insensitive LOWER(email) cleanup everywhere
-- * Joins bidded_ads & bidded_highlights via ad_id / highlight_id (no user_email assumption)
-- * Scrubs user from mutuals (case-insensitive) & referrals
-- * Inserts batch notifications directly into public.notifications for affected peers
CREATE OR REPLACE FUNCTION public.deactivate_user_atomic(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email            TEXT := lower(trim(COALESCE(p_email, '')));
    v_user_id          UUID;
    v_username         TEXT;
    v_ref_code         TEXT;
    v_pseudonym        TEXT;
    v_referrer         TEXT;
    v_referees         TEXT[] := '{}';
    v_mutual_holders   TEXT[] := '{}';
    v_ad_ids           UUID[] := '{}';
    v_highlight_ids    UUID[] := '{}';
    v_notif_targets    TEXT[] := '{}';
    v_notifs_sent      INT := 0;
    v_tbl              TEXT;
BEGIN
    IF v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid email address');
    END IF;

    SET LOCAL lock_timeout = '3s';
    SET LOCAL statement_timeout = '30s';

    v_pseudonym := 'deleted_' || md5(v_email);

    -- 1. Lock user row
    SELECT id, username, referral_code
    INTO v_user_id, v_username, v_ref_code
    FROM public.users
    WHERE lower(trim(email)) = v_email
    FOR UPDATE;

    -- Always ensure permanent tombstone exists
    INSERT INTO public.deactivated_users (email, deactivated_at, reason)
    VALUES (v_email, now(), 'user_deactivated')
    ON CONFLICT (email) DO UPDATE SET deactivated_at = now();

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'email', v_email,
            'ledger_pseudonym', v_pseudonym,
            'referrer_email', NULL,
            'referee_emails', '[]'::jsonb,
            'mutual_holder_emails', '[]'::jsonb,
            'notifications_sent', 0,
            'notice', 'Account tombstone recorded; user record already removed'
        );
    END IF;

    -- 2. Capture full social/referral graph WITHOUT silent LIMIT 5000 truncation
    SELECT lower(trim(referrer_email)) INTO v_referrer
    FROM public.referrals
    WHERE lower(trim(referee_email)) = v_email
    LIMIT 1;

    SELECT COALESCE(array_agg(DISTINCT lower(trim(referee_email))), '{}')
    INTO v_referees
    FROM public.referrals
    WHERE lower(trim(referrer_email)) = v_email;

    SELECT COALESCE(array_agg(DISTINCT lower(trim(email))), '{}')
    INTO v_mutual_holders
    FROM public.users
    WHERE mutuals IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(mutuals) m WHERE lower(trim(m)) = v_email);

    -- 3. Scrub user case-insensitively from every mutuals array & recalculate mutual_count
    UPDATE public.users
    SET
        mutuals = COALESCE(ARRAY(SELECT m FROM unnest(mutuals) m WHERE lower(trim(m)) <> v_email), '{}'),
        mutual_count = COALESCE(array_length(ARRAY(SELECT m FROM unnest(mutuals) m WHERE lower(trim(m)) <> v_email), 1), 0)
    WHERE mutuals IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(mutuals) m WHERE lower(trim(m)) = v_email);

    -- Unbind followers who used this user's email or referral_code
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referred_by') THEN
        UPDATE public.users SET referred_by = NULL WHERE lower(trim(referred_by)) = v_email;
        IF v_ref_code IS NOT NULL AND trim(v_ref_code) <> '' THEN
            UPDATE public.users SET referred_by = NULL WHERE lower(trim(referred_by)) = lower(trim(v_ref_code));
        END IF;
    END IF;

    DELETE FROM public.referrals WHERE lower(trim(referrer_email)) = v_email;
    DELETE FROM public.referrals WHERE lower(trim(referee_email)) = v_email;

    -- 4. Collect user's Ad IDs & Highlight IDs BEFORE deleting campaign tables
    IF to_regclass('public.addsactive') IS NOT NULL THEN
        SELECT COALESCE(array_agg(id), '{}') INTO v_ad_ids
        FROM (
            SELECT id FROM public.addsactive WHERE lower(trim(user_email)) = v_email
            UNION
            SELECT id FROM public.adds WHERE lower(trim(user_email)) = v_email
        ) ads_union;
    END IF;

    IF to_regclass('public.newsactive') IS NOT NULL THEN
        SELECT COALESCE(array_agg(id), '{}') INTO v_highlight_ids
        FROM (
            SELECT id FROM public.newsactive WHERE lower(trim(user_email)) = v_email
            UNION
            SELECT id FROM public.news WHERE lower(trim(user_email)) = v_email
        ) news_union;
    END IF;

    -- 5. Remove bidded_ads & bidded_highlights strictly via campaign ID join (plus user_email if present)
    IF to_regclass('public.bidded_ads') IS NOT NULL THEN
        IF array_length(v_ad_ids, 1) IS NOT NULL THEN
            DELETE FROM public.bidded_ads WHERE ad_id = ANY(v_ad_ids);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'bidded_ads' AND column_name = 'user_email') THEN
            DELETE FROM public.bidded_ads WHERE lower(trim(user_email)) = v_email;
        END IF;
    END IF;

    IF to_regclass('public.bidded_highlights') IS NOT NULL THEN
        IF array_length(v_highlight_ids, 1) IS NOT NULL THEN
            DELETE FROM public.bidded_highlights WHERE highlight_id = ANY(v_highlight_ids);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'bidded_highlights' AND column_name = 'user_email') THEN
            DELETE FROM public.bidded_highlights WHERE lower(trim(user_email)) = v_email;
        END IF;
    END IF;

    -- Clean impressions on deactivated user's ads & impression shards
    IF array_length(v_ad_ids, 1) IS NOT NULL THEN
        IF to_regclass('public.ad_impressions') IS NOT NULL THEN
            DELETE FROM public.ad_impressions WHERE ad_id = ANY(v_ad_ids);
        END IF;
        IF to_regclass('public.ad_impression_shards') IS NOT NULL THEN
            DELETE FROM public.ad_impression_shards WHERE ad_id = ANY(v_ad_ids);
        END IF;
    END IF;

    -- 6. Hard-delete user-owned campaigns & PII tables (case-insensitive)
    FOREACH v_tbl IN ARRAY ARRAY[
        'adds', 'addsactive', 'completed_ads', 'addscompleted',
        'news', 'newsactive',
        'notifications', 'ad_impressions', 'read_announcements', 'help_tickets',
        'premium_subscribers', 'user_devices', 'push_subscriptions', 'user_interests'
    ] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL
           AND EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'user_email') THEN
            EXECUTE format('DELETE FROM public.%I WHERE lower(trim(user_email)) = $1', v_tbl) USING v_email;
        END IF;
    END LOOP;

    FOREACH v_tbl IN ARRAY ARRAY['ad_reports', 'blocked_advertisers', 'blocked_ads'] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'reporter_email') THEN
                EXECUTE format('DELETE FROM public.%I WHERE lower(trim(reporter_email)) = $1', v_tbl) USING v_email;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'user_email') THEN
                EXECUTE format('DELETE FROM public.%I WHERE lower(trim(user_email)) = $1', v_tbl) USING v_email;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'advertiser_email') THEN
                EXECUTE format('DELETE FROM public.%I WHERE lower(trim(advertiser_email)) = $1', v_tbl) USING v_email;
            END IF;
        END IF;
    END LOOP;

    IF to_regclass('public.completed_ads_ratings') IS NOT NULL THEN
        DELETE FROM public.completed_ads_ratings WHERE lower(trim(advertiser_email)) = v_email;
    END IF;
    IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
        DELETE FROM public.newsletter_subscribers WHERE lower(trim(email)) = v_email;
    END IF;
    IF to_regclass('public.affiliate_yield_shards') IS NOT NULL THEN
        DELETE FROM public.affiliate_yield_shards WHERE lower(trim(affiliate_email)) = v_email;
    END IF;

    -- 7. Pseudonymise legally retained financial records (5-year AML retention)
    FOREACH v_tbl IN ARRAY ARRAY['payments', 'forfeited_balances', 'agent_commission_logs'] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'user_email') THEN
                EXECUTE format('UPDATE public.%I SET user_email = $2 WHERE lower(trim(user_email)) = $1', v_tbl)
                    USING v_email, v_pseudonym;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'username') THEN
                EXECUTE format('UPDATE public.%I SET username = NULL WHERE user_email = $1', v_tbl) USING v_pseudonym;
            END IF;
        END IF;
    END LOOP;

    -- 8. Delete the primary user record
    DELETE FROM public.users WHERE id = v_user_id;

    -- 9. Batch-insert notifications for affected referrer, referees, and mutual holders
    IF to_regclass('public.notifications') IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT t), '{}')
        INTO v_notif_targets
        FROM (
            SELECT v_referrer AS t WHERE v_referrer IS NOT NULL AND v_referrer <> '' AND v_referrer <> v_email
            UNION
            SELECT unnest(v_referees) AS t
            UNION
            SELECT unnest(v_mutual_holders) AS t
        ) peers
        WHERE t IS NOT NULL
          AND t <> ''
          AND t <> v_email
          AND NOT EXISTS (SELECT 1 FROM public.deactivated_users du WHERE du.email = t);

        IF array_length(v_notif_targets, 1) IS NOT NULL THEN
            INSERT INTO public.notifications (user_email, title, message, read, created_at)
            SELECT
                target_email,
                'Connection Account Deactivated',
                COALESCE(NULLIF(trim(v_username), ''), 'A connected user') || ' has permanently deactivated their account and been removed from your connections.',
                FALSE,
                now()
            FROM unnest(v_notif_targets) AS target_email;
            GET DIAGNOSTICS v_notifs_sent = ROW_COUNT;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'email', v_email,
        'referrer_email', v_referrer,
        'referee_emails', to_jsonb(v_referees),
        'mutual_holder_emails', to_jsonb(v_mutual_holders),
        'ledger_pseudonym', v_pseudonym,
        'notifications_sent', v_notifs_sent
    );
EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object('success', false, 'code', 'LOCK_TIMEOUT', 'error', 'Account busy, please retry.');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7.2 Batched 60-Day Dormant Forfeiture + Full Account Deactivation (LIMIT 500 SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.forfeit_dormant_user_balances_60_days()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_forfeited_count INT := 0;
    v_deactivated_count INT := 0;
    v_total_forfeited NUMERIC(15,2) := 0.00;
    v_has_more BOOLEAN := FALSE;
    r RECORD;
BEGIN
    FOR r IN
        SELECT id, lower(trim(email)) AS email, username, COALESCE(balance, 0.00) AS balance
        FROM public.users
        WHERE COALESCE(ad_account_status, 'active') <> 'deactivated'
          AND COALESCE(is_affiliate, FALSE) = FALSE
          AND COALESCE(is_career, FALSE) = FALSE
          AND lower(trim(email)) NOT IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
          AND last_active_at IS NOT NULL
          AND last_active_at < NOW() - INTERVAL '60 days'
        ORDER BY last_active_at ASC
        LIMIT 500
        FOR UPDATE SKIP LOCKED
    LOOP
        IF r.balance > 0 THEN
            INSERT INTO public.forfeited_balances (
                user_email,
                username,
                amount,
                currency,
                reason,
                status,
                created_at
            ) VALUES (
                r.email,
                r.username,
                r.balance,
                'NGN',
                '60-day dormant inactivity forfeiture',
                'PENDING',
                NOW()
            );

            v_forfeited_count := v_forfeited_count + 1;
            v_total_forfeited := v_total_forfeited + r.balance;
        END IF;

        -- Zero balance & deactivate dormant account completely (handles 0-balance accounts too)
        UPDATE public.users
        SET balance = 0.00,
            monetized = 'false',
            monetization_clicks = 0,
            ad_account_status = 'deactivated'
        WHERE id = r.id;

        PERFORM public.deactivate_user_atomic(r.email);
        v_deactivated_count := v_deactivated_count + 1;
    END LOOP;

    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE COALESCE(ad_account_status, 'active') <> 'deactivated'
          AND COALESCE(is_affiliate, FALSE) = FALSE
          AND COALESCE(is_career, FALSE) = FALSE
          AND lower(trim(email)) NOT IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
          AND last_active_at IS NOT NULL
          AND last_active_at < NOW() - INTERVAL '60 days'
        LIMIT 1
    ) INTO v_has_more;

    RETURN jsonb_build_object(
        'success', true,
        'dormant_accounts_forfeited', v_forfeited_count,
        'dormant_accounts_deactivated', v_deactivated_count,
        'total_amount_forfeited', v_total_forfeited,
        'has_more', v_has_more,
        'executed_at', NOW()
    );
END;
$$;

-- 7.3 Fix delete_expired_news to honor expires_at, scheduled_end_at & campaign_days
CREATE OR REPLACE FUNCTION public.delete_expired_news()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    WITH expired AS (
        SELECT id
        FROM public.newsactive
        WHERE (
            (expires_at IS NOT NULL AND expires_at <= now())
            OR (scheduled_end_at IS NOT NULL AND scheduled_end_at <= now())
            OR (
                expires_at IS NULL
                AND scheduled_end_at IS NULL
                AND COALESCE(scheduled_start_at, created_at)
                    + (GREATEST(1, COALESCE(campaign_days, 1)) * INTERVAL '1 day') <= now()
            )
        )
        LIMIT 1000
    ),
    deleted_rows AS (
        DELETE FROM public.newsactive
        WHERE id IN (SELECT id FROM expired)
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted_rows;

    RETURN deleted_count;
END;
$$;

-- 7.4 Windowed / Incremental Ledger Reconciliation (NO unbounded full-table SUM)
CREATE OR REPLACE FUNCTION public.run_ledger_reconciliation_cron()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last_ts TIMESTAMPTZ;
    v_cum_sent NUMERIC(18,2) := 0.00;
    v_cum_received NUMERIC(18,2) := 0.00;
    v_cutoff_ts TIMESTAMPTZ := NOW() - INTERVAL '5 seconds';
    v_delta_sent NUMERIC(18,2) := 0.00;
    v_delta_received NUMERIC(18,2) := 0.00;
    v_total_sent NUMERIC(18,2) := 0.00;
    v_total_received NUMERIC(18,2) := 0.00;
    v_delta_variance NUMERIC(18,2) := 0.00;
    v_cum_variance NUMERIC(18,2) := 0.00;
    v_status TEXT := 'HEALTHY';
    v_notes TEXT;
BEGIN
    INSERT INTO public.ledger_reconciliation_checkpoints (id, last_reconciled_at, cumulative_sent, cumulative_received)
    VALUES (1, NOW() - INTERVAL '7 days', 0.00, 0.00)
    ON CONFLICT (id) DO NOTHING;

    SELECT last_reconciled_at, cumulative_sent, cumulative_received
    INTO v_last_ts, v_cum_sent, v_cum_received
    FROM public.ledger_reconciliation_checkpoints
    WHERE id = 1
    FOR UPDATE;

    v_last_ts := COALESCE(v_last_ts, NOW() - INTERVAL '7 days');

    IF v_cutoff_ts > v_last_ts THEN
        SELECT
            COALESCE(SUM(CASE WHEN type = 'transfer_sent' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type = 'transfer_received' THEN amount ELSE 0 END), 0)
        INTO v_delta_sent, v_delta_received
        FROM public.payments
        WHERE status = 'success'
          AND type IN ('transfer_sent', 'transfer_received')
          AND created_at > v_last_ts
          AND created_at <= v_cutoff_ts;
    END IF;

    v_total_sent := ROUND(COALESCE(v_cum_sent, 0) + COALESCE(v_delta_sent, 0), 2);
    v_total_received := ROUND(COALESCE(v_cum_received, 0) + COALESCE(v_delta_received, 0), 2);
    v_delta_variance := ABS(v_delta_sent - v_delta_received);
    v_cum_variance := ABS(v_total_sent - v_total_received);

    UPDATE public.ledger_reconciliation_checkpoints
    SET
        last_reconciled_at = GREATEST(v_last_ts, v_cutoff_ts),
        cumulative_sent = v_total_sent,
        cumulative_received = v_total_received,
        updated_at = NOW()
    WHERE id = 1;

    IF v_delta_variance > 0 OR v_cum_variance > 0 THEN
        v_status := 'FLAGGED';
        v_notes := 'Windowed audit discrepancy. Window Sent: ' || v_delta_sent || ', Received: ' || v_delta_received ||
                   ', Cumulative Sent: ' || v_total_sent || ', Cumulative Received: ' || v_total_received;
    ELSE
        v_notes := 'Windowed DB audit passed with 0.00 variance (Window: ' || v_last_ts || ' to ' || v_cutoff_ts || ').';
    END IF;

    INSERT INTO public.system_reconciliation_logs (
        status,
        total_credits_kobo,
        total_debits_kobo,
        variance_kobo,
        notes,
        created_at
    ) VALUES (
        v_status,
        ROUND(v_delta_received * 100),
        ROUND(v_delta_sent * 100),
        ROUND(v_delta_variance * 100),
        v_notes,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', v_status,
        'window_start', v_last_ts,
        'window_end', v_cutoff_ts,
        'window_sent', v_delta_sent,
        'window_received', v_delta_received,
        'total_sent', v_total_sent,
        'total_received', v_total_received,
        'variance', v_delta_variance
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_reconciliation_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last_ts TIMESTAMPTZ;
    v_cum_sent NUMERIC(18,2) := 0.00;
    v_cum_received NUMERIC(18,2) := 0.00;
    v_pending_sent NUMERIC(18,2) := 0.00;
    v_pending_received NUMERIC(18,2) := 0.00;
    v_total_sent NUMERIC(18,2) := 0.00;
    v_total_received NUMERIC(18,2) := 0.00;
    v_variance NUMERIC(18,2) := 0.00;
BEGIN
    SELECT last_reconciled_at, cumulative_sent, cumulative_received
    INTO v_last_ts, v_cum_sent, v_cum_received
    FROM public.ledger_reconciliation_checkpoints
    WHERE id = 1;

    -- Bounded incremental read only since last checkpoint (or rolling 7d fallback before first cron run)
    v_last_ts := COALESCE(v_last_ts, NOW() - INTERVAL '7 days');

    SELECT
        COALESCE(SUM(CASE WHEN type = 'transfer_sent' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'transfer_received' THEN amount ELSE 0 END), 0)
    INTO v_pending_sent, v_pending_received
    FROM public.payments
    WHERE status = 'success'
      AND type IN ('transfer_sent', 'transfer_received')
      AND created_at > v_last_ts;

    v_total_sent := ROUND(COALESCE(v_cum_sent, 0) + COALESCE(v_pending_sent, 0), 2);
    v_total_received := ROUND(COALESCE(v_cum_received, 0) + COALESCE(v_pending_received, 0), 2);
    v_variance := ABS(v_total_sent - v_total_received);

    RETURN jsonb_build_object(
        'total_sent_naira', v_total_sent,
        'total_received_naira', v_total_received,
        'variance_naira', v_variance,
        'status', CASE WHEN v_variance = 0 THEN 'HEALTHY' ELSE 'FLAGGED' END,
        'checkpoint_at', v_last_ts
    );
END;
$$;

-- 7.5 Update run_database_cleanup_cron to use fixed delete_expired_news + batched dormancy
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
          AND monetization_clicks < 300
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
        'executed_at', NOW()
    );
END;
$$;

-- 7.6 Lightweight Admin Users Campaign Summary RPC (Replaces N+1 table scans)
CREATE OR REPLACE FUNCTION public.get_users_campaign_summary(p_emails TEXT[])
RETURNS TABLE (
    user_email TEXT,
    review_ads_count BIGINT,
    active_ads_count BIGINT,
    review_highlights_count BIGINT,
    active_highlights_count BIGINT,
    total_clicks BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_emails IS NULL OR array_length(p_emails, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH target_emails AS (
        SELECT DISTINCT lower(trim(e)) AS email_norm
        FROM unnest(p_emails) AS e
        WHERE e IS NOT NULL AND trim(e) <> ''
    ),
    ra AS (
        SELECT lower(trim(a.user_email)) AS email_norm, COUNT(*)::BIGINT AS cnt
        FROM public.adds a
        JOIN target_emails te ON lower(trim(a.user_email)) = te.email_norm
        GROUP BY 1
    ),
    aa AS (
        SELECT lower(trim(a.user_email)) AS email_norm,
               COUNT(*)::BIGINT AS cnt,
               COALESCE(SUM(COALESCE(a.impression_count, 0)), 0)::BIGINT AS clicks
        FROM public.addsactive a
        JOIN target_emails te ON lower(trim(a.user_email)) = te.email_norm
        GROUP BY 1
    ),
    rn AS (
        SELECT lower(trim(n.user_email)) AS email_norm, COUNT(*)::BIGINT AS cnt
        FROM public.news n
        JOIN target_emails te ON lower(trim(n.user_email)) = te.email_norm
        GROUP BY 1
    ),
    an AS (
        SELECT lower(trim(n.user_email)) AS email_norm, COUNT(*)::BIGINT AS cnt
        FROM public.newsactive n
        JOIN target_emails te ON lower(trim(n.user_email)) = te.email_norm
        GROUP BY 1
    )
    SELECT
        te.email_norm AS user_email,
        COALESCE(ra.cnt, 0)::BIGINT AS review_ads_count,
        COALESCE(aa.cnt, 0)::BIGINT AS active_ads_count,
        COALESCE(rn.cnt, 0)::BIGINT AS review_highlights_count,
        COALESCE(an.cnt, 0)::BIGINT AS active_highlights_count,
        COALESCE(aa.clicks, 0)::BIGINT AS total_clicks
    FROM target_emails te
    LEFT JOIN ra ON ra.email_norm = te.email_norm
    LEFT JOIN aa ON aa.email_norm = te.email_norm
    LEFT JOIN rn ON rn.email_norm = te.email_norm
    LEFT JOIN an ON an.email_norm = te.email_norm;
END;
$$;

-- ==============================================================================
-- SECTION 8: 500M+ SCALE COMPOSITE & PARTIAL INDEXES
-- ==============================================================================

-- 8.1 Cursor-paginated statements & windowed reconciliation
CREATE INDEX IF NOT EXISTS idx_payments_user_created_id_desc
    ON public.payments (lower(user_email), created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_payments_transfers_reconcile_window
    ON public.payments (created_at, type)
    INCLUDE (amount)
    WHERE status = 'success' AND type IN ('transfer_sent', 'transfer_received');

-- 8.2 Cursor-paginated notifications & unread counter
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_id_desc
    ON public.notifications (lower(user_email), created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_partial
    ON public.notifications (lower(user_email), created_at DESC)
    WHERE read = FALSE;

-- 8.3 Active bidded ads & highlights ordered by bid_price DESC
CREATE INDEX IF NOT EXISTS idx_bidded_ads_active_bid_desc
    ON public.bidded_ads (bid_price DESC, created_at DESC)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_newsactive_active_bid_desc
    ON public.newsactive (is_bidded DESC, bid_price DESC, created_at DESC)
    WHERE is_paused IS NOT TRUE;

DO $$
BEGIN
    IF to_regclass('public.bidded_highlights') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bidded_highlights_bid_desc ON public.bidded_highlights (bid_price DESC, created_at DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bidded_highlights_highlight_id ON public.bidded_highlights (highlight_id)';
    END IF;
END $$;

-- 8.4 Ad reports & blocking lookup (feed & moderation queue)
CREATE INDEX IF NOT EXISTS idx_ad_reports_created_desc
    ON public.ad_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_reports_status_created_desc
    ON public.ad_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_reports_ad_created_desc
    ON public.ad_reports (ad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocked_ads_reporter_lower_ad
    ON public.blocked_ads (lower(reporter_email), ad_id);

CREATE INDEX IF NOT EXISTS idx_blocked_advertisers_reporter_lower_adv
    ON public.blocked_advertisers (lower(reporter_email), lower(advertiser_email));

-- 8.5 Dormant 60-day & 7-day click sweep partial index
CREATE INDEX IF NOT EXISTS idx_users_dormant_sweep_partial
    ON public.users (last_active_at ASC)
    WHERE last_active_at IS NOT NULL
      AND COALESCE(ad_account_status, 'active') <> 'deactivated'
      AND COALESCE(is_affiliate, FALSE) = FALSE
      AND COALESCE(is_career, FALSE) = FALSE;

-- 8.6 Active ads & highlights expiry sweep
CREATE INDEX IF NOT EXISTS idx_addsactive_live_feed
    ON public.addsactive (created_at DESC)
    WHERE completed_at IS NULL AND COALESCE(is_paused, FALSE) = FALSE;

CREATE INDEX IF NOT EXISTS idx_newsactive_expires_at
    ON public.newsactive (expires_at)
    WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsactive_scheduled_end_at
    ON public.newsactive (scheduled_end_at)
    WHERE scheduled_end_at IS NOT NULL;

-- ==============================================================================
-- SECTION 9: GLOBAL SECURITY DEFINER search_path & GRANT LOCKDOWN SWEEP
-- ==============================================================================

-- 9.1 Set search_path = public on ALL SECURITY DEFINER functions in public schema
DO $$
DECLARE
    v_fn RECORD;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure AS sig, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = TRUE
    LOOP
        IF v_fn.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_fn.proconfig) cfg WHERE cfg LIKE 'search_path=%'
        ) THEN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_fn.sig);
        END IF;
    END LOOP;
END $$;

-- 9.2 Lock down EXECUTE on ALL non-trigger SECURITY DEFINER RPCs in public (service_role ONLY)
DO $$
DECLARE
    v_fn RECORD;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = TRUE
          AND p.prorettype <> 'trigger'::regtype
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.sig);
    END LOOP;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
