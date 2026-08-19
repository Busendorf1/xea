-- ============================================================
-- MIGRATION: REFERRALS, DUAL MONETIZATION & 100M+ SCALE ATW PROGRESSION
-- Run this script in your Supabase SQL Editor
-- ============================================================

-- 1. Extend public.users columns for Referrals, Monetization & ATW
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_downloads_count INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS monetization_clicks INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS atw_tier VARCHAR(10) DEFAULT 'ATW1';

-- Create high-speed B-Tree indexes
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users (referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users (lower(referred_by));
CREATE INDEX IF NOT EXISTS idx_users_last_active ON public.users (last_active_at);
CREATE INDEX IF NOT EXISTS idx_users_atw_tier ON public.users (atw_tier);

-- 2. Create Referrals table with anti-fraud unique device hashing
CREATE TABLE IF NOT EXISTS public.referrals (
    id BIGSERIAL PRIMARY KEY,
    referrer_email TEXT NOT NULL,
    referee_email TEXT UNIQUE NOT NULL,
    device_hash TEXT NOT NULL,
    ip_address TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' -> 'qualified'
    interactions_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    qualified_at TIMESTAMPTZ
);

-- Unique index on device_hash ensures 1 physical smartphone = max 1 invite credit
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_device_hash ON public.referrals (device_hash);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (lower(referrer_email), status);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON public.referrals (lower(referee_email));

-- 3. Pure Function: Calculate ATW Tier Level from Clicks OR Invites
CREATE OR REPLACE FUNCTION public.calculate_atw_tier(
  p_clicks INT,
  p_invites INT
)
RETURNS VARCHAR(10) AS $$
DECLARE
  v_level_invites INT := 1;
  v_level_clicks INT := 1;
  v_final_level INT := 1;
BEGIN
  -- Level from Invites: 12 base, +1 level every 15 additional invites
  IF COALESCE(p_invites, 0) >= 12 THEN
    v_level_invites := 1 + FLOOR((p_invites - 12) / 15)::INT;
  END IF;

  -- Level from Clicks: 300 base, +1 level every 300 additional clicks
  IF COALESCE(p_clicks, 0) >= 300 THEN
    v_level_clicks := 1 + FLOOR((p_clicks - 300) / 300)::INT;
  END IF;

  -- Highest achieved level between the two paths, capped at ATW14
  v_final_level := LEAST(14, GREATEST(1, GREATEST(v_level_invites, v_level_clicks)));

  RETURN 'ATW' || v_final_level::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Check & Update Monetization Status with Dual Path & 7-Day Inactivity
CREATE OR REPLACE FUNCTION public.check_and_update_monetization_status(
  p_email TEXT
)
RETURNS TABLE (
  monetized BOOLEAN,
  monetization_clicks INT,
  clicks_remaining INT,
  referral_downloads_count INT,
  invites_remaining INT,
  atw_tier VARCHAR(10),
  days_inactive INT,
  status_message TEXT
) AS $$
DECLARE
  v_monetized BOOLEAN;
  v_clicks INT;
  v_invites INT;
  v_last_active TIMESTAMPTZ;
  v_days_diff INT;
  v_tier VARCHAR(10);
  v_email_lower TEXT;
  v_should_monetize BOOLEAN;
BEGIN
  v_email_lower := lower(p_email);

  SELECT 
    (u.monetized = 'yes' OR u.monetized = 'true' OR u.monetized = '1'),
    COALESCE(u.monetization_clicks, 0),
    COALESCE(u.referral_downloads_count, 0),
    COALESCE(u.last_active_at, timezone('utc'::text, now())),
    COALESCE(u.atw_tier, 'ATW1')
  INTO v_monetized, v_clicks, v_invites, v_last_active, v_tier
  FROM public.users u
  WHERE lower(u.email) = v_email_lower;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 300, 0, 12, 'ATW1'::VARCHAR(10), 0, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Calculate days inactive
  v_days_diff := EXTRACT(DAY FROM (timezone('utc'::text, now()) - v_last_active))::INT;

  -- 7-Day Inactivity Rule: Revoke monetization and reset clicks if inactive for 7+ days
  IF v_days_diff >= 7 THEN
    UPDATE public.users
    SET monetized = 'no',
        monetization_clicks = 0,
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;

    -- Insert inactivity notification
    INSERT INTO public.notifications (user_email, title, message)
    VALUES (
      v_email_lower,
      'Monetization Paused (7-Day Inactivity)',
      'Your account was inactive for 7+ days. Monetization status has been reset. Re-qualify via 300 clicks or 12 invites to reactivate.'
    );

    RETURN QUERY SELECT false, 0, 300, v_invites, GREATEST(0, 12 - v_invites), 'ATW1'::VARCHAR(10), v_days_diff, 'Monetization revoked due to 7 consecutive days of inactivity'::TEXT;
    RETURN;
  END IF;

  -- Dual Qualification Check: 300 clicks OR 12 verified invites
  v_should_monetize := (v_clicks >= 300 OR v_invites >= 12);
  v_tier := public.calculate_atw_tier(v_clicks, v_invites);

  IF v_should_monetize AND NOT COALESCE(v_monetized, false) THEN
    UPDATE public.users
    SET monetized = 'yes',
        monetized_at = timezone('utc'::text, now()),
        atw_tier = v_tier,
        last_active_at = timezone('utc'::text, now())
    WHERE lower(email) = v_email_lower;

    v_monetized := true;

    -- Insert monetization welcome notification
    INSERT INTO public.notifications (user_email, title, message)
    VALUES (
      v_email_lower,
      '🎉 Account Monetization Activated!',
      'Congratulations! You have qualified for full account monetization. You can now earn rewards on ad interactions.'
    );
  ELSE
    -- Keep ATW tier up to date
    UPDATE public.users
    SET atw_tier = v_tier
    WHERE lower(email) = v_email_lower;
  END IF;

  RETURN QUERY SELECT 
    v_monetized,
    v_clicks,
    GREATEST(0, 300 - v_clicks),
    v_invites,
    GREATEST(0, 12 - v_invites),
    v_tier,
    v_days_diff,
    CASE WHEN v_monetized THEN 'Monetized Active' ELSE 'In Progress' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Qualify Referral on Interacting (5 Feed Interactions Required)
CREATE OR REPLACE FUNCTION public.qualify_referral_on_interaction(
  p_referee_email TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_ref_id BIGINT;
  v_referrer TEXT;
  v_curr_count INT;
  v_status VARCHAR(20);
  v_new_invites INT;
  v_new_tier VARCHAR(10);
BEGIN
  SELECT id, lower(referrer_email), interactions_count, status
  INTO v_ref_id, v_referrer, v_curr_count, v_status
  FROM public.referrals
  WHERE lower(referee_email) = lower(p_referee_email);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Already qualified
  IF v_status = 'qualified' THEN
    RETURN TRUE;
  END IF;

  v_curr_count := v_curr_count + 1;

  -- If reached 5 interactions, qualify the referral!
  IF v_curr_count >= 5 THEN
    UPDATE public.referrals
    SET status = 'qualified',
        interactions_count = v_curr_count,
        qualified_at = timezone('utc'::text, now())
    WHERE id = v_ref_id;

    -- Increment referrer's qualified count
    UPDATE public.users
    SET referral_downloads_count = COALESCE(referral_downloads_count, 0) + 1
    WHERE lower(email) = v_referrer
    RETURNING referral_downloads_count INTO v_new_invites;

    -- Recalculate referrer's ATW tier & check monetization
    IF v_new_invites IS NOT NULL THEN
      PERFORM public.check_and_update_monetization_status(v_referrer);
    END IF;

    -- Notify referrer
    INSERT INTO public.notifications (user_email, title, message)
    VALUES (
      v_referrer,
      '🎉 Referral Qualified!',
      'Your invited friend has completed initial interactions. You earned +1 Qualified Download Invite!'
    );

    RETURN TRUE;
  ELSE
    UPDATE public.referrals
    SET interactions_count = v_curr_count
    WHERE id = v_ref_id;
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. High-Performance Bulk Earn Handler for 100M+ Scale Batch Flushing
CREATE OR REPLACE FUNCTION public.bulk_handle_earn_clicks(
  p_ad_ids UUID[],
  p_user_emails TEXT[]
)
RETURNS TABLE (
  processed_count INT,
  total_credited NUMERIC
) AS $$
DECLARE
  v_count INT := 0;
  v_total NUMERIC := 0.00;
  i INT;
  v_ad_id UUID;
  v_user_email TEXT;
  v_rate NUMERIC;
BEGIN
  IF array_length(p_ad_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0.00::NUMERIC;
    RETURN;
  END IF;

  FOR i IN 1..array_length(p_ad_ids, 1) LOOP
    v_ad_id := p_ad_ids[i];
    v_user_email := lower(p_user_emails[i]);

    BEGIN
      -- Execute individual earn logic with rate calculation
      SELECT public.handle_earn_click(v_ad_id, v_user_email) INTO v_rate;
      IF v_rate > 0 THEN
        v_total := v_total + v_rate;
        v_count := v_count + 1;
      END IF;

      -- Check referral interaction qualification for this user
      PERFORM public.qualify_referral_on_interaction(v_user_email);
    EXCEPTION WHEN OTHERS THEN
      -- Log and proceed with remainder of batch
      RAISE WARNING 'Earn batch error for ad % and user %: %', v_ad_id, v_user_email, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_count, v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Secure User Notification Deletion (Selected or All)
CREATE OR REPLACE FUNCTION public.delete_user_notifications(
  p_user_email TEXT,
  p_notification_ids BIGINT[],
  p_all BOOLEAN DEFAULT FALSE
)
RETURNS INT AS $$
DECLARE
  v_deleted INT := 0;
BEGIN
  IF p_all THEN
    WITH del AS (
      DELETE FROM public.notifications
      WHERE lower(user_email) = lower(p_user_email)
      RETURNING id
    )
    SELECT COUNT(*)::INT INTO v_deleted FROM del;
  ELSIF p_notification_ids IS NOT NULL AND array_length(p_notification_ids, 1) > 0 THEN
    WITH del AS (
      DELETE FROM public.notifications
      WHERE lower(user_email) = lower(p_user_email)
        AND id = ANY(p_notification_ids)
      RETURNING id
    )
    SELECT COUNT(*)::INT INTO v_deleted FROM del;
  END IF;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Auto-provision referral code generation trigger
CREATE OR REPLACE FUNCTION public.trg_generate_user_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := UPPER(SUBSTRING(MD5(NEW.email || RANDOM()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_referral_code ON public.users;
CREATE TRIGGER trg_assign_referral_code
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
WHEN (NEW.referral_code IS NULL OR NEW.referral_code = '')
EXECUTE FUNCTION public.trg_generate_user_referral_code();

-- Initialize referral codes for any existing users
UPDATE public.users
SET referral_code = UPPER(SUBSTRING(MD5(email || id::TEXT) FROM 1 FOR 8))
WHERE referral_code IS NULL OR referral_code = '';

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.calculate_atw_tier(INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_update_monetization_status(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qualify_referral_on_interaction(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_handle_earn_clicks(UUID[], TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_notifications(TEXT, BIGINT[], BOOLEAN) TO anon, authenticated, service_role;
