-- ============================================================
-- MIGRATION 005: TRANSFER REVERSALS & ADMIN SECURITY CONTROLS
-- High-Volume Financial Reconciliation & Compromise Safeguards
-- ============================================================

-- 1. Table for Pending Multi-Party Admin Approvals (Four-Eyes Principle)
CREATE TABLE IF NOT EXISTS public.pending_admin_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL, -- 'transfer_reversal', 'balance_adjustment', 'unpause_circuit_breaker'
    requested_by TEXT NOT NULL,
    target_identifier TEXT NOT NULL, -- reference ID, user email, etc.
    amount_naira NUMERIC(15,2) DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'
    approved_by TEXT,
    rejected_by TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_admin_requests_status ON public.pending_admin_requests (status);
CREATE INDEX IF NOT EXISTS idx_pending_admin_requests_requested_by ON public.pending_admin_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_pending_admin_requests_created ON public.pending_admin_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_admin_requests_status_created ON public.pending_admin_requests (status, created_at DESC);

GRANT ALL ON TABLE public.pending_admin_requests TO service_role;
GRANT SELECT ON TABLE public.pending_admin_requests TO authenticated;

-- Fast Single-Pass Summary Aggregation for Admin Dual-Auth Requests
CREATE OR REPLACE FUNCTION public.get_admin_requests_summary()
RETURNS JSONB AS $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT jsonb_build_object(
        'pending_count', COALESCE(COUNT(*) FILTER (WHERE status = 'PENDING'), 0),
        'approved_count', COALESCE(COUNT(*) FILTER (WHERE status = 'APPROVED'), 0),
        'rejected_count', COALESCE(COUNT(*) FILTER (WHERE status = 'REJECTED'), 0),
        'total_count', COUNT(*)
    ) INTO v_res
    FROM public.pending_admin_requests;

    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_admin_requests_summary() TO service_role;

