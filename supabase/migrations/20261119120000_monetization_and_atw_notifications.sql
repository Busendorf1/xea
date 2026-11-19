-- ==============================================================================
-- Migration: 20261119120000_monetization_and_atw_notifications.sql
-- Purpose:
--   1. Atomically update `atw_tier`, `monetized`, and `monetized_at` AND insert
--      deduplicated congratulatory notifications in `public.notifications` when
--      a user reaches 500 clicks/seen and unlocks monetization (ATW1) or upgrades
--      to ATW2..ATW14 inside `increment_user_click_progress`,
--      `claim_ad_earning_atomic`, and `check_and_update_monetization_status`.
--   2. Return `prev_monetized`, `prev_atw_tier`, `is_monetized`, `monetized`,
--      `has_cancelled_monetization`, `attention_worth_score`, `atw_level`,
--      `monetization_notified`, and `atw_notified` from `claim_ad_earning_atomic`
--      so Web & Mobile callers have authoritative milestone telemetry.
--   3. Preserve strict SECURITY DEFINER & service_role-only EXECUTE lockdown.
-- ==============================================================================

BEGIN;

-- 1. increment_user_click_progress: 500-click monetization unlock + ATW tier sync + notifications
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
  v_user_id UUID;
  v_prev_clicks INT;
  v_current_clicks INT;
  v_was_monetized BOOLEAN;
  v_is_monetized BOOLEAN;
  v_has_cancelled BOOLEAN;
  v_is_affiliate BOOLEAN;
  v_is_career BOOLEAN;
  v_is_exempt BOOLEAN := FALSE;
  v_attention_score NUMERIC(12,4);
  v_current_tier TEXT;
  v_old_level INT;
  v_new_level INT;
  v_next_tier TEXT;
  v_last_active TIMESTAMPTZ;
  v_days_diff INT;
  v_increment INT;
BEGIN
  v_email_lower := lower(trim(COALESCE(p_email, '')));
  v_increment := GREATEST(1, COALESCE(p_count, 1));

  IF v_email_lower = '' THEN
    RETURN;
  END IF;

  SELECT
    id,
    COALESCE(monetization_clicks, 0),
    CASE
      WHEN lower(COALESCE(monetized::text, 'false')) IN ('true', 'yes', '1', 't') THEN true
      ELSE false
    END,
    COALESCE(has_cancelled_monetization, false),
    COALESCE(is_affiliate, false),
    COALESCE(is_career, false),
    COALESCE(attention_worth_score, 0.1000),
    COALESCE(atw_tier, 'ATW1'),
    COALESCE(last_active_at, timezone('utc'::text, now()))
  INTO
    v_user_id,
    v_prev_clicks,
    v_was_monetized,
    v_has_cancelled,
    v_is_affiliate,
    v_is_career,
    v_attention_score,
    v_current_tier,
    v_last_active
  FROM public.users
  WHERE lower(email) = v_email_lower
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_is_exempt := (
    v_is_affiliate
    OR v_is_career
    OR v_email_lower IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com', 'admin@paayh.com', 'support@paayh.com')
  );

  v_current_clicks := v_prev_clicks;
  v_is_monetized := v_was_monetized;
  v_old_level := public.compute_atw_level(v_prev_clicks, v_attention_score, v_current_tier);

  v_days_diff := EXTRACT(DAY FROM (timezone('utc'::text, now()) - v_last_active))::INT;

  IF NOT v_is_exempt AND v_days_diff >= 7 AND NOT v_has_cancelled THEN
    v_current_clicks := 0;
    v_is_monetized := false;
    v_was_monetized := false;
    v_current_tier := 'ATW1';
    v_old_level := 1;
  END IF;

  v_current_clicks := v_current_clicks + v_increment;
  v_new_level := public.compute_atw_level(v_current_clicks, v_attention_score, v_current_tier);
  v_next_tier := CASE WHEN v_is_exempt THEN 'Unlimited' ELSE 'ATW' || v_new_level::TEXT END;

  IF v_has_cancelled AND NOT v_is_exempt THEN
    v_is_monetized := false;
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = 'false',
        atw_tier = v_next_tier,
        last_active_at = timezone('utc'::text, now())
    WHERE id = v_user_id;
  ELSIF v_is_exempt OR v_current_clicks >= 500 THEN
    v_is_monetized := true;
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = 'true',
        atw_tier = v_next_tier,
        monetized_at = COALESCE(monetized_at, timezone('utc'::text, now())),
        last_active_at = timezone('utc'::text, now())
    WHERE id = v_user_id;
  ELSE
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = CASE WHEN v_is_monetized THEN 'true' ELSE 'false' END,
        atw_tier = v_next_tier,
        last_active_at = timezone('utc'::text, now())
    WHERE id = v_user_id;
  END IF;

  -- Insert deduplicated monetization unlock notification at 500 clicks (non-exempt, non-cancelled)
  IF NOT v_is_exempt
     AND NOT v_has_cancelled
     AND v_is_monetized
     AND v_current_clicks >= 500
     AND (NOT v_was_monetized OR v_prev_clicks < 500 OR v_current_clicks = 500)
     AND to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (user_email, title, message)
    SELECT
      v_email_lower,
      'Monetization Unlocked! Welcome to ATW1',
      'Congratulations! You have reached 500 clicks and unlocked monetization (ATW1, ₦30,000 balance cap). Start earning on ads now, and remember to withdraw promptly.'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE lower(n.user_email) = v_email_lower
        AND n.title = 'Monetization Unlocked! Welcome to ATW1'
        AND n.created_at >= now() - INTERVAL '7 days'
    );
  END IF;

  -- Insert deduplicated ATW level upgrade notification for ATW2..ATW14
  IF NOT v_is_exempt
     AND NOT v_has_cancelled
     AND v_new_level >= 2
     AND v_new_level > v_old_level
     AND to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (user_email, title, message)
    SELECT
      v_email_lower,
      'ATW Level Upgraded to ' || v_next_tier,
      'Congratulations! Your ATW level has increased to ' || v_next_tier ||
      ', raising your new balance cap to ₦' || trim(to_char(v_new_level * 30000, '999,999,990')) ||
      '. Please withdraw your earnings promptly so you don''t hit your limit.'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE lower(n.user_email) = v_email_lower
        AND n.title = 'ATW Level Upgraded to ' || v_next_tier
        AND n.created_at >= now() - INTERVAL '180 days'
    );
  END IF;

  RETURN QUERY SELECT v_current_clicks, v_is_monetized;
