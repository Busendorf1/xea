-- ============================================================
-- MIGRATION: UPDATE verify_and_deactivate_account
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

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
  DELETE FROM public.payments WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.notifications WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.ad_impressions WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.read_announcements WHERE lower(user_email) = lower(v_email);
  DELETE FROM public.users WHERE lower(email) = lower(v_email);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
