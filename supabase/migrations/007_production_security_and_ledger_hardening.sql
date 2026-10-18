-- ============================================================================
-- MIGRATION 007: PRODUCTION SECURITY, ATOMIC LEDGER & RPC HARDENING
-- Enforces Stripe-grade ACID invariants, locks down SECURITY DEFINER RPCs
-- to service_role only, fixes ad budget row locking, enforces ATW caps and
-- monetization checks in SQL, and provides atomic wallet spend & payout settlement.
-- ============================================================================

-- 1. Create Atomic Wallet Spend & Refund RPCs (Prevents Double-Spend Race Conditions)
CREATE OR REPLACE FUNCTION public.spend_wallet_balance_atomic(
    p_user_email TEXT,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT 'wallet_spend',
    p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := LOWER(TRIM(p_user_email));
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid spend amount');
    END IF;

    SELECT COALESCE(balance, 0)
    INTO v_current_balance
    FROM public.users
    WHERE LOWER(email) = v_email
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient wallet balance',
            'current_balance', v_current_balance
        );
    END IF;

    v_new_balance := ROUND(v_current_balance - p_amount, 2);

    UPDATE public.users
    SET balance = v_new_balance
    WHERE LOWER(email) = v_email;

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', v_current_balance,
        'new_balance', v_new_balance,
        'reference', p_reference,
        'reason', p_reason
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_wallet_deduction_atomic(
    p_user_email TEXT,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT 'wallet_spend_rollback',
    p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := LOWER(TRIM(p_user_email));
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
    END IF;

    SELECT COALESCE(balance, 0)
    INTO v_current_balance
    FROM public.users
    WHERE LOWER(email) = v_email
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    v_new_balance := ROUND(v_current_balance + p_amount, 2);

    UPDATE public.users
    SET balance = v_new_balance
    WHERE LOWER(email) = v_email;

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', v_current_balance,
        'new_balance', v_new_balance,
        'reference', p_reference,
        'reason', p_reason
    );
END;
$$;

-- 2. Atomic Payout / Withdrawal Settlement RPC (Uses Gross Ledger Amount & Row Locking)
CREATE OR REPLACE FUNCTION public.settle_withdrawal_atomic(
    p_reference TEXT,
    p_outcome TEXT, -- 'success' | 'failed' | 'reversed'
    p_gateway_response TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_gross_amount NUMERIC;
    v_email TEXT;
    v_new_balance NUMERIC;
    v_new_withdrawal NUMERIC;
BEGIN
    IF p_reference IS NULL OR TRIM(p_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing payment reference');
    END IF;

    IF p_outcome NOT IN ('success', 'failed', 'reversed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid settlement outcome');
    END IF;

    SELECT *
    INTO v_payment
    FROM public.payments
    WHERE reference = p_reference
      AND type = 'withdrawal'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Withdrawal record not found');
    END IF;

    -- Idempotency check: if already in terminal state, return without double-crediting or double-refunding
    IF v_payment.status IN ('success', 'failed', 'reversed') THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_settled', true,
            'status', v_payment.status,
            'user_email', v_payment.user_email,
            'gross_amount', COALESCE(v_payment.amount, 0)
        );
    END IF;

    v_gross_amount := COALESCE(v_payment.amount, 0);
    v_email := LOWER(TRIM(v_payment.user_email));

    IF p_outcome = 'success' THEN
        UPDATE public.payments
        SET status = 'success',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'settled_at', NOW(),
                'gateway_response', COALESCE(p_gateway_response, 'Completed')
            )
        WHERE id = v_payment.id;

        UPDATE public.users
        SET withdrawal = GREATEST(0, ROUND(COALESCE(withdrawal, 0) - v_gross_amount, 2))
        WHERE LOWER(email) = v_email
        RETURNING balance, withdrawal INTO v_new_balance, v_new_withdrawal;
    ELSE
        UPDATE public.payments
        SET status = p_outcome,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'settled_at', NOW(),
                'failure_reason', COALESCE(p_gateway_response, 'Transfer failed or reversed')
            )
        WHERE id = v_payment.id;

        UPDATE public.users
        SET balance = ROUND(COALESCE(balance, 0) + v_gross_amount, 2),
            withdrawal = GREATEST(0, ROUND(COALESCE(withdrawal, 0) - v_gross_amount, 2))
        WHERE LOWER(email) = v_email
        RETURNING balance, withdrawal INTO v_new_balance, v_new_withdrawal;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_settled', false,
        'status', p_outcome,
        'user_email', v_email,
        'gross_amount', v_gross_amount,
        'new_balance', COALESCE(v_new_balance, 0),
        'new_withdrawal', COALESCE(v_new_withdrawal, 0)
    );
END;
$$;

