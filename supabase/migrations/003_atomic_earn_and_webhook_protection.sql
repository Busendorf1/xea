-- ============================================================================
-- MIGRATION 003: GOOGLE-STANDARD ATOMIC EARNING & MULTI-DEVICE FRAUD PROTECTION
-- ============================================================================

-- 1. High-Performance Indexes for 100M+ Scale Lookups
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_user ON public.ad_impressions (ad_id, lower(user_email));
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (lower(trim(email)));
CREATE INDEX IF NOT EXISTS idx_addsactive_id_cpi ON public.addsactive (id, cost_per_impression);

-- 2. Atomic Stored Procedure: claim_ad_earning_atomic
-- Guarantees single-execution ACID transaction in PostgreSQL.
-- Prevents multi-device concurrent double-spending or duplicate earning.
CREATE OR REPLACE FUNCTION public.claim_ad_earning_atomic(
  p_ad_id UUID,
  p_user_email TEXT,
  p_expected_rate NUMERIC DEFAULT 25.00,
  p_device_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_email_lower      TEXT;
  v_user_id          UUID;
  v_current_bal      NUMERIC(12,2);
  v_current_clicks   INT;
  v_monetized_val    TEXT;
  v_ref_downloads    INT;
  v_suspended_until  TIMESTAMP WITH TIME ZONE;
  v_is_monetized     BOOLEAN;
  v_rate             NUMERIC(12,2);
  v_next_bal         NUMERIC(12,2);
  v_next_clicks      INT;
  v_next_monetized   TEXT;
  v_existing_imp     RECORD;
  v_ad_exists        BOOLEAN;
BEGIN
  v_email_lower := lower(trim(p_user_email));

  -- 1. Row Lock on User Profile (Serialized Transaction Isolation)
  SELECT 
    id, 
    COALESCE(balance, 0.00), 
    COALESCE(monetization_clicks, 0), 
    COALESCE(monetized::text, 'false'), 
    COALESCE(referral_downloads_count, 0),
    suspended_until
  INTO 
    v_user_id,
    v_current_bal,
    v_current_clicks,
    v_monetized_val,
    v_ref_downloads,
    v_suspended_until
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

  -- 2. Check Suspension Status
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
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

  -- If campaign has finished its total impression budget
  IF v_ad_completed OR (v_impressions_target > 0 AND v_impressions_count >= v_impressions_target) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CAMPAIGN_COMPLETED',
      'error', 'This ad campaign has completed its impression budget.'
    );
  END IF;

  -- 4. Check Frequency Cap per User (Supports Retargeting across all devices)
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

  -- 5. Calculate Monetization Status (Monetized if explicitly monetized, 300+ clicks, or 12+ referral downloads)
  v_is_monetized := (
    v_monetized_val = 'yes' OR 
    v_monetized_val = 'true' OR 
    v_monetized_val = 't' OR 
    v_monetized_val = '1' OR 
    v_current_clicks >= 300 OR 
    v_ref_downloads >= 12
  );

  IF v_raw_cpi IS NULL OR v_raw_cpi <= 0 THEN
    v_raw_cpi := p_expected_rate / 0.60;
  END IF;

  -- Dynamic 60% Revenue Share Calculation (Viewer earns exactly 60% of the ad budget/CPI)
  v_rate := ROUND((v_raw_cpi * 0.60)::numeric, 2);

  -- If user is not yet monetized, earnings are 0, but clicks count towards monetization
  IF NOT v_is_monetized THEN
    v_rate := 0.00;
  END IF;

  -- 6. Upsert Unique Ad Impression Record (Increment view_count across all devices)
  INSERT INTO public.ad_impressions (
    ad_id,
    user_email,
    view_count,
    last_viewed_at
  ) VALUES (
    p_ad_id,
    v_email_lower,
    1,
    now()
  )
  ON CONFLICT (ad_id, user_email)
  DO UPDATE SET 
    view_count = public.ad_impressions.view_count + 1,
    last_viewed_at = now();

  -- Increment impression count on active ad
  UPDATE public.addsactive
  SET 
    impression_count = COALESCE(impression_count, 0) + 1,
    completed_at = CASE 
      WHEN (impressions > 0 AND (COALESCE(impression_count, 0) + 1) >= impressions) THEN now() 
      ELSE completed_at 
    END
  WHERE id = p_ad_id;

  -- 7. Atomically Update User Balance & Monetization Clicks
  v_next_bal := ROUND((v_current_bal + v_rate)::numeric, 2);
  v_next_clicks := v_current_clicks + 1;
  v_next_monetized := CASE WHEN (v_is_monetized OR v_next_clicks >= 300) THEN 'true' ELSE 'false' END;

  UPDATE public.users
  SET 
    balance = v_next_bal,
    monetization_clicks = v_next_clicks,
    monetized = v_next_monetized,
    last_active_at = now()
  WHERE id = v_user_id;

  -- 8. Return Atomic JSON Response
  RETURN jsonb_build_object(
    'success', true,
    'code', 'EARN_SUCCESS',
    'amount', v_rate,
    'balance', v_next_bal,
    'clicks', v_next_clicks,
    'views', COALESCE(v_existing_views, 0) + 1,
    'cap', v_user_freq_cap,
    'monetized', (v_next_monetized = 'true'),
    'device_id', p_device_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_EARNED',
      'error', 'This ad reward has already been claimed on your account.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DB_ERROR',
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT) TO service_role, authenticated, anon;
