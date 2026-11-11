-- Migration: 20261111043000_profile_setup_and_notification_dedup.sql
-- ============================================================================
-- 1. Synchronize has_updated_profile for all existing registered users
-- 2. Add secure get_user_profile_safe RPC to bypass RLS issues on edge failover
-- 3. Clean up any historical duplicate notification rows
-- ============================================================================

-- 1. Synchronize has_updated_profile for accounts with existing profile data or activity
UPDATE public.users
SET has_updated_profile = TRUE
WHERE (has_updated_profile IS NULL OR has_updated_profile = FALSE)
  AND (
    (country IS NOT NULL AND country != 'PLACEHOLDER' AND trim(country) != '')
    OR (state IS NOT NULL AND state != 'PLACEHOLDER' AND trim(state) != '')
    OR (location IS NOT NULL AND location != 'PLACEHOLDER' AND trim(location) != '')
    OR COALESCE(monetization_clicks, 0) > 0
    OR COALESCE(balance, 0) > 0
  );

-- 2. Create high-speed SECURITY DEFINER RPC to safely read user profile on mobile/edge failover
CREATE OR REPLACE FUNCTION public.get_user_profile_safe(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_email TEXT := lower(trim(p_email));
  v_user RECORD;
BEGIN
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('found', false, 'error', 'Email is required');
  END IF;

  SELECT 
    id,
    email,
    username,
    "firstName",
    "lastName",
    "profileImage",
    bio,
    interest,
    industry,
    behavior,
    lifestyle,
    personality,
    gender,
    employment,
    country,
    state,
    location,
    dob,
    business_name,
    monetized,
    monetization_clicks,
    balance,
    withdrawal,
    mutual_count,
    has_updated_profile,
    suspended_until,
    atw_tier,
    is_affiliate,
    is_career,
    created_at
  INTO v_user
  FROM public.users
  WHERE lower(trim(email)) = v_normalized_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'id', v_user.id,
    'email', v_user.email,
    'username', v_user.username,
    'firstName', v_user."firstName",
    'lastName', v_user."lastName",
    'profileImage', v_user."profileImage",
    'bio', v_user.bio,
    'interest', v_user.interest,
    'industry', v_user.industry,
    'behavior', v_user.behavior,
    'lifestyle', v_user.lifestyle,
    'personality', v_user.personality,
    'gender', v_user.gender,
    'employment', v_user.employment,
    'country', v_user.country,
    'state', v_user.state,
    'location', v_user.location,
    'dob', v_user.dob,
    'business_name', v_user.business_name,
    'monetized', v_user.monetized,
    'monetization_clicks', COALESCE(v_user.monetization_clicks, 0),
    'balance', COALESCE(v_user.balance, 0),
    'withdrawal', COALESCE(v_user.withdrawal, 0),
    'mutual_count', COALESCE(v_user.mutual_count, 0),
    'has_updated_profile', COALESCE(v_user.has_updated_profile, false),
    'suspended_until', v_user.suspended_until,
    'atw_tier', v_user.atw_tier,
    'is_affiliate', COALESCE(v_user.is_affiliate, false),
    'is_career', COALESCE(v_user.is_career, false),
    'created_at', v_user.created_at
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_user_profile_safe(TEXT) TO anon, authenticated, service_role;

-- 3. Delete any remaining duplicate notification rows within a 15-minute creation window
DELETE FROM public.notifications n1
USING public.notifications n2
WHERE n1.id < n2.id
  AND lower(trim(n1.user_email)) = lower(trim(n2.user_email))
  AND lower(trim(n1.title)) = lower(trim(n2.title))
  AND lower(trim(n1.message)) = lower(trim(n2.message))
  AND abs(extract(epoch from (n1.created_at - n2.created_at))) < 900;
