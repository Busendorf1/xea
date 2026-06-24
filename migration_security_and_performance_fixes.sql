-- ============================================================
-- MIGRATION: SECURITY & PERFORMANCE OPTIMIZATIONS FOR XEA
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- 1. Enable Row-Level Security (RLS) on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies on users table if any
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- 3. Create RLS Policies for users table
-- Allow users to read only their own profile
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT
  TO authenticated, anon
  USING (lower(auth.jwt() ->> 'email') = lower(email));

-- Allow users to update only their own profile
CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE
  TO authenticated
  USING (lower(auth.jwt() ->> 'email') = lower(email))
  WITH CHECK (lower(auth.jwt() ->> 'email') = lower(email));

-- 4. Create trigger to prevent client-side tampering of balance and monetization columns
CREATE OR REPLACE FUNCTION public.check_user_update_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If the transaction is executed by a client (anon or authenticated role),
  -- block direct modification of financial and membership columns.
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    IF NEW.balance IS DISTINCT FROM OLD.balance THEN
      NEW.balance := OLD.balance;
    END IF;
    IF NEW.withdrawal IS DISTINCT FROM OLD.withdrawal THEN
      NEW.withdrawal := OLD.withdrawal;
    END IF;
    IF NEW.monetized IS DISTINCT FROM OLD.monetized THEN
      NEW.monetized := OLD.monetized;
    END IF;
    IF NEW.monetized_at IS DISTINCT FROM OLD.monetized_at THEN
      NEW.monetized_at := OLD.monetized_at;
    END IF;
    IF NEW.monetized_until IS DISTINCT FROM OLD.monetized_until THEN
      NEW.monetized_until := OLD.monetized_until;
    END IF;
    IF NEW.monetization_type IS DISTINCT FROM OLD.monetization_type THEN
      NEW.monetization_type := OLD.monetization_type;
    END IF;
    IF NEW.suspended_until IS DISTINCT FROM OLD.suspended_until THEN
      NEW.suspended_until := OLD.suspended_until;
    END IF;
    IF NEW.click_timestamps IS DISTINCT FROM OLD.click_timestamps THEN
      NEW.click_timestamps := OLD.click_timestamps;
    END IF;
    IF NEW.mutual_count IS DISTINCT FROM OLD.mutual_count THEN
      NEW.mutual_count := OLD.mutual_count;
    END IF;
    IF NEW.mutuals IS DISTINCT FROM OLD.mutuals THEN
      NEW.mutuals := OLD.mutuals;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prevent_user_field_tampering ON public.users;
CREATE TRIGGER tr_prevent_user_field_tampering
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.check_user_update_fields();

