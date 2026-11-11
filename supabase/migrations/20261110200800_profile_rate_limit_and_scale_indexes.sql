-- ==============================================================================
-- 20261110200800_profile_rate_limit_and_scale_indexes.sql
-- 1. High-Performance B-tree Indexes for 500M+ Scale & Fast Monetization Checks
-- 2. 15-Day Profile Update Rate Limit Enforced in PostgreSQL Security Definer RPC
-- ==============================================================================

-- 1. High-Speed B-tree Indexes for 500M+ Scale Lookups
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(trim(email)));
CREATE INDEX IF NOT EXISTS idx_users_lower_username ON public.users (lower(trim(username)));
CREATE INDEX IF NOT EXISTS idx_users_monetization_lookup ON public.users (lower(trim(email)), monetized, monetization_clicks);

-- 2. Update update_user_profile RPC with 15-Day Rate Limiting & Grants
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
DECLARE
  v_normalized_email text := lower(trim(p_email));
  v_existing record;
BEGIN
  SELECT "lastUpdated", has_updated_profile, phone INTO v_existing 
  FROM public.users 
  WHERE lower(email) = v_normalized_email;

  -- 15-Day Rate Limit Enforcement: Block updating demographics if within 15 days of last update
  IF v_existing.has_updated_profile = TRUE AND v_existing."lastUpdated" IS NOT NULL THEN
    IF (NOW() - v_existing."lastUpdated") < INTERVAL '15 days' THEN
      -- If demographic or core targeting fields are being updated, enforce 15-day limit
      IF p_dob IS NOT NULL OR p_country IS NOT NULL OR p_state IS NOT NULL OR p_location IS NOT NULL 
         OR p_gender IS NOT NULL OR p_employment IS NOT NULL OR p_industry IS NOT NULL OR p_interest IS NOT NULL THEN
        RAISE EXCEPTION 'You can only update your profile once every 15 days.';
      END IF;
    END IF;
  END IF;

  -- Verify phone uniqueness if it is being changed
  IF p_phone IS NOT NULL AND p_phone IS DISTINCT FROM v_existing.phone THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE phone = p_phone AND lower(email) != v_normalized_email) THEN
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
    has_updated_profile = TRUE,
    "lastUpdated" = NOW()
  WHERE lower(email) = v_normalized_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant Explicit Execute Rights Exclusively to Service Role
REVOKE ALL ON FUNCTION public.update_user_profile FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_profile TO service_role;
