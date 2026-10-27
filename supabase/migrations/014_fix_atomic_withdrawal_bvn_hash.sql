-- ==============================================================================
-- MIGRATION 014: FIX initiate_atomic_withdrawal RPC (REMOVE LEGACY bvn_hash)
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.initiate_atomic_withdrawal(
  p_email TEXT,
  p_amount NUMERIC(12, 2),
  p_min_amount NUMERIC(12, 2) DEFAULT 10000.00,
  p_is_admin BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_email_clean TEXT;
  v_current_bal NUMERIC(12, 2);
  v_current_withdrawn NUMERIC(12, 2);
  v_new_bal NUMERIC(12, 2);
  v_new_withdrawn NUMERIC(12, 2);
BEGIN
  v_email_clean := LOWER(TRIM(p_email));

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid withdrawal amount');
  END IF;

  -- 1. Acquire exclusive row lock on user row (no bvn_hash column)
  SELECT id, email, balance, withdrawal, phone, monetized, monetization_clicks, atw_tier
  INTO v_user
  FROM public.users
  WHERE LOWER(email) = v_email_clean
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found');
  END IF;

  v_current_bal := COALESCE(v_user.balance, 0.00);
  v_current_withdrawn := COALESCE(v_user.withdrawal, 0.00);

  -- 2. Validate balance requirements
  IF NOT p_is_admin AND v_current_bal < p_min_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Minimum wallet balance required is ₦' || TO_CHAR(p_min_amount, 'FM999,999,990.00') || '. Current balance is ₦' || TO_CHAR(v_current_bal, 'FM999,999,990.00')
    );
  END IF;

  IF NOT p_is_admin AND p_amount < p_min_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Minimum withdrawal amount per transaction is ₦' || TO_CHAR(p_min_amount, 'FM999,999,990.00')
    );
  END IF;

  IF p_amount > v_current_bal THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient available balance. Your balance is ₦' || TO_CHAR(v_current_bal, 'FM999,999,990.00')
    );
  END IF;

  -- 3. Atomic deduction and state mutation
  v_new_bal := v_current_bal - p_amount;
  v_new_withdrawn := v_current_withdrawn + p_amount;

  UPDATE public.users
  SET balance = v_new_bal,
      withdrawal = v_new_withdrawn
  WHERE id = v_user.id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_balance', v_current_bal,
    'new_balance', v_new_bal,
    'new_withdrawal', v_new_withdrawn,
    'phone', v_user.phone
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_atomic_withdrawal(TEXT, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_atomic_withdrawal(TEXT, NUMERIC, NUMERIC, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';
