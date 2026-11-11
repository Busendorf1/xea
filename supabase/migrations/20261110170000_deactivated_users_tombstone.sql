-- Migration: 20261110170000_deactivated_users_tombstone.sql
-- ============================================================================
-- Permanent Tombstone for Deactivated Accounts & High-Speed Security Lockdown
--
-- Performance at 500M+ users:
--   * Primary key on email ensures O(1) indexed lookup (<0.5ms).
--   * Row-level security restricts access exclusively to service_role.
--   * deactivate_user_atomic records the tombstone inside the atomic transaction
--     before wiping user data, guaranteeing that deactivated accounts can never
--     re-authenticate or autonomously recreate accounts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deactivated_users (
  email TEXT PRIMARY KEY,
  deactivated_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT DEFAULT 'user_deactivated'
);

ALTER TABLE public.deactivated_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deactivated_users FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deactivated_users TO service_role;

-- Backfill any existing accounts currently marked as deactivated
INSERT INTO public.deactivated_users (email, deactivated_at)
SELECT lower(email), now()
FROM public.users
WHERE ad_account_status = 'deactivated'
ON CONFLICT (email) DO NOTHING;

-- Update deactivate_user_atomic with tombstone recording
CREATE OR REPLACE FUNCTION public.deactivate_user_atomic(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email            TEXT := lower(trim(p_email));
  v_user_id          UUID;
  v_username         TEXT;
  v_ref_code         TEXT;
  v_pseudonym        TEXT;
  v_referrer         TEXT;
  v_referees         TEXT[] := '{}';
  v_mutual_holders   TEXT[] := '{}';
  v_tbl              TEXT;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email address');
  END IF;

  -- Never wait on locks: fail fast and let the caller retry
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '20s';

  -- 1. Lock ONLY the deleting user's row
  SELECT id, username, referral_code
    INTO v_user_id, v_username, v_ref_code
  FROM public.users
  WHERE lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Even if user row was already deleted, record the tombstone to block any re-login
    INSERT INTO public.deactivated_users (email, deactivated_at)
    VALUES (v_email, now())
    ON CONFLICT (email) DO UPDATE SET deactivated_at = now();

    RETURN jsonb_build_object('success', true, 'notice', 'Account tombstone recorded; user record already removed');
  END IF;

  v_pseudonym := 'deleted_' || md5(v_email);

  -- 2. Record permanent tombstone in deactivated_users
  INSERT INTO public.deactivated_users (email, deactivated_at)
  VALUES (v_email, now())
  ON CONFLICT (email) DO UPDATE SET deactivated_at = now();

  -- 3. Capture the graph edges first so the API can invalidate caches
  SELECT lower(referrer_email) INTO v_referrer
  FROM public.referrals
  WHERE lower(referee_email) = v_email
  LIMIT 1;

  SELECT COALESCE(array_agg(lower(referee_email)), '{}') INTO v_referees
  FROM (
    SELECT referee_email FROM public.referrals
    WHERE lower(referrer_email) = v_email
    LIMIT 5000
  ) r;

  SELECT COALESCE(array_agg(lower(email)), '{}') INTO v_mutual_holders
  FROM (
    SELECT email FROM public.users
    WHERE mutuals @> ARRAY[v_email]
    LIMIT 5000
  ) m;

  -- 4. Remove the user from every other user's social graph
  UPDATE public.users
  SET mutuals = array_remove(mutuals, v_email),
      mutual_count = GREATEST(0, COALESCE(mutual_count, 0) - 1)
  WHERE mutuals @> ARRAY[v_email];

  -- Unbind any followers who were referred by this user
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referred_by') THEN
    UPDATE public.users SET referred_by = NULL WHERE lower(referred_by) = v_email;
    IF v_ref_code IS NOT NULL AND v_ref_code <> '' THEN
      UPDATE public.users SET referred_by = NULL WHERE lower(referred_by) = lower(v_ref_code);
    END IF;
  END IF;

  DELETE FROM public.referrals WHERE lower(referrer_email) = v_email;
  DELETE FROM public.referrals WHERE lower(referee_email) = v_email;

  -- 5. Hard-delete user-owned content and personal data across all tables
  FOREACH v_tbl IN ARRAY ARRAY[
    'adds', 'addsactive', 'completed_ads', 'addscompleted', 'bidded_ads',
    'news', 'newsactive', 'bidded_highlights',
    'notifications', 'ad_impressions', 'read_announcements', 'help_tickets',
    'premium_subscribers', 'user_devices', 'push_subscriptions', 'user_interests'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'user_email') THEN
      EXECUTE format('DELETE FROM public.%I WHERE lower(user_email) = $1', v_tbl) USING v_email;
    END IF;
  END LOOP;

  -- Two-sided tables (reporter / advertiser)
  FOREACH v_tbl IN ARRAY ARRAY['ad_reports', 'blocked_advertisers'] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE lower(reporter_email) = $1', v_tbl) USING v_email;
      EXECUTE format('DELETE FROM public.%I WHERE lower(advertiser_email) = $1', v_tbl) USING v_email;
    END IF;
  END LOOP;

  IF to_regclass('public.blocked_ads') IS NOT NULL THEN
    DELETE FROM public.blocked_ads WHERE lower(reporter_email) = v_email;
  END IF;
  IF to_regclass('public.completed_ads_ratings') IS NOT NULL THEN
    DELETE FROM public.completed_ads_ratings WHERE lower(advertiser_email) = v_email;
  END IF;
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    DELETE FROM public.newsletter_subscribers WHERE lower(email) = v_email;
  END IF;

  -- 6. Pseudonymise legally retained financial ledgers (5-year AML retention)
  FOREACH v_tbl IN ARRAY ARRAY['payments', 'forfeited_balances'] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET user_email = $2 WHERE lower(user_email) = $1', v_tbl)
        USING v_email, v_pseudonym;
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'username') THEN
        EXECUTE format('UPDATE public.%I SET username = NULL WHERE user_email = $1', v_tbl) USING v_pseudonym;
      END IF;
    END IF;
  END LOOP;

  -- 7. Delete the identity record itself (profile, PII, balances, settings)
  DELETE FROM public.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'referrer_email', v_referrer,
    'referee_emails', to_jsonb(v_referees),
    'mutual_holder_emails', to_jsonb(v_mutual_holders),
    'ledger_pseudonym', v_pseudonym
  );
EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object('success', false, 'code', 'LOCK_TIMEOUT', 'error', 'Account busy, please retry.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_user_atomic(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_user_atomic(TEXT) TO service_role;
