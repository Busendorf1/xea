-- ==============================================================================
-- FIX: ATOMIC WALLET BALANCE DEDUCTION IN PROCESS_LEDGER_TRANSFER
-- Run this in your Supabase SQL Editor
-- This ensures sender balance is reduced and recipient balance is credited
-- atomically in the same ACID transaction as the ledger and payment statements.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_ledger_transfer(
    p_reference TEXT,
    p_sender_email TEXT,
    p_recipient_email TEXT,
    p_amount_kobo BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sender_clean TEXT;
    v_recipient_clean TEXT;
    v_amount_naira NUMERIC(15,2);
    v_sender_balance NUMERIC(15,2);
    v_new_sender_balance NUMERIC(15,2);
    v_new_recipient_balance NUMERIC(15,2);
BEGIN
    v_sender_clean := LOWER(TRIM(p_sender_email));
    v_recipient_clean := LOWER(TRIM(p_recipient_email));
    v_amount_naira := p_amount_kobo::NUMERIC / 100.0;

    -- 1. Disallow self transfer
    IF v_sender_clean = v_recipient_clean THEN
        RETURN jsonb_build_object('success', false, 'error', 'Self-transfers are not allowed');
    END IF;

    -- 2. Check amount validity
    IF p_amount_kobo <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;

    -- 3. Check duplicate reference (Idempotent replay prevention)
    IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE reference = p_reference) THEN
        SELECT balance INTO v_sender_balance FROM public.users WHERE LOWER(email) = v_sender_clean;
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Ledger entry already posted (Idempotent success)',
            'new_sender_balance', COALESCE(v_sender_balance, 0.00)
        );
    END IF;

    -- 4. Lock sender row for atomic balance check & deduction
    SELECT COALESCE(balance, 0.00) INTO v_sender_balance
    FROM public.users
    WHERE LOWER(email) = v_sender_clean
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sender account not found');
    END IF;

    IF v_sender_balance < v_amount_naira THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance for this transfer');
    END IF;

    -- 5. Lock recipient row for atomic balance credit
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = v_recipient_clean FOR UPDATE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient user account does not exist');
    END IF;

    -- 6. Atomically update balances in public.users
    v_new_sender_balance := GREATEST(0.00, v_sender_balance - v_amount_naira);

    UPDATE public.users
    SET balance = v_new_sender_balance
    WHERE LOWER(email) = v_sender_clean;

    UPDATE public.users
    SET balance = COALESCE(balance, 0.00) + v_amount_naira
    WHERE LOWER(email) = v_recipient_clean
    RETURNING balance INTO v_new_recipient_balance;

    -- 7. Insert into append-only double-entry ledger_entries
    INSERT INTO public.ledger_entries (reference, sender_email, recipient_email, amount_kobo, entry_type, status, metadata)
    VALUES (
        p_reference,
        v_sender_clean,
        v_recipient_clean,
        p_amount_kobo,
        'TRANSFER',
        'POSTED',
        jsonb_build_object(
            'amount_naira', v_amount_naira,
            'sender_email', v_sender_clean,
            'recipient_email', v_recipient_clean,
            'new_sender_balance', v_new_sender_balance,
            'new_recipient_balance', v_new_recipient_balance
        )
    );

    -- 8. Insert payment audit statement records
    INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
    VALUES (
        v_sender_clean,
        p_reference,
        v_amount_naira,
        'success',
        'transfer_sent',
        'Sent money to ' || v_recipient_clean,
        jsonb_build_object('recipient_email', v_recipient_clean, 'amount_kobo', p_amount_kobo)
    );

    INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
    VALUES (
        v_recipient_clean,
        p_reference || '_rcv',
        v_amount_naira,
        'success',
        'transfer_received',
        'Received money from ' || v_sender_clean,
        jsonb_build_object('sender_email', v_sender_clean, 'amount_kobo', p_amount_kobo)
    );

    -- 9. Insert real-time notifications
    INSERT INTO public.notifications (user_email, title, message)
    VALUES (
        v_sender_clean,
        'Money Sent',
        'You successfully sent ?' || TO_CHAR(v_amount_naira, 'FM999,999,990.00') || ' to ' || v_recipient_clean
    );

    INSERT INTO public.notifications (user_email, title, message)
    VALUES (
        v_recipient_clean,
        'Money Received',
        'You received ?' || TO_CHAR(v_amount_naira, 'FM999,999,990.00') || ' from ' || v_sender_clean
    );

    RETURN jsonb_build_object(
        'success', true, 
        'reference', p_reference,
        'new_sender_balance', v_new_sender_balance,
        'new_recipient_balance', v_new_recipient_balance,
        'message', 'Transfer processed and balances updated successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