-- 2. Stored Procedure: Atomic Transfer Reversal (Double-Entry Balanced)
CREATE OR REPLACE FUNCTION public.reverse_user_transfer(
    p_admin_email TEXT,
    p_reference TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_ref TEXT;
    v_admin_clean TEXT;
    v_sent_payment RECORD;
    v_rcv_payment RECORD;
    v_sender RECORD;
    v_recipient RECORD;
    v_amount NUMERIC(15,2);
    v_reversal_ref TEXT;
    v_new_recipient_bal NUMERIC(15,2);
    v_new_sender_bal NUMERIC(15,2);
BEGIN
    v_clean_ref := TRIM(p_reference);
    v_admin_clean := LOWER(TRIM(p_admin_email));

    IF v_clean_ref = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction reference is required');
    END IF;

    -- Check if reversal already happened for this reference
    IF EXISTS (
        SELECT 1 FROM public.payments 
        WHERE reference = 'rev_' || v_clean_ref 
           OR metadata->>'original_reference' = v_clean_ref
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This transfer has already been reversed');
    END IF;

    -- 1. Find the original transfer_sent record
    SELECT * INTO v_sent_payment 
    FROM public.payments 
    WHERE reference = v_clean_ref 
      AND type = 'transfer_sent' 
      AND status = 'success'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Original successful transfer record not found for reference: ' || v_clean_ref);
    END IF;

    v_amount := v_sent_payment.amount;

    -- 2. Find the recipient email from metadata or linked payment
    SELECT * INTO v_rcv_payment 
    FROM public.payments 
    WHERE (reference = v_clean_ref || '_rcv' OR metadata->>'sender_email' = v_sent_payment.user_email)
      AND type = 'transfer_received' 
      AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        -- Fallback to metadata in sent_payment
        IF v_sent_payment.metadata ? 'recipient_email' THEN
            v_rcv_payment.user_email := v_sent_payment.metadata->>'recipient_email';
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Could not locate recipient payment record');
        END IF;
    END IF;

    -- 3. Lock recipient row FOR UPDATE to check clawback balance
    SELECT id, email, balance INTO v_recipient 
    FROM public.users 
    WHERE LOWER(email) = LOWER(TRIM(v_rcv_payment.user_email)) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient account not found for clawback');
    END IF;

    IF COALESCE(v_recipient.balance, 0.00) < v_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Recipient account has insufficient available balance (₦' || COALESCE(v_recipient.balance, 0.00) || ') to claw back ₦' || v_amount || '. Freeze account or manual intervention required.'
        );
    END IF;

    -- 4. Lock sender row FOR UPDATE to credit funds back
    SELECT id, email, balance INTO v_sender 
    FROM public.users 
    WHERE LOWER(email) = LOWER(TRIM(v_sent_payment.user_email)) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Original sender account not found');
    END IF;

    -- 5. Perform atomic balance updates
    v_new_recipient_bal := COALESCE(v_recipient.balance, 0.00) - v_amount;
    v_new_sender_bal := COALESCE(v_sender.balance, 0.00) + v_amount;

    UPDATE public.users SET balance = v_new_recipient_bal WHERE id = v_recipient.id;
    UPDATE public.users SET balance = v_new_sender_bal WHERE id = v_sender.id;

    v_reversal_ref := 'rev_' || v_clean_ref;

    -- 6. Insert Balanced Double-Entry Reversal Payments
    INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
    VALUES (
        v_recipient.email,
        v_reversal_ref || '_clawback',
        v_amount,
        'success',
        'transfer_reversal_debit',
        'Transfer reversal clawback: ₦' || v_amount || ' for ref ' || v_clean_ref,
        jsonb_build_object(
            'original_reference', v_clean_ref,
            'reversed_by', v_admin_clean,
            'reason', p_reason,
            'target_user', v_sender.email
        )
    );

    INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
    VALUES (
        v_sender.email,
        v_reversal_ref || '_refund',
        v_amount,
        'success',
        'transfer_reversal_credit',
        'Transfer reversal refund: ₦' || v_amount || ' for ref ' || v_clean_ref,
        jsonb_build_object(
            'original_reference', v_clean_ref,
            'reversed_by', v_admin_clean,
            'reason', p_reason,
            'source_user', v_recipient.email
        )
    );

    -- 7. Insert Notifications to Both Users
    INSERT INTO public.notifications (user_email, title, message)
    VALUES (
        v_sender.email,
        'Transfer Reversed & Refunded',
        'Your transfer of ₦' || TO_CHAR(v_amount, 'FM999,999,990.00') || ' [Ref: ' || v_clean_ref || '] was reversed and credited back to your wallet. Reason: ' || p_reason
    );

    INSERT INTO public.notifications (user_email, title, message)
    VALUES (
        v_recipient.email,
        'Transfer Reversal Notice',
        'A transfer of ₦' || TO_CHAR(v_amount, 'FM999,999,990.00') || ' [Ref: ' || v_clean_ref || '] received was reversed by administrative dispute resolution. Reason: ' || p_reason
    );

    -- 8. Record Immutable Audit Log
    INSERT INTO public.admin_audit_logs (
        admin_email,
        action,
        target_id,
        target_type,
        reason,
        previous_state,
        new_state
    ) VALUES (
        v_admin_clean,
        'reverse_transfer',
        v_clean_ref,
        'transfer',
        p_reason,
        jsonb_build_object('sender_email', v_sender.email, 'recipient_email', v_recipient.email, 'amount', v_amount),
        jsonb_build_object('reversal_ref', v_reversal_ref, 'new_sender_bal', v_new_sender_bal, 'new_recipient_bal', v_new_recipient_bal)
    );

    RETURN jsonb_build_object(
        'success', true,
        'reference', v_reversal_ref,
        'amount', v_amount,
        'sender_email', v_sender.email,
        'recipient_email', v_recipient.email,
        'message', 'Transfer successfully reversed and funds restored'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_user_transfer(TEXT, TEXT, TEXT) TO service_role;

-- 3. Stored Procedure: Multi-Party Admin Request Approval (Four-Eyes Execution)
CREATE OR REPLACE FUNCTION public.approve_admin_request(
    p_approving_admin_email TEXT,
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_clean TEXT;
    v_req RECORD;
    v_exec_res JSONB;
BEGIN
    v_admin_clean := LOWER(TRIM(p_approving_admin_email));

    SELECT * INTO v_req FROM public.pending_admin_requests WHERE id = p_request_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pending admin request not found');
    END IF;

    IF v_req.status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is already ' || v_req.status);
    END IF;

    -- Security Guard: The approving admin CANNOT be the requesting admin (Four-Eyes Rule)
    IF LOWER(TRIM(v_req.requested_by)) = v_admin_clean THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dual authorization violation: You cannot approve your own administrative request');
    END IF;

    -- Execute based on action_type
    IF v_req.action_type = 'transfer_reversal' THEN
        v_exec_res := public.reverse_user_transfer(
            v_admin_clean,
            v_req.target_identifier,
            'Dual-Approved [Req by ' || v_req.requested_by || ']: ' || v_req.reason
        );

        IF (v_exec_res->>'success')::boolean = false THEN
            RETURN v_exec_res;
        END IF;

    ELSIF v_req.action_type = 'balance_adjustment' THEN
        UPDATE public.users 
        SET balance = (v_req.payload->>'new_balance')::NUMERIC 
        WHERE LOWER(email) = LOWER(TRIM(v_req.target_identifier));

        INSERT INTO public.admin_audit_logs (admin_email, action, target_id, target_type, reason, new_state)
        VALUES (
            v_admin_clean,
            'dual_approved_balance_adjustment',
            v_req.target_identifier,
            'user_balance',
            'Dual-Approved [Req by ' || v_req.requested_by || ']: ' || v_req.reason,
            v_req.payload
        );
    END IF;

    UPDATE public.pending_admin_requests 
    SET status = 'EXECUTED',
        approved_by = v_admin_clean,
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Administrative action approved and successfully executed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_admin_request(TEXT, UUID) TO service_role;
