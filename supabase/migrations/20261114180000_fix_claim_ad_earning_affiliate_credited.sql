-- Migration: 20261114180000_fix_claim_ad_earning_affiliate_credited.sql
-- Purpose: Return explicit 'affiliate_credited' flag from claim_ad_earning_atomic
--          so Web claimProcessor and Web/Mobile earn-payout Edge Functions do NOT
--          invoke credit_affiliate_platform_share_atomic a second time (eliminating
--          2x affiliate over-crediting and cutting affiliate RPC writes by 50%).

BEGIN;

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
    v_affiliate_credited BOOLEAN := FALSE;
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
        IF p_expected_rate IS NOT NULL AND p_expected_rate > 0 THEN
            v_earn_rate := LEAST(
                ROUND((v_raw_cpi * 0.50)::numeric, 2),
                ROUND(p_expected_rate::numeric, 2)
            );
        ELSE
            v_earn_rate := ROUND((v_raw_cpi * 0.30)::numeric, 2);
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
            v_affiliate_credited := TRUE;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'CLAIMED',
        'new_balance', v_next_bal,
        'credited', v_net_credited,
        'net_credited', v_net_credited,
        'affiliate_credited', v_affiliate_credited,
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

REVOKE ALL ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
