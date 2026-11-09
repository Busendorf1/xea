-- Migration: 20261109090000_monetization_opt_out_hardening.sql
-- Description: 
-- 1. Hardens monetization opt-out (has_cancelled_monetization).
-- 2. Enforces ATW Holding Cap overflow forfeiture in claim_ad_earning_atomic.
-- 3. Implements 60-day dormant balance forfeiture (forfeit_dormant_user_balances_60_days) and hooks into cleanup cron.
-- 4. Ensures case-insensitive username index for zero-table-scan P2P transfers.

-- 1. Add has_cancelled_monetization column if it doesn't already exist
ALTER TABLE IF EXISTS public.users
ADD COLUMN IF NOT EXISTS has_cancelled_monetization BOOLEAN DEFAULT FALSE;

-- 2. Fast lookup indexes for opt-out status and case-insensitive username transfers
CREATE INDEX IF NOT EXISTS idx_users_has_cancelled_monetization
ON public.users (has_cancelled_monetization);

CREATE INDEX IF NOT EXISTS idx_users_lower_username
ON public.users (lower(username));

-- 3. Update check_and_update_monetization_status to respect manual opt-out
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

  -- 7-Day Inactivity Rule: If inactive for 7 or more days, reset clicks
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

  -- If user manually cancelled monetization, seen count continues but they strictly STAY UNMONETIZED
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
    'is_monetized', (v_user.monetized_str IN ('true', 'yes', '1', 't') OR v_user.clicks >= 300),
    'has_cancelled', false,
    'clicks', v_user.clicks,
    'days_inactive', v_days_inactive,
    'was_reset', false
  );
END;
$$;

-- 4. Update increment_user_click_progress to respect manual opt-out
CREATE OR REPLACE FUNCTION public.increment_user_click_progress(
  p_email TEXT,
  p_count INT DEFAULT 1
)
RETURNS TABLE (
  new_click_count INT,
  is_now_monetized BOOLEAN
) AS $$
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

  -- Reset if inactive for 7+ days (unless exempt)
  IF v_days_diff >= 7 AND NOT v_has_cancelled THEN
    v_current_clicks := 0;
    v_is_monetized := false;
  END IF;

  v_current_clicks := v_current_clicks + v_increment;

  -- If user manually cancelled monetization, seen count increments but they STAY UNMONETIZED
  IF v_has_cancelled THEN
    v_is_monetized := false;
    UPDATE public.users
    SET monetization_clicks = v_current_clicks,
        monetized = 'false',
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;
  ELSIF v_current_clicks >= 300 THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update claim_ad_earning_atomic:
-- (a) Enforces ATW Holding Cap overflow forfeiture (subsequent earnings forfeited to platform liquidity if balance >= cap)
-- (b) Enforces manual opt-out check (cancelled users earn 0 and stay unmonetized)
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
  v_has_cancelled      BOOLEAN := FALSE;
  v_ref_downloads      INT;
  v_suspended_until    TIMESTAMP WITH TIME ZONE;
  v_is_affiliate       BOOLEAN := FALSE;
  v_is_career          BOOLEAN := FALSE;
  v_is_exempt          BOOLEAN := FALSE;
  v_is_monetized       BOOLEAN;
  v_raw_cpi            NUMERIC(12,2);
  v_earn_rate          NUMERIC(12,2);
  v_holding_cap        NUMERIC(14,2);
  v_is_capped          BOOLEAN := FALSE;
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
    COALESCE(has_cancelled_monetization, false),
    COALESCE(referral_downloads_count, 0),
    suspended_until,
    COALESCE(is_affiliate, FALSE),
    COALESCE(is_career, FALSE)
  INTO 
    v_user_id,
    v_current_bal,
    v_current_clicks,
    v_monetized_val,
    v_has_cancelled,
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
    OR (
      NOT v_has_cancelled AND (
        v_monetized_val IN ('true', 'yes', '1', 't')
        OR v_current_clicks >= 300
        OR v_ref_downloads >= 12
      )
    )
  );

  -- 2. Check Suspension Status
  IF NOT v_is_exempt AND v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'USER_SUSPENDED',
      'error', 'Account is currently suspended.',
      'suspended_until', v_suspended_until
    );
  END IF;

  -- 3. Resolve Ad Details
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

  -- 5. Calculate 50% Revenue Share
  v_earn_rate := ROUND((v_raw_cpi * 0.50)::numeric, 2);
  IF v_earn_rate <= 0 THEN
    v_earn_rate := 12.50;
  END IF;

  IF NOT v_is_monetized THEN
    v_earn_rate := 0.00;
  END IF;

  -- 6. ATW Holding Cap Enforcement (Terms Section 3.3)
  -- ATW1: ₦30,000, ATW2: ₦60,000, ATW3: ₦90,000. Exempt/Career/Affiliate: Unlimited.
  v_holding_cap := CASE
    WHEN v_is_exempt THEN 999999999.00
    ELSE GREATEST(1, LEAST(3, FLOOR((v_current_clicks + 1) / 300.0)::int + 1)) * 30000.00
  END;

  -- If user's balance already meets or exceeds holding cap, earnings are forfeited to platform liquidity
  IF v_current_bal >= v_holding_cap THEN
    v_is_capped := true;
    v_earn_rate := 0.00;
  END IF;

  -- 7. Upsert Impression Record
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

  -- 8. Atomically Update Viewer Balance, Clicks & ATW Tier
  v_next_bal := LEAST(v_holding_cap, ROUND((v_current_bal + v_earn_rate)::numeric, 2));
  v_next_clicks := v_current_clicks + 1;
  v_next_monetized := CASE 
    WHEN v_has_cancelled THEN 'false'
    WHEN (v_is_monetized OR v_next_clicks >= 300) THEN 'true' 
    ELSE 'false' 
  END;

  UPDATE public.users
  SET 
    balance = v_next_bal,
    monetization_clicks = v_next_clicks,
    atw_tier = CASE
      WHEN v_is_exempt THEN 'Unlimited'
      ELSE 'ATW' || GREATEST(1, LEAST(3, FLOOR(v_next_clicks / 300.0)::int + 1))
    END,
    monetized = v_next_monetized,
    last_active_at = now()
  WHERE id = v_user_id;

  -- 9. Credit Affiliate Platform Share (Lock-Free)
  PERFORM public.credit_affiliate_platform_share_atomic(v_raw_cpi, p_ad_id, v_email_lower);

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
    'holding_cap', v_holding_cap,
    'is_capped', v_is_capped,
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