-- 5. Create secure activate_monetization stored procedure (RPC)
CREATE OR REPLACE FUNCTION public.activate_monetization(
  p_email TEXT,
  p_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_caller_email TEXT;
  v_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Authenticate current caller against target email (allow service_role/admin bypass)
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    v_caller_email := auth.jwt() ->> 'email';
    IF lower(v_caller_email) IS NULL OR lower(v_caller_email) != lower(p_email) THEN
      RAISE EXCEPTION 'Access Denied: Caller identity mismatch.';
    END IF;
  END IF;

  IF p_type NOT IN ('standard', 'instant', 'cancel') THEN
    RAISE EXCEPTION 'Invalid monetization type.';
  END IF;

  IF p_type = 'cancel' THEN
    UPDATE public.users
    SET monetized = 'false',
        monetized_at = NULL,
        monetized_until = NULL,
        monetization_type = NULL
    WHERE lower(email) = lower(p_email);
  ELSE
    v_expiry := timezone('utc'::text, now()) + INTERVAL '30 days';
    UPDATE public.users
    SET monetized = 'true',
        monetized_at = timezone('utc'::text, now()),
        monetized_until = v_expiry,
        monetization_type = p_type
    WHERE lower(email) = lower(p_email);
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create secure verify_and_deactivate_account stored procedure (RPC)
CREATE OR REPLACE FUNCTION public.verify_and_deactivate_account(
  p_passphrase TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_db_passphrase TEXT;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT passphrase INTO v_db_passphrase FROM public.users WHERE lower(email) = lower(v_email);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF trim(COALESCE(v_db_passphrase, '')) != trim(p_passphrase) THEN
    RETURN FALSE;
  END IF;

  -- Delete all user-related data atomically on the database side
  DELETE FROM public.adds WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.addsactive WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.news WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.newsactive WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.users WHERE lower(email) = lower(v_email);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Secure handle_earn_click stored procedure
CREATE OR REPLACE FUNCTION public.handle_earn_click(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_rate             NUMERIC(12,2);
  v_monetized        BOOLEAN;
  v_success          BOOLEAN;
  v_email_lower      TEXT;
  v_caller_email     TEXT;
  v_suspended_until  TIMESTAMP WITH TIME ZONE;
  v_click_timestamps TIMESTAMP WITH TIME ZONE[];
  v_cardinality      INT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Secure access control: check if caller's JWT email matches parameter (only for client roles)
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    v_caller_email := auth.jwt() ->> 'email';
    IF lower(v_caller_email) IS NULL OR lower(v_caller_email) != v_email_lower THEN
      RAISE EXCEPTION 'Access Denied: Caller identity mismatch.';
    END IF;
  END IF;

  SELECT
    ((monetized = 'yes' OR monetized = 'true' OR monetized = '1')
      AND (monetized_until IS NULL OR monetized_until > now())),
    suspended_until,
    COALESCE(click_timestamps, '{}'::TIMESTAMP WITH TIME ZONE[])
  INTO v_monetized, v_suspended_until, v_click_timestamps
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- Already suspended
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN -1.00;
  END IF;

  -- Speed check – append timestamp, keep last 10
  v_click_timestamps := array_append(v_click_timestamps, now());
  v_cardinality      := cardinality(v_click_timestamps);
  IF v_cardinality > 10 THEN
    v_click_timestamps := v_click_timestamps[(v_cardinality - 9):v_cardinality];
    v_cardinality := 10;
  END IF;

  IF v_cardinality = 10 THEN
    IF (v_click_timestamps[10] - v_click_timestamps[1]) < INTERVAL '540 seconds' THEN
      UPDATE public.users
      SET suspended_until = now() + INTERVAL '2 hours',
          click_timestamps = '{}'::TIMESTAMP WITH TIME ZONE[]
      WHERE lower(email) = v_email_lower;
      RETURN -2.00;
    END IF;
  END IF;

  UPDATE public.users SET click_timestamps = v_click_timestamps WHERE lower(email) = v_email_lower;

  -- Record impression
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RETURN -3.00;  -- cap reached – caller should dismiss ad, no exception
  END IF;

  -- Credit earnings if monetized
  IF v_monetized THEN
    SELECT COALESCE(cost_per_impression, 0.50) INTO v_rate FROM public.addsactive WHERE id = p_ad_id;
    IF NOT FOUND THEN
      RETURN 0.00;
    END IF;
    IF v_rate > 0 THEN
      UPDATE public.users SET balance = COALESCE(balance, 0.00) + v_rate WHERE lower(email) = v_email_lower;
      RETURN v_rate;
    END IF;
  END IF;

  RETURN 0.00;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Secure handle_mutual_click stored procedure
CREATE OR REPLACE FUNCTION public.handle_mutual_click(
  p_ad_id      UUID,
  p_user_email TEXT
) RETURNS INT AS $$
DECLARE
  v_publisher_email  TEXT;
  v_mutual_count     INT;
  v_mutuals          TEXT[];
  v_success          BOOLEAN;
  v_email_lower      TEXT;
  v_caller_email     TEXT;
  v_suspended_until  TIMESTAMP WITH TIME ZONE;
  v_click_timestamps TIMESTAMP WITH TIME ZONE[];
  v_cardinality      INT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Secure access control: check if caller's JWT email matches parameter (only for client roles)
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    v_caller_email := auth.jwt() ->> 'email';
    IF lower(v_caller_email) IS NULL OR lower(v_caller_email) != v_email_lower THEN
      RAISE EXCEPTION 'Access Denied: Caller identity mismatch.';
    END IF;
  END IF;

  SELECT
    COALESCE(mutual_count, 0),
    COALESCE(mutuals, '{}'::TEXT[]),
    suspended_until,
    COALESCE(click_timestamps, '{}'::TIMESTAMP WITH TIME ZONE[])
  INTO v_mutual_count, v_mutuals, v_suspended_until, v_click_timestamps
  FROM public.users
  WHERE lower(email) = v_email_lower;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viewer profile not found.';
  END IF;

  -- Already suspended
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN -1;
  END IF;

  -- Speed check
  v_click_timestamps := array_append(v_click_timestamps, now());
  v_cardinality      := cardinality(v_click_timestamps);
  IF v_cardinality > 10 THEN
    v_click_timestamps := v_click_timestamps[(v_cardinality - 9):v_cardinality];
    v_cardinality := 10;
  END IF;

  IF v_cardinality = 10 THEN
    IF (v_click_timestamps[10] - v_click_timestamps[1]) < INTERVAL '540 seconds' THEN
      UPDATE public.users
      SET suspended_until = now() + INTERVAL '2 hours',
          click_timestamps = '{}'::TIMESTAMP WITH TIME ZONE[]
      WHERE lower(email) = v_email_lower;
      RETURN -2;
    END IF;
  END IF;

  UPDATE public.users SET click_timestamps = v_click_timestamps WHERE lower(email) = v_email_lower;

  -- Enforce 50-mutual limit
  IF v_mutual_count >= 50 THEN
    RAISE EXCEPTION 'Mutual count limit (50) reached.';
  END IF;

  -- Fetch publisher email
  SELECT lower(user_email) INTO v_publisher_email FROM public.addsactive WHERE id = p_ad_id;
  IF NOT FOUND OR v_publisher_email IS NULL THEN
    RAISE EXCEPTION 'Ad publisher not found.';
  END IF;

  IF v_email_lower = v_publisher_email THEN
    RAISE EXCEPTION 'Cannot add yourself to mutuals.';
  END IF;

  -- Record impression
  v_success := public.record_ad_impression(p_ad_id, v_email_lower);
  IF NOT v_success THEN
    RETURN -3;  -- cap reached – caller should dismiss ad, no exception
  END IF;

  -- Update mutuals if not already present
  IF NOT (v_publisher_email = ANY(v_mutuals)) THEN
    UPDATE public.users
    SET mutuals      = array_append(v_mutuals, v_publisher_email),
        mutual_count = v_mutual_count + 1
    WHERE lower(email) = v_email_lower;

    UPDATE public.addsactive
    SET mutual_adds_count = COALESCE(mutual_adds_count, 0) + 1
    WHERE id = p_ad_id;
  END IF;

  RETURN 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Optimize get_user_feed stored procedure (remove random() CPU bottleneck)
DROP FUNCTION IF EXISTS public.get_user_feed(text);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer);
DROP FUNCTION IF EXISTS public.get_user_feed(text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit      INT DEFAULT 100,
  p_offset     INT DEFAULT 0
)
RETURNS SETOF public.addsactive AS $$
DECLARE
  v_user        RECORD;
  v_age         INT;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  SELECT * INTO v_user FROM public.users WHERE lower(email) = v_email_lower LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_user.dob IS NOT NULL THEN
    v_age := date_part('year', age(v_user.dob::date));
  ELSE
    v_age := 25;
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.addsactive a
  WHERE
    -- Exclude completed ads
    a.completed_at IS NULL

    -- Exclude paused ads
    AND (a.is_paused IS NULL OR a.is_paused = FALSE)

    -- Exclude ads that hit total impression target
    AND (
      a.impressions IS NULL
      OR COALESCE(a.impression_count, 0) < a.impressions
    )

    -- Exclude ads this user has already seen >= frequency cap
    AND NOT EXISTS (
      SELECT 1 FROM public.ad_impressions imp
      WHERE imp.ad_id = a.id
        AND lower(imp.user_email) = v_email_lower
        AND imp.view_count >= COALESCE(a.user_frequency_cap, 1)
    )

    -- Bypass demographics for mutual targets; otherwise enforce demographics
    AND (
      v_email_lower = ANY(
        ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
      )
      OR (
        (a.country IS NULL OR a.country = '' OR lower(a.country) = lower(COALESCE(v_user.country, '')))
        AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user.gender, '')))
        AND (
          a.employment_status IS NULL OR a.employment_status = ''
          OR lower(COALESCE(v_user.employment, '')) = ANY(
            string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
          )
        )
        AND (
          a.age_range IS NULL OR cardinality(a.age_range) < 2
          OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
        )
        AND (
          a.targeting_all = TRUE
          OR a.interest   && v_user.interest
          OR a.lifestyle  && v_user.lifestyle
          OR a.personality && v_user.personality
          OR a.behavior   && v_user.behavior
          OR a.industry   && v_user.industry
        )
      )
    )

    -- Daily impression cap
    AND (
      a.daily_impression_cap IS NULL
      OR a.last_reset_date IS NULL
      OR a.last_reset_date < CURRENT_DATE
      OR COALESCE(a.daily_impression_count, 0) < COALESCE(
           a.daily_impression_cap + COALESCE(a.rollover_balance, 0),
           a.daily_impression_cap, 99999999
         )
    )

  ORDER BY
    -- Mutual targets first
    (CASE WHEN v_email_lower = ANY(
      ARRAY(SELECT lower(t) FROM unnest(COALESCE(a.mutual_targets, '{}'::text[])) t)
    ) THEN 0 ELSE 1 END) ASC,
    -- Then oldest campaign first
    a.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Grant execute permissions to public/anon
GRANT EXECUTE ON FUNCTION public.activate_monetization(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_deactivate_account(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_earn_click(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_mutual_click(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon, authenticated;