END;
$$;

-- 2. claim_ad_earning_atomic: atomic monetization + ATW notifications & full milestone telemetry
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
    v_attention_score NUMERIC(12,4);
    v_current_tier TEXT;
    v_old_level INT;
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
    v_next_monetized_bool BOOLEAN := FALSE;
    v_monetization_notified BOOLEAN := FALSE;
    v_atw_notified BOOLEAN := FALSE;
    v_inserted_rows INT := 0;
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
        COALESCE(attention_worth_score, 0.1000),
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
        OR v_email_lower IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com', 'admin@paayh.com', 'support@paayh.com')
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
    v_old_level := public.compute_atw_level(v_current_clicks, v_attention_score, v_current_tier);

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

    v_next_monetized_bool := (NOT v_has_cancelled AND (v_is_monetized OR v_next_clicks >= 500));
    v_next_monetized := CASE WHEN v_next_monetized_bool THEN 'true' ELSE 'false' END;

    UPDATE public.users
    SET
        balance = v_next_bal,
        monetization_clicks = v_next_clicks,
        atw_tier = v_next_tier,
        monetized = v_next_monetized,
        monetized_at = CASE
            WHEN v_next_monetized_bool THEN COALESCE(monetized_at, now())
            ELSE monetized_at
        END,
        last_active_at = now()
    WHERE id = v_user_id;

    -- Insert deduplicated monetization unlock notification at 500 clicks
    IF NOT v_is_exempt
       AND NOT v_has_cancelled
       AND v_next_monetized_bool
       AND v_next_clicks >= 500
       AND (NOT v_is_monetized OR v_current_clicks < 500 OR v_next_clicks = 500)
       AND to_regclass('public.notifications') IS NOT NULL THEN
        INSERT INTO public.notifications (user_email, title, message)
        SELECT
            v_email_lower,
            'Monetization Unlocked! Welcome to ATW1',
            'Congratulations! You have reached 500 clicks and unlocked monetization (ATW1, ₦30,000 balance cap). Start earning on ads now, and remember to withdraw promptly.'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE lower(n.user_email) = v_email_lower
              AND n.title = 'Monetization Unlocked! Welcome to ATW1'
              AND n.created_at >= now() - INTERVAL '7 days'
        );
        GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
        v_monetization_notified := (v_inserted_rows > 0);
    END IF;

    -- Insert deduplicated ATW upgrade notification for ATW2..ATW14
    IF NOT v_is_exempt
       AND NOT v_has_cancelled
       AND v_next_level >= 2
       AND v_next_level > v_old_level
       AND to_regclass('public.notifications') IS NOT NULL THEN
        INSERT INTO public.notifications (user_email, title, message)
        SELECT
            v_email_lower,
            'ATW Level Upgraded to ' || v_next_tier,
            'Congratulations! Your ATW level has increased to ' || v_next_tier ||
            ', raising your new balance cap to ₦' || trim(to_char(v_next_level * 30000, '999,999,990')) ||
            '. Please withdraw your earnings promptly so you don''t hit your limit.'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE lower(n.user_email) = v_email_lower
              AND n.title = 'ATW Level Upgraded to ' || v_next_tier
              AND n.created_at >= now() - INTERVAL '180 days'
        );
        GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
        v_atw_notified := (v_inserted_rows > 0);
    END IF;

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
        'atw_level', v_next_level,
        'prev_atw_tier', v_current_tier,
        'prev_monetized', v_is_monetized,
        'is_monetized', v_next_monetized_bool,
        'monetized', v_next_monetized_bool,
        'has_cancelled_monetization', v_has_cancelled,
        'attention_worth_score', v_attention_score,
        'monetization_notified', v_monetization_notified,
        'atw_notified', v_atw_notified,
        'views_used', COALESCE(v_existing_views, 0) + 1,
        'max_views', v_effective_cap,
        'effective_user_cap', v_effective_cap,
        'is_rollover', v_is_rollover,
        'broadening_stage', v_broadening_stage
    );
