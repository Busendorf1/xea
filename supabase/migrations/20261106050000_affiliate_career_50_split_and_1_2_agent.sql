-- ============================================================================
-- MIGRATION: 50%/50% AD EARNINGS SPLIT, 1%/2% AGENT COMMISSIONS,
-- CAREER & AFFILIATE BADGES, AND 100M+ SCALE LOCK-FREE AFFILIATE 10% ENGINE
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1. Extend public.users with Career & Affiliate columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_career BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_affiliate BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS affiliate_role TEXT DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS affiliate_earned_total NUMERIC(14,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_users_affiliate_career
  ON public.users (lower(email))
  WHERE is_affiliate = TRUE OR is_career = TRUE;

CREATE INDEX IF NOT EXISTS idx_users_is_affiliate
  ON public.users (created_at DESC)
  WHERE is_affiliate = TRUE;

-- 2. Seed pre-configured Career & Affiliate accounts
UPDATE public.users
SET is_career = TRUE,
    is_affiliate = TRUE,
    affiliate_role = COALESCE(NULLIF(trim(affiliate_role), ''), 'Affiliate Developer'),
    monetized = 'true'
WHERE lower(trim(email)) = 'nonsom019@gmail.com';

UPDATE public.users
SET is_career = TRUE,
    is_affiliate = TRUE,
    affiliate_role = COALESCE(NULLIF(trim(affiliate_role), ''), 'Affiliate First Agent'),
    monetized = 'true'
WHERE lower(trim(email)) = 'nonsom2023@gmail.com';

-- 3. Ensure referrals table, users agent columns, and audit table exist
CREATE TABLE IF NOT EXISTS public.referrals (
    id BIGSERIAL PRIMARY KEY,
    referrer_email TEXT NOT NULL,
    referee_email TEXT UNIQUE NOT NULL,
    device_hash TEXT,
    ip_address TEXT,
    status VARCHAR(20) DEFAULT 'active',
    interactions_count INT DEFAULT 0,
    commission_rate NUMERIC(5,4) DEFAULT 0.0100,
    total_commission_earned NUMERIC(12,2) DEFAULT 0.00,
    opt_out_status VARCHAR(20) DEFAULT 'none',
    opt_out_requested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    qualified_at TIMESTAMPTZ
);

ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) DEFAULT 0.0100;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS total_commission_earned NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS opt_out_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS opt_out_requested_at TIMESTAMPTZ;
ALTER TABLE public.referrals ALTER COLUMN commission_rate SET DEFAULT 0.0100;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_registered_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_total_earned NUMERIC(12,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users (referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users (lower(referred_by));
CREATE INDEX IF NOT EXISTS idx_users_is_agent ON public.users (is_agent) WHERE is_agent = true;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_lower ON public.referrals (lower(referrer_email), status);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_lower ON public.referrals (lower(referee_email));

CREATE TABLE IF NOT EXISTS public.agent_commission_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_email TEXT NOT NULL,
    referee_email TEXT NOT NULL,
    source_type VARCHAR(30) DEFAULT 'ad_earn',
    ad_id UUID,
    gross_earning NUMERIC(12,2) NOT NULL,
    deducted_commission NUMERIC(12,2) NOT NULL,
    net_referee_earning NUMERIC(12,2) NOT NULL,
    commission_rate NUMERIC(5,4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

UPDATE public.referrals r
SET commission_rate = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(trim(u.email)) = lower(trim(r.referee_email))
      AND u.is_agent = TRUE
  ) OR r.commission_rate >= 0.0399 THEN 0.0200
  ELSE 0.0100
END
WHERE r.commission_rate IS NULL OR r.commission_rate IN (0.0200, 0.0400);

-- 4. Create 64-Shard Lock-Free Affiliate Yield Overflow Table (100M+ Scale)
CREATE TABLE IF NOT EXISTS public.affiliate_yield_shards (
    affiliate_email TEXT NOT NULL,
    shard_id INT NOT NULL CHECK (shard_id >= 0 AND shard_id < 64),
    pending_amount NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (affiliate_email, shard_id)
);

ALTER TABLE public.affiliate_yield_shards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.affiliate_yield_shards FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.affiliate_yield_shards TO service_role;

-- 5. Lock-Free Affiliate Yield Flush RPC
DROP FUNCTION IF EXISTS public.flush_affiliate_yield_shards_atomic(text) CASCADE;
DROP FUNCTION IF EXISTS public.flush_affiliate_yield_shards_atomic() CASCADE;
CREATE OR REPLACE FUNCTION public.flush_affiliate_yield_shards_atomic(
    p_target_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_aff RECORD;
    v_drained NUMERIC(14,2);
    v_flushed_count INT := 0;
BEGIN
    FOR v_aff IN
        SELECT DISTINCT affiliate_email
        FROM public.affiliate_yield_shards
        WHERE pending_amount > 0
          AND (p_target_email IS NULL OR affiliate_email = lower(trim(p_target_email)))
    LOOP
        IF pg_try_advisory_xact_lock(hashtext('aff_yield_' || v_aff.affiliate_email)) THEN
            WITH drained AS (
                UPDATE public.affiliate_yield_shards
                SET pending_amount = 0,
                    updated_at = now()
                WHERE affiliate_email = v_aff.affiliate_email
                  AND pending_amount > 0
                RETURNING pending_amount
            )
            SELECT ROUND(COALESCE(SUM(pending_amount), 0), 2)
            INTO v_drained
            FROM drained;

            IF v_drained > 0 THEN
                UPDATE public.users
                SET balance = ROUND(COALESCE(balance, 0) + v_drained, 2),
                    affiliate_earned_total = ROUND(COALESCE(affiliate_earned_total, 0) + v_drained, 2),
                    monetized = 'true'
                WHERE lower(trim(email)) = v_aff.affiliate_email;
                v_flushed_count := v_flushed_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'flushed', v_flushed_count);
END;
$$;

-- 6. Zero-Wait Affiliate 10% Platform Share Credit RPC
--    When a user clicks Earn, 50% goes to the viewer and 50% goes to the platform.
--    From the platform's 50%, each active Affiliate gets 10% of the ad CPI
--    (i.e. 20% of the platform's 50% share, leaving 30% net to the platform).
--    Career badge holders earn 0%.
--    Uses pg_try_advisory_xact_lock for instant 0ms real-time updates when uncontended,
--    and 64-shard overflow when 100M+ concurrent requests hit simultaneously.
DROP FUNCTION IF EXISTS public.credit_affiliate_platform_share_atomic(numeric, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.credit_affiliate_platform_share_atomic(numeric) CASCADE;
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
    v_cpi NUMERIC(12,2) := GREATEST(COALESCE(p_raw_cpi, 25.00), 0.00);
    v_aff_cut NUMERIC(12,2);
    v_aff_email TEXT;
    v_drained NUMERIC(14,2) := 0.00;
    v_shard INT;
    v_credited_count INT := 0;
BEGIN
    -- 10% of ad CPI (which equals 20% of the platform's 50% share)
    v_aff_cut := ROUND(v_cpi * 0.10, 2);
    IF v_aff_cut <= 0 THEN
        RETURN jsonb_build_object('success', true, 'credited', 0);
    END IF;

    FOR v_aff_email IN
        SELECT DISTINCT lower(trim(email))
        FROM public.users
        WHERE is_affiliate = TRUE
           OR lower(trim(email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
    LOOP
        IF pg_try_advisory_xact_lock(hashtext('aff_yield_' || v_aff_email)) THEN
            -- Drain any sharded overflow first
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
            -- High-concurrency stampede: write into 1 of 64 lock-free shards without waiting
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

-- 7. Update apply_agent_commission_atomic to 1% (normal invite) and 2% (Agent invite)
DROP FUNCTION IF EXISTS public.apply_agent_commission_atomic(text, numeric, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.apply_agent_commission_atomic(text, numeric) CASCADE;
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
    v_earner_email TEXT := lower(trim(p_earner_email));
    v_earner_is_agent BOOLEAN := false;
    v_earner_monetized BOOLEAN := false;
    v_earner_new_bal NUMERIC(12,2);
    v_ref_row RECORD;
    v_agent1_email TEXT;
    v_agent1_new_bal NUMERIC(12,2);
    v_rate NUMERIC(5,4);
    v_deducted NUMERIC(12,2);
    v_net_earner NUMERIC(12,2);
    v_agent1_net NUMERIC(12,2);
    v_up_row RECORD;
    v_agent0_email TEXT := NULL;
    v_agent0_cut NUMERIC(12,2) := 0.00;
    v_agent0_new_bal NUMERIC(12,2) := NULL;
BEGIN
    IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    -- 1. Lookup active upline referral row in O(1) via idx_referrals_referee_lower
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

    v_agent1_email := v_ref_row.referrer_email;
    IF v_agent1_email IS NULL OR v_agent1_email = '' OR v_agent1_email = v_earner_email THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    -- 2. Check if earner is monetized (or exempt affiliate/career) and if earner is an Agent (2%) or regular user (1%)
    SELECT
        COALESCE(is_agent, false),
        (
          COALESCE(monetized::text, 'false') IN ('true', 'yes', '1', 't')
          OR COALESCE(monetization_clicks, 0) >= 300
          OR COALESCE(is_affiliate, false) = true
          OR COALESCE(is_career, false) = true
          OR lower(trim(email)) IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
        )
    INTO v_earner_is_agent, v_earner_monetized
    FROM public.users
    WHERE lower(email) = v_earner_email
    LIMIT 1;

    IF NOT COALESCE(v_earner_monetized, false) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'EARNER_NOT_MONETIZED');
    END IF;

    v_rate := CASE WHEN v_earner_is_agent THEN 0.0200 ELSE 0.0100 END;
    v_deducted := ROUND(p_gross_amount * v_rate, 2);

    IF v_deducted <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_net_earner := ROUND(p_gross_amount - v_deducted, 2);
    v_agent1_net := v_deducted;

    -- 3. Commission rate logic: 1% for standard follower, 2% if earner is an Agent
    v_rate := 0.0100;
    IF v_earner_is_agent = true THEN
        v_rate := 0.0200;
    END IF;

    v_deducted := ROUND(p_gross_amount * v_rate, 2);
    IF v_deducted <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_net_earner := ROUND(p_gross_amount - v_deducted, 2);
    v_agent1_net := v_deducted;

    -- 4. Deduct from earner and credit direct Agent atomically
    UPDATE public.users
    SET balance = GREATEST(0, ROUND(COALESCE(balance, 0) - v_deducted, 2))
    WHERE lower(email) = v_earner_email
    RETURNING balance INTO v_earner_new_bal;

    UPDATE public.users
    SET balance = ROUND(COALESCE(balance, 0) + v_agent1_net, 2),
        agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + v_agent1_net, 2)
    WHERE lower(email) = v_agent1_email
    RETURNING balance INTO v_agent1_new_bal;

    UPDATE public.referrals
    SET total_commission_earned = ROUND(COALESCE(total_commission_earned, 0) + v_deducted, 2),
        commission_rate = v_rate
    WHERE id = v_ref_row.id;

    RETURN jsonb_build_object(
        'applied', true,
        'deducted', v_deducted,
        'net_earner_amount', v_net_earner,
        'earner_new_balance', v_earner_new_bal,
        'agent1_email', v_agent1_email,
        'agent1_credit', v_agent1_net,
        'agent1_new_balance', v_agent1_new_bal,
        'rate', v_rate
    );
END;
$$;

-- 8. Update claim_ad_earning_atomic (UUID-first signature used by Web /api/earn & Mobile earn-payout)
DROP FUNCTION IF EXISTS public.claim_ad_earning_atomic(uuid, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.claim_ad_earning_atomic(uuid, text, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.claim_ad_earning_atomic(uuid, text) CASCADE;
--    - 50% viewer / 50% platform split
--    - Credits 10% of ad CPI to each active Affiliate from the platform's 50% share
--    - Exempts Affiliate/Career accounts from 300-click barrier and ATW holding caps
CREATE OR REPLACE FUNCTION public.claim_ad_earning_atomic(
  p_ad_id UUID,
  p_user_email TEXT,
  p_expected_rate NUMERIC DEFAULT 12.50,
  p_device_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_lower        TEXT;
  v_user_id            UUID;
  v_current_bal        NUMERIC(14,2);
  v_current_clicks     INT;
  v_monetized_val      TEXT;
  v_ref_downloads      INT;
  v_suspended_until    TIMESTAMP WITH TIME ZONE;
  v_is_affiliate       BOOLEAN := FALSE;
  v_is_career          BOOLEAN := FALSE;
  v_is_exempt          BOOLEAN := FALSE;
  v_is_monetized       BOOLEAN;
  v_raw_cpi            NUMERIC(12,2);
  v_earn_rate          NUMERIC(12,2);
  v_next_bal           NUMERIC(14,2);
  v_next_clicks        INT;
  v_next_monetized     TEXT;
  v_existing_views     INT;
  v_user_freq_cap      INT;
  v_impressions_target INT;
  v_impressions_count  INT;
  v_ad_completed       BOOLEAN;
BEGIN
  v_email_lower := lower(trim(p_user_email));

  -- 1. Row Lock on Viewer Profile
  SELECT 
    id, 
    COALESCE(balance, 0.00), 
    COALESCE(monetization_clicks, 0), 
    COALESCE(monetized::text, 'false'), 
    COALESCE(referral_downloads_count, 0),
    suspended_until,
    COALESCE(is_affiliate, FALSE),
    COALESCE(is_career, FALSE)
  INTO 
    v_user_id,
    v_current_bal,
    v_current_clicks,
    v_monetized_val,
    v_ref_downloads,
    v_suspended_until,
    v_is_affiliate,
    v_is_career
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

  v_is_exempt := (
    v_is_affiliate
    OR v_is_career
    OR v_email_lower IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
  );

  v_is_monetized := (
    v_is_exempt
    OR v_monetized_val IN ('true', 'yes', '1', 't')
    OR v_current_clicks >= 300
    OR v_ref_downloads >= 12
  );

  -- 2. Check Suspension Status (Exempt accounts are never blocked by cooldown/suspension)
  IF NOT v_is_exempt AND v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'USER_SUSPENDED',
      'error', 'Account is currently suspended.',
      'suspended_until', v_suspended_until
    );
  END IF;

  -- 3. Resolve Ad Details (Frequency Cap, CPI, Campaign Target)
  SELECT 
    cost_per_impression,
    COALESCE(user_frequency_cap, 1),
    COALESCE(impressions, 0),
    COALESCE(impression_count, 0),
    (completed_at IS NOT NULL)
  INTO 
    v_raw_cpi,
    v_user_freq_cap,
    v_impressions_target,
    v_impressions_count,
    v_ad_completed
  FROM public.addsactive
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    SELECT 
      cost_per_impression,
      COALESCE(user_frequency_cap, 1),
      COALESCE(impressions, 0),
      COALESCE(impression_count, 0),
      (completed_at IS NOT NULL)
    INTO 
      v_raw_cpi,
      v_user_freq_cap,
      v_impressions_target,
      v_impressions_count,
      v_ad_completed
    FROM public.adds
    WHERE id = p_ad_id;
  END IF;

  IF v_ad_completed OR (v_impressions_target > 0 AND v_impressions_count >= v_impressions_target) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CAMPAIGN_COMPLETED',
      'error', 'This ad campaign has completed its impression budget.'
    );
  END IF;

  IF v_raw_cpi IS NULL OR v_raw_cpi <= 0 THEN
    v_raw_cpi := GREATEST(COALESCE(p_expected_rate / 0.50, 25.00), 25.00);
  END IF;

  -- 4. Check Frequency Cap per User
  SELECT COALESCE(view_count, 0) INTO v_existing_views
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND lower(user_email) = v_email_lower
  FOR UPDATE;

  IF FOUND AND v_existing_views >= v_user_freq_cap THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_EARNED',
      'error', 'Frequency cap reached for this ad campaign.',
      'views', v_existing_views,
      'cap', v_user_freq_cap
    );
  END IF;

  -- 5. Dynamic 50% Viewer / 50% Platform Revenue Share Calculation
  v_earn_rate := ROUND((v_raw_cpi * 0.50)::numeric, 2);
  IF v_earn_rate <= 0 THEN
    v_earn_rate := 12.50;
  END IF;

  IF NOT v_is_monetized THEN
    v_earn_rate := 0.00;
  END IF;

  -- 6. Upsert Unique Ad Impression Record
  IF FOUND THEN
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

  UPDATE public.addsactive
  SET 
    impression_count = COALESCE(impression_count, 0) + 1,
    completed_at = CASE 
      WHEN (impressions > 0 AND (COALESCE(impression_count, 0) + 1) >= impressions) THEN now() 
      ELSE completed_at 
    END
  WHERE id = p_ad_id;

  -- 7. Atomically Update Viewer Balance, Clicks & ATW Tier
  v_next_bal := ROUND((v_current_bal + v_earn_rate)::numeric, 2);
  v_next_clicks := v_current_clicks + 1;
  v_next_monetized := CASE WHEN (v_is_monetized OR v_next_clicks >= 300) THEN 'true' ELSE 'false' END;

  UPDATE public.users
  SET 
    balance = v_next_bal,
    monetization_clicks = v_next_clicks,
    atw_tier = CASE
      WHEN v_is_exempt THEN 'Unlimited'
      ELSE 'ATW' || GREATEST(1, FLOOR(v_next_clicks / 300.0)::int)
    END,
    monetized = v_next_monetized,
    last_active_at = now()
  WHERE id = v_user_id;

  -- 8. Credit 10% of Ad CPI to each Active Affiliate from the Platform's 50% share (Lock-Free)
  PERFORM public.credit_affiliate_platform_share_atomic(v_raw_cpi, p_ad_id, v_email_lower);

  -- Refresh viewer balance in case viewer is also one of the Affiliates!
  IF v_is_affiliate OR v_email_lower IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com') THEN
    SELECT COALESCE(balance, v_next_bal) INTO v_next_bal
    FROM public.users
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'EARN_SUCCESS',
    'amount', v_earn_rate,
    'raw_cpi', v_raw_cpi,
    'balance', v_next_bal,
    'clicks', v_next_clicks,
    'views', COALESCE(v_existing_views, 0) + 1,
    'cap', v_user_freq_cap,
    'monetized', (v_next_monetized = 'true'),
    'device_id', p_device_id,
    'affiliate_credited', true
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

-- 9. Update check_and_update_monetization_status & reset_inactive_monetized_users to exempt Career & Affiliate
DROP FUNCTION IF EXISTS public.check_and_update_monetization_status(text) CASCADE;
DROP FUNCTION IF EXISTS public.reset_inactive_monetized_users() CASCADE;
CREATE OR REPLACE FUNCTION public.check_and_update_monetization_status(user_email_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(user_email_param));
  v_user RECORD;
  v_days_inactive NUMERIC := 0;
  v_is_exempt BOOLEAN := FALSE;
BEGIN
  -- Flush any sharded affiliate yield when checking monetization status
  IF v_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com') THEN
    PERFORM public.flush_affiliate_yield_shards_atomic(v_email);
  END IF;

  SELECT id, email, COALESCE(monetization_clicks, 0) AS clicks,
         COALESCE(monetized::text, 'false') AS monetized_str,
         last_active_at, COALESCE(is_affiliate, false) AS is_affiliate,
         COALESCE(is_career, false) AS is_career
  INTO v_user
  FROM public.users
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_monetized', false, 'clicks', 0, 'days_inactive', 0, 'was_reset', false);
  END IF;

  v_is_exempt := (
    v_user.is_affiliate
    OR v_user.is_career
    OR v_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
  );

  IF v_is_exempt THEN
    IF v_user.monetized_str NOT IN ('true', 'yes', '1', 't') THEN
      UPDATE public.users SET monetized = 'true' WHERE id = v_user.id;
    END IF;
    RETURN jsonb_build_object(
      'is_monetized', true,
      'clicks', v_user.clicks,
      'days_inactive', 0,
      'was_reset', false
    );
  END IF;

  IF v_user.last_active_at IS NOT NULL THEN
    v_days_inactive := FLOOR(EXTRACT(EPOCH FROM (now() - v_user.last_active_at)) / 86400);
  END IF;

  IF v_days_inactive >= 7 AND (v_user.monetized_str IN ('true', 'yes', '1', 't') OR v_user.clicks > 0) THEN
    UPDATE public.users
    SET monetized = 'false',
        monetization_clicks = 0,
        last_active_at = now()
    WHERE id = v_user.id;

    RETURN jsonb_build_object(
      'is_monetized', false,
      'clicks', 0,
      'days_inactive', 0,
      'was_reset', true
    );
  END IF;

  RETURN jsonb_build_object(
    'is_monetized', (v_user.monetized_str IN ('true', 'yes', '1', 't') OR v_user.clicks >= 300),
    'clicks', v_user.clicks,
    'days_inactive', v_days_inactive,
    'was_reset', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_inactive_monetized_users()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH updated AS (
    UPDATE public.users
    SET monetized = 'false',
        monetization_clicks = 0
    WHERE last_active_at < (now() - INTERVAL '7 days')
      AND (COALESCE(monetized::text, 'false') IN ('true', 'yes', '1', 't') OR COALESCE(monetization_clicks, 0) > 0)
      AND COALESCE(is_affiliate, false) = false
      AND COALESCE(is_career, false) = false
      AND lower(trim(email)) NOT IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flush_affiliate_yield_shards_atomic(TEXT) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.credit_affiliate_platform_share_atomic(NUMERIC, UUID, TEXT) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_and_update_monetization_status(TEXT) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.reset_inactive_monetized_users() TO service_role;

COMMIT;
