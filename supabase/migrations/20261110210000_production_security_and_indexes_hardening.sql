-- Migration: 20261110210000_production_security_and_indexes_hardening.sql
-- ============================================================================
-- Enterprise Lockdown: Revoke Public Access on Financial & Identity RPCs
-- High-Performance 500M+ Scale Indexing on ad_impressions
-- ============================================================================

-- 1. Revoke public/anon access to financial & profile RPCs across all overloaded signatures
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname IN (
      'claim_ad_earning_atomic',
      'update_user_profile',
      'auto_provision_user',
      'increment_ad_impressions_bulk'
    )
  ) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon, authenticated, PUBLIC;', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role;', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2. High-Performance Index on ad_impressions for 500M scale
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_user 
ON public.ad_impressions (ad_id, lower(trim(user_email)));

CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_email 
ON public.ad_impressions (lower(trim(user_email)));

-- 3. Instantaneous O(1) Supabase Auth User Deletion RPC (bypasses unpaginated listUsers)
CREATE OR REPLACE FUNCTION public.delete_auth_user_by_email(p_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    DELETE FROM auth.users WHERE lower(email) = lower(trim(p_email));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_auth_user_by_email(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_auth_user_by_email(TEXT) TO service_role;

-- 4. Atomic Single-Query Record for User Ad Impressions
CREATE OR REPLACE FUNCTION public.record_user_ad_impression_atomic(
  p_ad_id UUID,
  p_user_email TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_clean TEXT := lower(trim(p_user_email));
  v_existing_id UUID;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND lower(user_email) = v_email_clean
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.ad_impressions
    SET view_count = COALESCE(view_count, 0) + 1,
        last_viewed_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.ad_impressions (ad_id, user_email, view_count, last_viewed_at)
    VALUES (p_ad_id, v_email_clean, 1, now());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_ad_impression_atomic(UUID, TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_user_ad_impression_atomic(UUID, TEXT) TO service_role;


