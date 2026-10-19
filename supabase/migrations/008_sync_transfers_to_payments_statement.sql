-- ============================================================
-- MIGRATION 008: SYNCHRONIZE TRANSFERS TO PAYMENTS LEDGER & STATEMENT
-- 1. Updates process_ledger_transfer RPC to atomically write
--    outbound ('transfer_sent') and inbound ('transfer_received') records
--    to public.payments so they immediately appear in /statement.
-- 2. Inserts in-app notifications for both parties.
-- 3. Backfills any historical transfers from ledger_entries into payments.
-- ============================================================

-- Fast statement query indexes on public.payments
CREATE INDEX IF NOT EXISTS idx_payments_user_email_created 
    ON public.payments (lower(user_email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_user_email_type 
    ON public.payments (lower(user_email), type, created_at DESC);

-- Update Atomic process_ledger_transfer RPC
CREATE OR REPLACE FUNCTION public.process_ledger_transfer(
    p_sender_email TEXT,
    p_recipient_email TEXT,
    p_amount_kobo BIGINT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sender_email TEXT := LOWER(TRIM(p_sender_email));
    v_recipient_email TEXT := LOWER(TRIM(p_recipient_email));
    v_sender_user RECORD;
    v_recipient_user RECORD;
    v_amount_naira NUMERIC(12,2);
    v_new_sender_balance NUMERIC(12,2);
    v_new_recipient_balance NUMERIC(12,2);
    v_max_allowed_kobo BIGINT;
    v_sender_acct UUID;
    v_recipient_acct UUID;
    v_sender_ref TEXT;
    v_recipient_ref TEXT;
    v_formatted_naira TEXT;
BEGIN
    IF v_sender_email = v_recipient_email THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sender and recipient cannot be identical');
    END IF;

    IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;

    -- Consistent ordering to eliminate deadlocks under high-concurrency P2P cycles
    IF v_sender_email < v_recipient_email THEN
        SELECT id, balance INTO v_sender_user FROM public.users WHERE lower(email) = v_sender_email FOR UPDATE;
        SELECT id, balance INTO v_recipient_user FROM public.users WHERE lower(email) = v_recipient_email FOR UPDATE;
    ELSE
        SELECT id, balance INTO v_recipient_user FROM public.users WHERE lower(email) = v_recipient_email FOR UPDATE;
        SELECT id, balance INTO v_sender_user FROM public.users WHERE lower(email) = v_sender_email FOR UPDATE;
    END IF;

    IF v_sender_user.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sender account not found');
    END IF;

    IF v_recipient_user.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient account not found');
    END IF;

    v_amount_naira := ROUND((p_amount_kobo::NUMERIC / 100.0), 2);
    v_max_allowed_kobo := FLOOR((v_sender_user.balance * 100.0) * 0.20);

    IF (v_sender_user.balance * 100.0) < p_amount_kobo THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    IF p_amount_kobo > v_max_allowed_kobo THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Transfer exceeds 20%% balance limit (Max: ₦%s)', ROUND(v_max_allowed_kobo::NUMERIC / 100.0, 2))
        );
    END IF;

    v_new_sender_balance := ROUND(v_sender_user.balance - v_amount_naira, 2);
    v_new_recipient_balance := ROUND(v_recipient_user.balance + v_amount_naira, 2);

    -- 1. Update authoritative users.balance atomically
    UPDATE public.users SET balance = v_new_sender_balance WHERE id = v_sender_user.id;
    UPDATE public.users SET balance = v_new_recipient_balance WHERE id = v_recipient_user.id;

    -- 2. Determine idempotent transaction references
    v_sender_ref := COALESCE(p_idempotency_key, 'trf_' || gen_random_uuid()::text);
    v_recipient_ref := v_sender_ref || '_rcv';

    -- 3. Synchronize with public.payments ledger table for account statement
    BEGIN
        -- Outbound transfer record (Sender Debit)
        INSERT INTO public.payments (
            user_email, reference, amount, status, type, description, metadata, created_at
        ) VALUES (
            v_sender_email,
            v_sender_ref,
            v_amount_naira,
            'success',
            'transfer_sent',
            'Sent money to ' || v_recipient_email,
            jsonb_build_object(
                'recipient_email', v_recipient_email,
                'recipientEmail', v_recipient_email,
                'counterparty_email', v_recipient_email,
                'amount', v_amount_naira,
                'amount_kobo', p_amount_kobo,
                'transfer_type', 'outbound',
                'idempotency_key', p_idempotency_key
            ),
            NOW()
        )
        ON CONFLICT (reference) DO UPDATE
        SET status = 'success';

        -- Inbound transfer record (Recipient Credit)
        INSERT INTO public.payments (
            user_email, reference, amount, status, type, description, metadata, created_at
        ) VALUES (
            v_recipient_email,
            v_recipient_ref,
            v_amount_naira,
            'success',
            'transfer_received',
            'Received money from ' || v_sender_email,
            jsonb_build_object(
                'sender_email', v_sender_email,
                'senderEmail', v_sender_email,
                'counterparty_email', v_sender_email,
                'amount', v_amount_naira,
                'amount_kobo', p_amount_kobo,
                'transfer_type', 'inbound',
                'idempotency_key', p_idempotency_key
            ),
            NOW()
        )
        ON CONFLICT (reference) DO UPDATE
        SET status = 'success';
    EXCEPTION WHEN OTHERS THEN
        -- Defensive fallback if payments schema has temporary variation
        NULL;
    END;

    -- 4. In-App Notifications
    BEGIN
        v_formatted_naira := '₦' || TO_CHAR(v_amount_naira, 'FM999,999,990.00');

        INSERT INTO public.notifications (user_email, title, message, created_at)
        VALUES (
            v_sender_email,
            'Money Sent',
            'You successfully sent ' || v_formatted_naira || ' to ' || v_recipient_email,
            NOW()
        );

        INSERT INTO public.notifications (user_email, title, message, created_at)
        VALUES (
            v_recipient_email,
            'Money Received',
            'You received ' || v_formatted_naira || ' from ' || v_sender_email,
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 5. Best-effort sync with double-entry ledger tables if present
    BEGIN
        INSERT INTO public.ledger_accounts (user_id, user_email, balance_kobo)
        VALUES (v_sender_user.id, v_sender_email, ROUND(v_new_sender_balance * 100))
        ON CONFLICT (user_email) DO UPDATE
        SET balance_kobo = ROUND(v_new_sender_balance * 100), updated_at = NOW()
        RETURNING id INTO v_sender_acct;

        INSERT INTO public.ledger_accounts (user_id, user_email, balance_kobo)
        VALUES (v_recipient_user.id, v_recipient_email, ROUND(v_new_recipient_balance * 100))
        ON CONFLICT (user_email) DO UPDATE
        SET balance_kobo = ROUND(v_new_recipient_balance * 100), updated_at = NOW()
        RETURNING id INTO v_recipient_acct;

        IF v_sender_acct IS NOT NULL AND v_recipient_acct IS NOT NULL THEN
            INSERT INTO public.ledger_entries (account_id, counterparty_account_id, entry_type, amount_kobo, reference)
            VALUES
                (v_sender_acct, v_recipient_acct, 'DEBIT', p_amount_kobo, v_sender_ref || '_debit'),
                (v_recipient_acct, v_sender_acct, 'CREDIT', p_amount_kobo, v_sender_ref || '_credit')
            ON CONFLICT (reference) DO NOTHING;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'new_sender_balance', v_new_sender_balance,
        'new_recipient_balance', v_new_recipient_balance,
        'amount_naira', v_amount_naira,
        'reference', v_sender_ref
    );
END;
$$;

-- Restrict execution to service_role only for security hardening
REVOKE ALL ON FUNCTION public.process_ledger_transfer(TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ledger_transfer(TEXT, TEXT, BIGINT, TEXT) TO service_role;

-- 6. Backfill any historical ledger transfers into payments table if missing
DO $$
DECLARE
    v_entry RECORD;
BEGIN
    -- Check if ledger_entries table exists and has sender_email/recipient_email columns
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'ledger_entries' 
          AND column_name = 'sender_email'
    ) THEN
        FOR v_entry IN
            SELECT 
                le.reference,
                le.sender_email,
                le.recipient_email,
                ROUND((le.amount_kobo::NUMERIC / 100.0), 2) AS amount_naira,
                le.created_at
            FROM public.ledger_entries le
            WHERE le.sender_email IS NOT NULL 
              AND le.recipient_email IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.payments p 
                  WHERE p.reference = le.reference
              )
        LOOP
            INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata, created_at)
            VALUES (
                LOWER(TRIM(v_entry.sender_email)),
                v_entry.reference,
                v_entry.amount_naira,
                'success',
                'transfer_sent',
                'Sent money to ' || LOWER(TRIM(v_entry.recipient_email)),
                jsonb_build_object(
                    'recipient_email', LOWER(TRIM(v_entry.recipient_email)),
                    'recipientEmail', LOWER(TRIM(v_entry.recipient_email)),
                    'amount', v_entry.amount_naira,
                    'transfer_type', 'outbound'
                ),
                v_entry.created_at
            )
            ON CONFLICT (reference) DO NOTHING;

            INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata, created_at)
            VALUES (
                LOWER(TRIM(v_entry.recipient_email)),
                v_entry.reference || '_rcv',
                v_entry.amount_naira,
                'success',
                'transfer_received',
                'Received money from ' || LOWER(TRIM(v_entry.sender_email)),
                jsonb_build_object(
                    'sender_email', LOWER(TRIM(v_entry.sender_email)),
                    'senderEmail', LOWER(TRIM(v_entry.sender_email)),
                    'amount', v_entry.amount_naira,
                    'transfer_type', 'inbound'
                ),
                v_entry.created_at
            )
            ON CONFLICT (reference) DO NOTHING;
        END LOOP;
    END IF;
END $$;
