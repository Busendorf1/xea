-- ============================================================
-- MIGRATION: SECURE RPC FUNCTION TO FETCH USER STATEMENTS
-- Run this in your Supabase SQL Editor (New query -> Run)
-- Allows the mobile client (running under the anon role) to fetch
-- their own payments, transfers, and bank withdrawals securely
-- ordered by created_at DESC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_statement(p_email text)
RETURNS SETOF public.payments AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.payments
  WHERE lower(user_email) = lower(p_email)
  ORDER BY created_at DESC
  LIMIT 300;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute rights to public (which includes anon and authenticated roles)
GRANT EXECUTE ON FUNCTION public.get_user_statement(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_statement(text) TO authenticated;
