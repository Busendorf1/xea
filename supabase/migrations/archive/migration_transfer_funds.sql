-- ============================================================
-- MIGRATION: SECURE P2P USER FUNDS TRANSFER RPC
-- Run this script in your Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.transfer_user_funds(
  p_sender_email TEXT,
  p_recipient_email TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender RECORD;
  v_recipient RECORD;
  v_sender_email_clean TEXT;
  v_recipient_email_clean TEXT;
  v_max_transfer NUMERIC(12,2);
  v_new_sender_balance NUMERIC(12,2);
  v_ref TEXT;
BEGIN
  v_sender_email_clean := LOWER(TRIM(p_sender_email));
  v_recipient_email_clean := LOWER(TRIM(p_recipient_email));

  -- 1. Disallow self-transfers
  IF v_sender_email_clean = v_recipient_email_clean THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot send money to your own email account');
  END IF;

  -- 2. Check transfer amount validity
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please provide a valid positive transfer amount');
  END IF;

  -- 3. Lock sender row for atomic update
  SELECT id, email, balance INTO v_sender 
  FROM public.users 
  WHERE LOWER(email) = v_sender_email_clean 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender account not found');
  END IF;

  -- 4. Lock recipient row for atomic update
  SELECT id, email INTO v_recipient 
  FROM public.users 
  WHERE LOWER(email) = v_recipient_email_clean 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient user account with this email does not exist');
  END IF;

  -- 5. Enforce Maximum 20% of total balance at a time rule
  v_max_transfer := COALESCE(v_sender.balance, 0.00) * 0.20;
  IF p_amount > (v_max_transfer + 0.01) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Transfer amount exceeds the maximum limit of 20% of your total balance at a time (' || COALESCE(v_sender.balance, 0.00) || ' total balance).'
    );
  END IF;

  -- 6. Enforce sufficient balance rule
  IF COALESCE(v_sender.balance, 0.00) < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance for this transfer');
  END IF;

  -- 7. Execute atomic balance updates
  v_new_sender_balance := COALESCE(v_sender.balance, 0.00) - p_amount;

  UPDATE public.users 
  SET balance = v_new_sender_balance 
  WHERE LOWER(email) = v_sender_email_clean;

  UPDATE public.users 
  SET balance = COALESCE(balance, 0.00) + p_amount 
  WHERE LOWER(email) = v_recipient_email_clean;

  -- 8. Generate reference transaction ID
  v_ref := 'trf_' || gen_random_uuid()::text;

  -- 9. Insert transaction records into payments table
  INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
  VALUES (
    v_sender_email_clean,
    v_ref,
    p_amount,
    'success',
    'transfer_sent',
    'Sent money to ' || v_recipient_email_clean,
    jsonb_build_object('recipient_email', v_recipient_email_clean, 'amount', p_amount, 'transfer_type', 'outbound')
  );

  INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
  VALUES (
    v_recipient_email_clean,
    v_ref || '_rcv',
    p_amount,
    'success',
    'transfer_received',
    'Received money from ' || v_sender_email_clean,
    jsonb_build_object('sender_email', v_sender_email_clean, 'amount', p_amount, 'transfer_type', 'inbound')
  );

  -- 10. Insert Notifications for both users
  INSERT INTO public.notifications (user_email, title, message)
  VALUES (
    v_sender_email_clean,
    'Money Sent',
    'You successfully sent ₦' || TO_CHAR(p_amount, 'FM999,999,990.00') || ' to ' || v_recipient_email_clean
  );

  INSERT INTO public.notifications (user_email, title, message)
  VALUES (
    v_recipient_email_clean,
    'Money Received',
    'You received ₦' || TO_CHAR(p_amount, 'FM999,999,990.00') || ' from ' || v_sender_email_clean
  );

  RETURN jsonb_build_object(
    'success', true, 
    'reference', v_ref, 
    'new_balance', v_new_sender_balance,
    'message', 'Transfer completed successfully'
  );

EXCEPTION WHEN OTHERS THEN
  -- Automatic transaction rollback on any unexpected SQL error
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