-- 3. Harden claim_ad_earning_atomic:
--    - Require valid active ad in addsactive locked FOR UPDATE (no unbacked minting)
--    - Enforce monetization check (v_is_monetized = false => 0.00 earn)
--    - Enforce ATW tier balance caps (30k / 60k / 90k)
CREATE OR REPLACE FUNCTION public.claim_ad_earning_atomic(
    p_user_email TEXT,
    p_ad_id UUID DEFAULT NULL,
    p_expected_rate NUMERIC DEFAULT 1.80,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user RECORD;
    v_ad RECORD;
    v_earn_rate NUMERIC := 0.00;
    v_new_clicks INTEGER;
    v_new_balance NUMERIC;
    v_is_monetized BOOLEAN;
    v_ad_completed BOOLEAN := false;
    v_new_ad_views INTEGER := 0;
    v_recent_claims INTEGER := 0;
    v_max_balance NUMERIC := 30000.00;
    v_tier INTEGER := 1;
BEGIN
    -- 1. Require a valid ad ID and lock the active campaign row FOR UPDATE first
    IF p_ad_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ad ID is required for earning claims');
    END IF;

    SELECT id, views, target, pay, COALESCE(amount_paid, 0) AS amount_paid
    INTO v_ad
    FROM public.addsactive
    WHERE id = p_ad_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Campaign is no longer active or already completed');
    END IF;

    IF COALESCE(v_ad.views, 0) >= COALESCE(v_ad.target, 0) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Campaign target views already reached');
    END IF;

    -- 2. Lock the user row FOR UPDATE
    SELECT id, email, COALESCE(clicks, 0) AS clicks, COALESCE(balance, 0.00) AS balance,
           COALESCE(monetized, false) AS monetized, monetized_at,
           COALESCE(attention_tier, 1) AS attention_tier
    INTO v_user
    FROM public.users
    WHERE LOWER(email) = LOWER(TRIM(p_user_email))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
    END IF;

    -- 3. Velocity Anomaly Check (Max 15 claims per 60 seconds)
    SELECT COUNT(*) INTO v_recent_claims
    FROM public.earning_claims_log
    WHERE user_email = LOWER(TRIM(p_user_email))
      AND claimed_at > NOW() - INTERVAL '60 seconds';

    IF v_recent_claims >= 15 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Velocity limit exceeded: Maximum 15 claims per minute');
    END IF;

    -- 4. Duplicate Ad Claim Guard (Strict Idempotency)
    BEGIN
        INSERT INTO public.earning_claims_log (user_email, ad_id, amount, ip_address)
        VALUES (LOWER(TRIM(p_user_email)), p_ad_id, 0, p_ip_address);
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ad reward already claimed for this campaign', 'already_claimed', true);
    END;

    -- 5. Compute Authoritative 60% User Share from locked campaign
    IF COALESCE(v_ad.pay, 0) > 0 THEN
        v_earn_rate := ROUND((v_ad.pay::NUMERIC * 0.60), 2);
    ELSIF COALESCE(v_ad.target, 0) > 0 AND COALESCE(v_ad.amount_paid, 0) > 0 THEN
        v_earn_rate := ROUND(((v_ad.amount_paid::NUMERIC / v_ad.target::NUMERIC) * 0.60), 2);
    ELSE
        v_earn_rate := LEAST(GREATEST(COALESCE(p_expected_rate, 1.80), 0.00), 30.00);
    END IF;

    -- 6. Monetization & ATW Balance Cap Enforcement
    v_new_clicks := v_user.clicks + 1;
    v_is_monetized := v_user.monetized OR (v_new_clicks >= 100000);

    IF NOT v_is_monetized THEN
        v_earn_rate := 0.00;
    END IF;

    v_tier := COALESCE(v_user.attention_tier, 1);
    IF v_tier >= 3 THEN
        v_max_balance := 90000.00;
    ELSIF v_tier = 2 THEN
        v_max_balance := 60000.00;
    ELSE
        v_max_balance := 30000.00;
    END IF;

    IF v_earn_rate > 0 AND v_user.balance >= v_max_balance THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Wallet balance cap (₦%s) reached for Tier %s. Please withdraw or use funds first.', v_max_balance, v_tier),
            'cap_reached', true
        );
    END IF;

    IF v_earn_rate > 0 AND (v_user.balance + v_earn_rate) > v_max_balance THEN
        v_earn_rate := GREATEST(0.00, ROUND(v_max_balance - v_user.balance, 2));
    END IF;

    v_new_balance := ROUND(v_user.balance + v_earn_rate, 2);

    -- Update claim log with final credited amount
    UPDATE public.earning_claims_log
    SET amount = v_earn_rate
    WHERE user_email = LOWER(TRIM(p_user_email)) AND ad_id = p_ad_id;

    -- 7. Update User Balance & Clicks Atomically
    UPDATE public.users
    SET clicks = v_new_clicks,
        balance = v_new_balance,
        monetized = v_is_monetized,
        monetized_at = CASE
            WHEN v_is_monetized AND NOT v_user.monetized AND v_user.monetized_at IS NULL THEN NOW()
            ELSE v_user.monetized_at
        END
    WHERE id = v_user.id;

    -- 8. Increment Ad Views & Check Campaign Completion
    UPDATE public.addsactive
    SET views = COALESCE(views, 0) + 1
    WHERE id = p_ad_id
    RETURNING views INTO v_new_ad_views;

    UPDATE public.adds
    SET views = v_new_ad_views
    WHERE id = p_ad_id;

    IF v_new_ad_views >= COALESCE(v_ad.target, 0) THEN
        v_ad_completed := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'earned_amount', v_earn_rate,
        'new_balance', v_new_balance,
        'new_clicks', v_new_clicks,
        'monetized', v_is_monetized,
        'ad_completed', v_ad_completed,
        'ad_views', v_new_ad_views
    );
