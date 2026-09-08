-- ============================================================
-- MIGRATION 006: FORFEITED BALANCE RESOLUTION & PLATFORM TREASURY
-- Tracks forfeited balances from deactivated accounts,
-- allows admin resolution to platform treasury,
-- and records an immutable audit log trail.
-- ============================================================

-- 1. Table: Forfeited Balances from Deactivated Accounts
CREATE TABLE IF NOT EXISTS public.forfeited_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    username TEXT,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'NGN' NOT NULL,
    reason TEXT DEFAULT 'Account deactivation forfeiture' NOT NULL,
    status TEXT DEFAULT 'PENDING' NOT NULL CHECK (status IN ('PENDING', 'RESOLVED', 'REVERSED')),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forfeited_balances_status ON public.forfeited_balances (status);
CREATE INDEX IF NOT EXISTS idx_forfeited_balances_user_email ON public.forfeited_balances (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_forfeited_balances_created_at ON public.forfeited_balances (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forfeited_balances_status_created ON public.forfeited_balances (status, created_at DESC);

GRANT ALL ON TABLE public.forfeited_balances TO service_role;
GRANT SELECT ON TABLE public.forfeited_balances TO authenticated;

-- Fast Single-Pass Aggregation RPC for Forfeited Balances Summary (Zero Node.js memory overhead)
CREATE OR REPLACE FUNCTION public.get_forfeited_balances_summary()
RETURNS JSONB AS $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT jsonb_build_object(
        'pending_count', COALESCE(COUNT(*) FILTER (WHERE status = 'PENDING'), 0),
        'pending_total', COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0),
        'resolved_count', COALESCE(COUNT(*) FILTER (WHERE status = 'RESOLVED'), 0),
        'resolved_total', COALESCE(SUM(amount) FILTER (WHERE status = 'RESOLVED'), 0)
    ) INTO v_res
    FROM public.forfeited_balances;
    
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_forfeited_balances_summary() TO service_role;

-- 2. Table: Platform Treasury (Platform Balance Tracker)
CREATE TABLE IF NOT EXISTS public.platform_treasury (
    id TEXT PRIMARY KEY DEFAULT 'primary',
    balance NUMERIC(15,2) DEFAULT 0.00 NOT NULL,
    total_forfeited_absorbed NUMERIC(15,2) DEFAULT 0.00 NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_treasury (id, balance, total_forfeited_absorbed)
VALUES ('primary', 0.00, 0.00)
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON TABLE public.platform_treasury TO service_role;
GRANT SELECT ON TABLE public.platform_treasury TO authenticated;

-- 3. Dependency Tables (Ensures safe execution if prior migrations were skipped)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT,
    previous_state JSONB,
    new_state JSONB,
    reason TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.admin_audit_logs (admin_email);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    sender_email TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT', 'TRANSFER')),
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('PENDING', 'POSTED', 'REJECTED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_sender ON public.ledger_entries (lower(sender_email));
CREATE INDEX IF NOT EXISTS idx_ledger_recipient ON public.ledger_entries (lower(recipient_email));

CREATE TABLE IF NOT EXISTS public.system_reconciliation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('HEALTHY', 'FLAGGED', 'RESOLVED')),
    total_credits_kobo BIGINT NOT NULL,
    total_debits_kobo BIGINT NOT NULL,
    variance_kobo BIGINT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON public.system_reconciliation_logs (status);

GRANT ALL ON TABLE public.admin_audit_logs TO service_role;
GRANT ALL ON TABLE public.ledger_entries TO service_role;
GRANT ALL ON TABLE public.system_reconciliation_logs TO service_role;

-- 4. Stored Procedure: Atomic Forfeited Balance Resolution
CREATE OR REPLACE FUNCTION public.resolve_forfeited_balance(
    p_admin_email TEXT,
    p_forfeiture_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_forfeiture RECORD;
    v_admin_clean TEXT;
    v_amount NUMERIC(15,2);
    v_ref TEXT;
    v_prev_treasury NUMERIC(15,2);
    v_new_treasury NUMERIC(15,2);
BEGIN
    v_admin_clean := LOWER(TRIM(p_admin_email));

    -- Lock forfeiture record
    SELECT * INTO v_forfeiture
    FROM public.forfeited_balances
    WHERE id = p_forfeiture_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forfeited balance record not found');
    END IF;

    IF v_forfeiture.status != 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This forfeiture has already been resolved (Status: ' || v_forfeiture.status || ')');
    END IF;

    v_amount := v_forfeiture.amount;
    v_ref := 'FORFEIT-RES-' || SUBSTRING(p_forfeiture_id::text, 1, 8) || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;

    -- Lock and retrieve platform treasury
    SELECT balance INTO v_prev_treasury
    FROM public.platform_treasury
    WHERE id = 'primary'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.platform_treasury (id, balance, total_forfeited_absorbed, updated_at)
        VALUES ('primary', v_amount, v_amount, NOW())
        RETURNING balance INTO v_new_treasury;
        v_prev_treasury := 0.00;
    ELSE
        UPDATE public.platform_treasury
        SET balance = balance + v_amount,
            total_forfeited_absorbed = total_forfeited_absorbed + v_amount,
            updated_at = NOW()
        WHERE id = 'primary'
        RETURNING balance INTO v_new_treasury;
    END IF;

    -- Mark forfeiture as RESOLVED
    UPDATE public.forfeited_balances
    SET status = 'RESOLVED',
        resolved_at = NOW(),
        resolved_by = v_admin_clean,
        resolution_notes = COALESCE(p_notes, 'Resolved to platform treasury by admin')
    WHERE id = p_forfeiture_id;

    -- Record in payments history for transparency
    INSERT INTO public.payments (
        user_email,
        amount,
        type,
        status,
        reference,
        created_at,
        metadata
    ) VALUES (
        'platform@paayh.com',
        v_amount,
        'forfeited_balance_resolution',
        'success',
        v_ref,
        NOW(),
        jsonb_build_object(
            'forfeiture_id', p_forfeiture_id,
            'source_user_email', v_forfeiture.user_email,
            'resolved_by', v_admin_clean,
            'notes', p_notes
        )
    );

    -- Record in double-entry ledger_entries
    INSERT INTO public.ledger_entries (
        reference,
        sender_email,
        recipient_email,
        amount_kobo,
        entry_type,
        status,
        metadata,
        created_at
    ) VALUES (
        v_ref,
        v_forfeiture.user_email,
        'platform@paayh.com',
        ROUND(v_amount * 100)::BIGINT,
        'CREDIT',
        'POSTED',
        jsonb_build_object(
            'forfeiture_id', p_forfeiture_id,
            'resolved_by', v_admin_clean,
            'notes', p_notes
        ),
        NOW()
    );

    -- Record in admin_audit_logs (Immutable audit trail)
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
        'resolve_forfeited_balance',
        p_forfeiture_id::text,
        'forfeited_balance',
        COALESCE(p_notes, 'Resolved deactivated account forfeited balance to platform balance'),
        jsonb_build_object(
            'status', 'PENDING',
            'amount', v_amount,
            'user_email', v_forfeiture.user_email,
            'platform_treasury_before', v_prev_treasury
        ),
        jsonb_build_object(
            'status', 'RESOLVED',
            'amount', v_amount,
            'resolved_by', v_admin_clean,
            'resolved_at', NOW(),
            'platform_treasury_after', v_new_treasury,
            'reference', v_ref
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Forfeited balance of ₦' || v_amount::text || ' successfully resolved to platform balance',
        'forfeiture_id', p_forfeiture_id,
        'amount', v_amount,
        'platform_balance', v_new_treasury,
        'reference', v_ref
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_forfeited_balance(TEXT, UUID, TEXT) TO service_role;