-- 6. Automated 60-Day Dormant Account Balance Forfeiture (Terms Section 3.5 & Policy Section VII)
CREATE OR REPLACE FUNCTION public.forfeit_dormant_user_balances_60_days()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_total_forfeited NUMERIC(15,2) := 0.00;
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, email, username, balance
    FROM public.users
    WHERE balance > 0
      AND (is_affiliate IS NOT TRUE AND is_career IS NOT TRUE)
      AND lower(email) NOT IN ('nonsom019@gmail.com', 'nonsom2023@gmail.com')
      AND last_active_at IS NOT NULL
      AND last_active_at < NOW() - INTERVAL '60 days'
    FOR UPDATE
  LOOP
    -- Insert into public.forfeited_balances audit ledger
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

    -- Zero out balance, revoke monetization & reset clicks
    UPDATE public.users
    SET balance = 0.00,
        monetized = 'false',
        monetization_clicks = 0
    WHERE id = r.id;

    v_count := v_count + 1;
    v_total_forfeited := v_total_forfeited + r.balance;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dormant_accounts_forfeited', v_count,
    'total_amount_forfeited', v_total_forfeited,
    'executed_at', NOW()
  );
END;
$$;

-- 7. Hook 60-day dormant forfeiture and 7-day inactive reset into Database Cleanup Cron
CREATE OR REPLACE FUNCTION public.run_database_cleanup_cron()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_ads INT := 0;
  v_expired_news INT := 0;
  v_completed_ads INT := 0;
  v_tickets INT := 0;
  v_cooldowns INT := 0;
  v_inactive_resets INT := 0;
  v_dormant_res JSONB;
BEGIN
  -- 1. Purge expired approved campaigns (> 3 days)
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

  -- 2. Archive and purge completed ads older than 48 hours
  DELETE FROM public.completed_ads
  WHERE completed_at < NOW() - INTERVAL '48 hours';
  GET DIAGNOSTICS v_completed_ads = ROW_COUNT;

  -- 3. Purge resolved help tickets older than 24 hours
  DELETE FROM public.help_tickets
  WHERE resolved_at IS NOT NULL
    AND resolved_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_tickets = ROW_COUNT;

  -- 4. Lift expired account suspensions / pacing cooldowns
  UPDATE public.users
  SET suspended_until = NULL
  WHERE suspended_until IS NOT NULL AND suspended_until < NOW();
  GET DIAGNOSTICS v_cooldowns = ROW_COUNT;

  -- 5. 7-Day Inactivity: Revoke monetization & reset click progress (Balances preserved)
  v_inactive_resets := public.reset_inactive_monetized_users();

  -- 6. 60-Day Dormant Account Forfeiture: Zero dormant balances & record into audit ledger
  v_dormant_res := public.forfeit_dormant_user_balances_60_days();

  RETURN jsonb_build_object(
    'success', true,
    'expired_approved_ads_purged', v_expired_ads,
    'expired_approved_news_purged', v_expired_news,
    'completed_ads_purged', v_completed_ads,
    'resolved_tickets_purged', v_tickets,
    'cooldowns_cleared', v_cooldowns,
    'inactive_7day_users_reset', v_inactive_resets,
    'dormant_60day_sweep', v_dormant_res,
    'executed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_update_monetization_status(TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.increment_user_click_progress(TEXT, INT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.forfeit_dormant_user_balances_60_days() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_database_cleanup_cron() TO service_role;
