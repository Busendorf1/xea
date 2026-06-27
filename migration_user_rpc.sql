-- ============================================================
-- MIGRATION: SECURE RPC FUNCTIONS FOR USER PROVISIONING & UPDATE
-- Run this in your Supabase SQL Editor (New query -> Run)
-- This allows Auth0 server-side routes to manage users securely
-- without exposing direct INSERT/UPDATE table rights to anon clients.
-- ============================================================

-- 1. Create secure auto-provisioning function
CREATE OR REPLACE FUNCTION public.auto_provision_user(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_profile_image text,
  p_business_name text,
  p_phone text,
  p_passphrase text
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.users (
    email,
    username,
    business_name,
    "firstName",
    "lastName",
    "profileImage",
    dob,
    country,
    state,
    location,
    phone,
    passphrase,
    industry,
    interest,
    behavior,
    lifestyle,
    personality,
    intl_travel,
    local_travel,
    balance,
    withdrawal,
    mutual_count,
    mutuals,
    monetized
  ) VALUES (
    p_email,
    p_email,
    p_business_name,
    p_first_name,
    p_last_name,
    p_profile_image,
    '1970-01-01',
    'PLACEHOLDER',
    'PLACEHOLDER',
    'PLACEHOLDER',
    p_phone,
    p_passphrase,
    '{}',
    '{}',
    '{}',
    '{}',
    '{}',
    false,
    false,
    0.00,
    0.00,
    0,
    '{}',
    false
  )
  ON CONFLICT (email) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create secure profile update function
CREATE OR REPLACE FUNCTION public.update_user_profile(
  p_email text,
  p_username text DEFAULT NULL,
  p_dob text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_passphrase text DEFAULT NULL,
  p_industry text[] DEFAULT NULL,
  p_interest text[] DEFAULT NULL,
  p_behavior text[] DEFAULT NULL,
  p_lifestyle text[] DEFAULT NULL,
  p_personality text[] DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_employment text DEFAULT NULL,
  p_intl_travel boolean DEFAULT NULL,
  p_local_travel boolean DEFAULT NULL,
  p_profile_image text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_business_name text DEFAULT NULL,
  p_has_updated_profile boolean DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Verify phone uniqueness if it is being changed
  IF p_phone IS NOT NULL AND p_phone IS DISTINCT FROM (SELECT phone FROM public.users WHERE lower(email) = lower(p_email)) THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE phone = p_phone AND lower(email) != lower(p_email)) THEN
      RAISE EXCEPTION 'This phone number is already in use by another user.';
    END IF;
  END IF;

  UPDATE public.users SET
    username = COALESCE(p_username, username),
    dob = COALESCE(p_dob::date, dob),
    country = COALESCE(p_country, country),
    state = COALESCE(p_state, state),
    location = COALESCE(p_location, location),
    phone = COALESCE(p_phone, phone),
    passphrase = COALESCE(p_passphrase, passphrase),
    industry = COALESCE(p_industry, industry),
    interest = COALESCE(p_interest, interest),
    behavior = COALESCE(p_behavior, behavior),
    lifestyle = COALESCE(p_lifestyle, lifestyle),
    personality = COALESCE(p_personality, personality),
    gender = COALESCE(p_gender, gender),
    employment = COALESCE(p_employment, employment),
    intl_travel = COALESCE(p_intl_travel, intl_travel),
    local_travel = COALESCE(p_local_travel, local_travel),
    "profileImage" = COALESCE(p_profile_image, "profileImage"),
    bio = COALESCE(p_bio, bio),
    business_name = COALESCE(p_business_name, business_name),
    has_updated_profile = COALESCE(p_has_updated_profile, has_updated_profile),
    "lastUpdated" = NOW()
  WHERE lower(email) = lower(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