END;
$$;

-- 3. check_and_update_monetization_status: sync monetization/ATW + deduplicated notifications
CREATE OR REPLACE FUNCTION public.check_and_update_monetization_status(user_email_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(user_email_param, '')));
  v_user RECORD;
  v_days_inactive NUMERIC := 0;
  v_is_exempt BOOLEAN := FALSE;
  v_was_monetized BOOLEAN := FALSE;
  v_should_monetize BOOLEAN := FALSE;
  v_old_level INT := 1;
  v_new_level INT := 1;
  v_next_tier TEXT := 'ATW1';
BEGIN
  IF v_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com') THEN
    PERFORM public.flush_affiliate_yield_shards_atomic(v_email);
  END IF;

  SELECT id, email, COALESCE(monetization_clicks, 0) AS clicks,
         lower(COALESCE(monetized::text, 'false')) AS monetized_str,
         COALESCE(has_cancelled_monetization, false) AS has_cancelled,
         COALESCE(attention_worth_score, 0.1000) AS score,
         COALESCE(atw_tier, 'ATW1') AS atw_tier,
         last_active_at, COALESCE(is_affiliate, false) AS is_affiliate,
         COALESCE(is_career, false) AS is_career
  INTO v_user
  FROM public.users
  WHERE lower(trim(email)) = v_email
  LIMIT 1
  FOR UPDATE;

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
    OR v_email IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com', 'admin@paayh.com', 'support@paayh.com')
  );

  IF v_is_exempt THEN
    IF v_user.monetized_str NOT IN ('true', 'yes', '1', 't') OR COALESCE(v_user.atw_tier, '') <> 'Unlimited' THEN
      UPDATE public.users SET monetized = 'true', atw_tier = 'Unlimited' WHERE id = v_user.id;
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
        monetized_at = NULL,
        monetization_clicks = 0,
        atw_tier = 'ATW1',
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

  v_was_monetized := (v_user.monetized_str IN ('true', 'yes', '1', 't'));
  v_should_monetize := (v_was_monetized OR v_user.clicks >= 500);
  v_old_level := CASE
    WHEN v_user.atw_tier ~* '^ATW[0-9]+$' THEN GREATEST(1, LEAST(14, substring(upper(trim(v_user.atw_tier)) from '[0-9]+')::INT))
    ELSE 1
  END;
  v_new_level := public.compute_atw_level(v_user.clicks, v_user.score, v_user.atw_tier);
  v_next_tier := 'ATW' || v_new_level::TEXT;

  IF (v_should_monetize AND NOT v_was_monetized) OR v_next_tier <> v_user.atw_tier THEN
    UPDATE public.users
    SET monetized = CASE WHEN v_should_monetize THEN 'true' ELSE 'false' END,
        monetized_at = CASE WHEN v_should_monetize THEN COALESCE(monetized_at, now()) ELSE monetized_at END,
        atw_tier = v_next_tier
    WHERE id = v_user.id;
  END IF;

  IF v_should_monetize AND NOT v_was_monetized AND v_user.clicks >= 500 AND to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (user_email, title, message)
    SELECT
      v_email,
      'Monetization Unlocked! Welcome to ATW1',
      'Congratulations! You have reached 500 clicks and unlocked monetization (ATW1, ₦30,000 balance cap). Start earning on ads now, and remember to withdraw promptly.'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE lower(n.user_email) = v_email
        AND n.title = 'Monetization Unlocked! Welcome to ATW1'
        AND n.created_at >= now() - INTERVAL '7 days'
    );
  END IF;

  IF v_new_level >= 2 AND v_new_level > v_old_level AND to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (user_email, title, message)
    SELECT
      v_email,
      'ATW Level Upgraded to ' || v_next_tier,
      'Congratulations! Your ATW level has increased to ' || v_next_tier ||
      ', raising your new balance cap to ₦' || trim(to_char(v_new_level * 30000, '999,999,990')) ||
      '. Please withdraw your earnings promptly so you don''t hit your limit.'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE lower(n.user_email) = v_email
        AND n.title = 'ATW Level Upgraded to ' || v_next_tier
        AND n.created_at >= now() - INTERVAL '180 days'
    );
  END IF;

  RETURN jsonb_build_object(
    'is_monetized', v_should_monetize,
    'has_cancelled', false,
    'clicks', v_user.clicks,
    'days_inactive', v_days_inactive,
    'was_reset', false
  );
END;
$$;

-- Re-assert strict service_role EXECUTE lockdown
REVOKE ALL ON FUNCTION public.increment_user_click_progress(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_click_progress(TEXT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.check_and_update_monetization_status(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_update_monetization_status(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
