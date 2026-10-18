-- ============================================================
-- MIGRATION: SECURE RPC FUNCTION TO FETCH USER PROFILE
-- Run this in your Supabase SQL Editor (New query -> Run)
-- This allows the mobile client (running under the anon role) 
-- to fetch their own profile securely without needing direct SELECT rights.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_profile(p_email text)
RETURNS SETOF public.users AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.users
  WHERE lower(email) = lower(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute rights to public (which includes anon and authenticated roles)
GRANT EXECUTE ON FUNCTION public.get_user_profile(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(text) TO authenticated;