END;
$$;

-- 4. Harden process_ledger_transfer:
--    - Lock sender & recipient users in deterministic ID order
--    - Enforce 20% max balance transfer rule inside SQL
--    - Synchronize users.balance atomically inside the same transaction
CREATE OR REPLACE FUNCTION public.process_ledger_transfer(
    p_sender_email TEXT,
    p_recipient_email TEXT,
    p_amount_kobo BIGINT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_email TEXT := LOWER(TRIM(p_sender_email));
    v_recipient_email TEXT := LOWER(TRIM(p_recipient_email));
    v_sender_user RECORD;
    v_recipient_user RECORD;
    v_sender_acct UUID;
    v_recipient_acct UUID;
    v_amount_naira NUMERIC;
    v_max_allowed_kobo BIGINT;
    v_new_sender_balance NUMERIC;
    v_new_recipient_balance NUMERIC;
    v_existing_tx RECORD;
BEGIN
    IF p_amount_kobo IS NULL OR p_amount_kobo < 200000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum transfer amount is ₦2,000');
    END IF;

    IF v_sender_email = v_recipient_email THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer funds to yourself');
    END IF;

    -- Idempotency check on payments reference
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_tx
        FROM public.payments
        WHERE reference = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Duplicate transfer reference', 'duplicate', true);
        END IF;
    END IF;

    -- Lock both users in deterministic order by email to prevent deadlocks
    IF v_sender_email < v_recipient_email THEN
        SELECT id, email, COALESCE(balance, 0) AS balance INTO v_sender_user
        FROM public.users WHERE LOWER(email) = v_sender_email FOR UPDATE;
        SELECT id, email, COALESCE(balance, 0) AS balance INTO v_recipient_user
        FROM public.users WHERE LOWER(email) = v_recipient_email FOR UPDATE;
    ELSE
        SELECT id, email, COALESCE(balance, 0) AS balance INTO v_recipient_user
        FROM public.users WHERE LOWER(email) = v_recipient_email FOR UPDATE;
        SELECT id, email, COALESCE(balance, 0) AS balance INTO v_sender_user
        FROM public.users WHERE LOWER(email) = v_sender_email FOR UPDATE;
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

    -- Update authoritative users.balance atomically
    UPDATE public.users SET balance = v_new_sender_balance WHERE id = v_sender_user.id;
    UPDATE public.users SET balance = v_new_recipient_balance WHERE id = v_recipient_user.id;

    -- Best-effort sync with double-entry ledger tables if present
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
                (v_sender_acct, v_recipient_acct, 'DEBIT', p_amount_kobo, COALESCE(p_idempotency_key, gen_random_uuid()::text) || '_debit'),
                (v_recipient_acct, v_sender_acct, 'CREDIT', p_amount_kobo, COALESCE(p_idempotency_key, gen_random_uuid()::text) || '_credit');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Do not abort user balance transfer if optional ledger_accounts schema differs
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'new_sender_balance', v_new_sender_balance,
        'new_recipient_balance', v_new_recipient_balance,
        'amount_naira', v_amount_naira
    );
END;
$$;

-- 5. Lock Down All SECURITY DEFINER RPCs to service_role ONLY
--    Prevents browser/mobile clients holding NEXT_PUBLIC_SUPABASE_ANON_KEY from invoking
--    privileged financial/admin functions directly via PostgREST.
DO $$
DECLARE
    v_func RECORD;
BEGIN
    FOR v_func IN
        SELECT p.oid::regprocedure AS func_sig
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'claim_ad_earning_atomic',
              'process_ledger_transfer',
              'transfer_user_funds',
              'initiate_atomic_withdrawal',
              'complete_withdrawal_atomic',
              'fail_withdrawal_atomic',
              'reverse_user_transfer',
              'spend_wallet_balance_atomic',
              'refund_wallet_deduction_atomic',
              'settle_withdrawal_atomic',
              'archive_completed_ad',
              'archive_expired_platform_ads',
              'delete_expired_completed_ads',
              'record_ad_impression',
              'record_ad_seen',
              'handle_earn_click',
              'handle_mutual_click',
              'increment_ad_click',
              'increment_user_click_progress',
              'process_feed_batch',
              'get_user_feed',
              'delete_expired_news',
              'delete_expired_notifications',
              'get_admin_reconciliation_metrics',
              'resolve_forfeited_balance'
          )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', v_func.func_sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', v_func.func_sig);
    END LOOP;
END;
$$;

