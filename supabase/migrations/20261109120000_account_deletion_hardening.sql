-- Migration: 20261109120000_account_deletion_hardening.sql
-- ============================================================================
-- Account deletion that actually deletes, plus RPC security lockdown.
--
-- Fixes:
--   1. Deleted accounts kept appearing in Followers / Following / Mutuals, because the
--      user's email stayed in other users' `mutuals` arrays and `referred_by` columns.
--   2. deactivate_user_atomic was granted to `anon` (archive migration), so anyone holding
--      the public anon key could delete ANY account via PostgREST. claim_ad_earning_atomic,
--      check_and_update_monetization_status and increment_user_click_progress were also
--      granted to anon/authenticated. All of them are now service_role only, since the app
--      only ever calls them server-side through supabaseAdmin.
--   3. The old RPC failed outright (and the route fell back to ~20 HTTP round trips) if any
--      single optional table was missing. Optional tables are now guarded with to_regclass.
--   4. Financial ledger rows (payments, forfeited_balances) are PSEUDONYMISED instead of hard-
--      deleted. Nigerian law (Money Laundering (Prevention & Prohibition) Act 2022 s.8, CBN
--      AML/CFT Regulations) requires transaction records to be kept for 5 years. NDPA 2023
--      s.25(1)(c) permits keeping them under that legal obligation.
--
-- Performance at 500M+ users:
--   * Every statement filters on an indexed column (lower(user_email), lower(referrer_email),
--     lower(referee_email), GIN(mutuals), lower(referred_by)). No full table scans.
--   * Only the deleting user's row is locked with FOR UPDATE. Other users' rows are touched
--     one at a time by indexed UPDATEs, so no table-level locks are taken.
--   * lock_timeout / statement_timeout bound the worst case, so deletion can never pile up
--     locks behind it.
--
-- PREREQUISITE: run 20261109120100_account_deletion_indexes.sql first (each statement on
-- its own, because CREATE INDEX CONCURRENTLY cannot run inside a transaction).
-- ============================================================================

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
  v_col              TEXT;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email address');
  END IF;

  -- Never wait on locks: fail fast and let the caller retry, rather than queueing behind traffic.
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '20s';

  -- 1. Lock ONLY the deleting user's row
  SELECT id, username, referral_code
    INTO v_user_id, v_username, v_ref_code
  FROM public.users
  WHERE lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_pseudonym := 'deleted_' || md5(v_email);

  -- 2. Capture the graph edges first so the API can invalidate exactly the right caches
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
    WHERE mutuals @> ARRAY[v_email]            -- GIN index: idx_users_mutuals_gin
    LIMIT 5000
  ) m;

  -- 3. Remove the user from every other user's social graph
  UPDATE public.users
  SET mutuals = array_remove(mutuals, v_email),
      mutual_count = GREATEST(0, COALESCE(mutual_count, 0) - 1)
  WHERE mutuals @> ARRAY[v_email];

  -- Unbind any followers who were referred by this user (by email or by referral code)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referred_by') THEN
    UPDATE public.users SET referred_by = NULL WHERE lower(referred_by) = v_email;
    IF v_ref_code IS NOT NULL AND v_ref_code <> '' THEN
      UPDATE public.users SET referred_by = NULL WHERE lower(referred_by) = lower(v_ref_code);
    END IF;
  END IF;

  DELETE FROM public.referrals WHERE lower(referrer_email) = v_email;
  DELETE FROM public.referrals WHERE lower(referee_email) = v_email;

  -- 4. Hard-delete user-owned content and personal data (optional tables guarded)
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

  -- 5. Pseudonymise legally retained financial ledgers (5-year AML retention)
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

  -- 6. Delete the identity record itself (profile, PII, balances, settings)
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

-- ============================================================================
-- SECURITY LOCKDOWN: service_role only (the app calls these exclusively via supabaseAdmin)
-- ============================================================================
REVOKE ALL ON FUNCTION public.deactivate_user_atomic(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_user_atomic(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ad_earning_atomic(UUID, TEXT, NUMERIC, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.check_and_update_monetization_status(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_update_monetization_status(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.increment_user_click_progress(TEXT, INT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_user_click_progress(TEXT, INT) TO service_role;

-- ============================================================================
-- ONE-TIME CLEANUP: remove ghost entries left behind by accounts deleted before this fix
-- (emails sitting in someone's mutuals array, or referral rows, with no matching user).
-- Batched, so each run only touches a bounded number of rows. Re-run until it returns 0.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.purge_orphan_social_edges(p_batch INT DEFAULT 5000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_deleted INT := 0;
  v_mut_fixed   INT := 0;
BEGIN
  SET LOCAL lock_timeout = '3s';

  WITH orphan AS (
    SELECT r.id FROM public.referrals r
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(r.referee_email))
       OR NOT EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(r.referrer_email))
    LIMIT p_batch
  )
  DELETE FROM public.referrals WHERE id IN (SELECT id FROM orphan);
  GET DIAGNOSTICS v_ref_deleted = ROW_COUNT;

  WITH holders AS (
    SELECT u.id,
           ARRAY(
             SELECT m FROM unnest(u.mutuals) m
             WHERE EXISTS (SELECT 1 FROM public.users x WHERE lower(x.email) = lower(m))
           ) AS clean
    FROM public.users u
    WHERE cardinality(u.mutuals) > 0
      AND EXISTS (
        SELECT 1 FROM unnest(u.mutuals) m
        WHERE NOT EXISTS (SELECT 1 FROM public.users x WHERE lower(x.email) = lower(m))
      )
    LIMIT p_batch
  )
  UPDATE public.users u
  SET mutuals = h.clean,
      mutual_count = cardinality(h.clean)
  FROM holders h
  WHERE u.id = h.id AND cardinality(h.clean) <> cardinality(u.mutuals);
  GET DIAGNOSTICS v_mut_fixed = ROW_COUNT;

  RETURN jsonb_build_object('orphan_referrals_deleted', v_ref_deleted, 'mutual_arrays_fixed', v_mut_fixed);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_orphan_social_edges(INT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_orphan_social_edges(INT) TO service_role;

NOTIFY pgrst, 'reload schema';
