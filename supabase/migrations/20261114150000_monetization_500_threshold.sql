-- Migration: 20261114150000_monetization_500_threshold.sql
-- Purpose: Raise monetization unlock & ATW tier step threshold from 300 to 500
--          verified clicks/views across all SQL RPCs while preserving
--          SECURITY DEFINER hardening and service_role-only EXECUTE grants.

BEGIN;

-- 1. compute_atw_level (500 effective clicks per ATW tier; rating bonus * 500)
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

    v_rating_bonus_clicks := FLOOR(GREATEST(0::NUMERIC, v_safe_score - 0.1000) * 500)::INT;
    v_effective_clicks := v_safe_clicks + v_rating_bonus_clicks;

    IF v_effective_clicks >= 500 THEN
        v_computed_level := FLOOR(v_effective_clicks / 500.0)::INT;
    ELSE
        v_computed_level := 1;
    END IF;

    RETURN GREATEST(1, LEAST(14, GREATEST(v_parsed_tier, v_computed_level)));
END;
$$;

-- 2. apply_agent_commission_atomic (>= 500 clicks monetization check)
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

    SELECT
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
    INTO v_earner_is_agent, v_earner_monetized
    FROM public.users
    WHERE lower(email) = v_earner_email
    LIMIT 1;

    IF NOT COALESCE(v_earner_monetized, FALSE) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'EARNER_NOT_MONETIZED');
    END IF;

    v_rate := CASE WHEN v_earner_is_agent THEN 0.0200 ELSE 0.0100 END;
    v_deducted := ROUND(p_gross_amount * v_rate, 2);

    IF v_deducted <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_net_earner := ROUND(p_gross_amount - v_deducted, 2);

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

-- 3. credit_affiliate_platform_share_atomic (>= 500 clicks monetization check)
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

    IF v_earner <> '' THEN
        SELECT (
            NOT EXISTS (SELECT 1 FROM public.deactivated_users du WHERE du.email = v_earner)
            AND EXISTS (
                SELECT 1 FROM public.users u
                WHERE lower(u.email) = v_earner
                  AND COALESCE(u.has_cancelled_monetization, FALSE) = FALSE
                  AND (
                    COALESCE(u.monetized::text, 'false') IN ('true', 'yes', '1', 't')
                    OR COALESCE(u.monetization_clicks, 0) >= 500
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

-- 4. claim_ad_earning_atomic (5-arg rollover version with >= 500 clicks unlock)
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
            OR v_current_clicks >= 500
            OR v_ref_downloads >= 12
            OR v_is_exempt
        )
    );

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

    v_next_clicks := v_current_clicks + 1;
    v_next_level := public.compute_atw_level(v_next_clicks, v_attention_score, v_current_tier);
    v_next_tier := CASE WHEN v_is_exempt THEN 'Unlimited' ELSE 'ATW' || v_next_level::TEXT END;
    v_holding_cap := CASE
        WHEN v_is_exempt THEN 999999999.00
        ELSE (v_next_level * 30000.00)::NUMERIC(12,2)
    END;

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

    v_next_monetized := CASE
        WHEN v_has_cancelled THEN 'false'
        WHEN (v_is_monetized OR v_next_clicks >= 500) THEN 'true'
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

-- 5. check_and_update_monetization_status (>= 500 clicks threshold)
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
  IF v_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com') THEN
    PERFORM public.flush_affiliate_yield_shards_atomic(v_email);
  END IF;

  SELECT id, email, COALESCE(monetization_clicks, 0) AS clicks,
         COALESCE(monetized::text, 'false') AS monetized_str,
         COALESCE(has_cancelled_monetization, false) AS has_cancelled,
         last_active_at, COALESCE(is_affiliate, false) AS is_affiliate,
         COALESCE(is_career, false) AS is_career
  INTO v_user
  FROM public.users
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_monetized', false,
      'has_cancelled', false,
      'clicks', 0,
      'days_inactive', 0,
      'was_reset', false
    );
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
      'has_cancelled', false,
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
      'has_cancelled', v_user.has_cancelled,
      'clicks', 0,
      'days_inactive', 0,
      'was_reset', true
    );
  END IF;

  IF v_user.has_cancelled THEN
    IF v_user.monetized_str IN ('true', 'yes', '1', 't') THEN
      UPDATE public.users SET monetized = 'false' WHERE id = v_user.id;
    END IF;
    RETURN jsonb_build_object(
      'is_monetized', false,
      'has_cancelled', true,
      'clicks', v_user.clicks,
      'days_inactive', v_days_inactive,
      'was_reset', false
    );
  END IF;

  RETURN jsonb_build_object(
    'is_monetized', (v_user.monetized_str IN ('true', 'yes', '1', 't') OR v_user.clicks >= 500),
    'has_cancelled', false,
    'clicks', v_user.clicks,
    'days_inactive', v_days_inactive,
    'was_reset', false
  );
END;
$$;

-- 6. increment_user_click_progress (>= 500 clicks threshold)
CREATE OR REPLACE FUNCTION public.increment_user_click_progress(
  p_email TEXT,
  p_count INT DEFAULT 1
)
RETURNS TABLE (
  new_click_count INT,
  is_now_monetized BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_lower TEXT;
  v_current_clicks INT;
  v_is_monetized BOOLEAN;
  v_has_cancelled BOOLEAN;
  v_last_active TIMESTAMPTZ;
  v_days_diff INT;
  v_increment INT;
BEGIN
  v_email_lower := lower(trim(p_email));
  v_increment := GREATEST(1, COALESCE(p_count, 1));

  SELECT
    COALESCE(monetization_clicks, 0),
    CASE
      WHEN monetized::text = 'true' OR monetized::text = 'yes' OR monetized::text = '1' THEN true
      ELSE false
    END,
    COALESCE(has_cancelled_monetization, false),
    COALESCE(last_active_at, timezone('utc'::text, now()))
  INTO v_current_clicks, v_is_monetized, v_has_cancelled, v_last_active
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_days_diff := EXTRACT(DAY FROM (timezone('utc'::text, now()) - v_last_active))::INT;

  IF v_days_diff >= 7 AND NOT v_has_cancelled THEN
    v_current_clicks := 0;
    v_is_monetized := false;
  END IF;

  v_current_clicks := v_current_clicks + v_increment;

  IF v_has_cancelled THEN
    v_is_monetized := false;
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = 'false',
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  ELSIF v_current_clicks >= 500 THEN
    v_is_monetized := true;
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = 'true',
        monetized_at = COALESCE(monetized_at, timezone('utc'::text, now())),
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  ELSE
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = CASE WHEN v_is_monetized THEN 'true' ELSE 'false' END,
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  END IF;

  RETURN QUERY SELECT v_current_clicks, v_is_monetized;
END;
$$;

-- 7. run_database_cleanup_cron (< 500 stale clicks reset threshold)
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

-- Re-assert strict service_role EXECUTE lockdown on all SECURITY DEFINER RPCs touched above
REVOKE ALL ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.credit_affiliate_platform_share_atomic(NUMERIC, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_affiliate_platform_share_atomic(NUMERIC, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.check_and_update_monetization_status(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_update_monetization_status(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.increment_user_click_progress(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_click_progress(TEXT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.run_database_cleanup_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_database_cleanup_cron() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
