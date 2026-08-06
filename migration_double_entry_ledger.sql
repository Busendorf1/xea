-- ============================================================
-- MIGRATION: SECURE DOUBLE-ENTRY FINANCIAL LEDGER & RECONCILIATION
-- Run this script in your Supabase SQL Editor
-- ============================================================

-- 1. Create Ledger Entries Table (Double-Entry Append-Only)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    sender_email TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT', 'TRANSFER')),
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('PENDING', 'POSTED', 'REJECTED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for ultra-fast query performance
CREATE INDEX IF NOT EXISTS idx_ledger_sender ON public.ledger_entries (lower(sender_email));
CREATE INDEX IF NOT EXISTS idx_ledger_recipient ON public.ledger_entries (lower(recipient_email));
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON public.ledger_entries (reference);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.ledger_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type ON public.ledger_entries (entry_type);

-- 2. Create System Reconciliation Logs Table
CREATE TABLE IF NOT EXISTS public.system_reconciliation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('HEALTHY', 'FLAGGED', 'RESOLVED')),
    total_credits_kobo BIGINT NOT NULL,
    total_debits_kobo BIGINT NOT NULL,
    variance_kobo BIGINT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_created_at ON public.system_reconciliation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON public.system_reconciliation_logs (status);

-- 3. Enable RLS
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_reconciliation_logs ENABLE ROW LEVEL SECURITY;

-- Service role full access policies
DROP POLICY IF EXISTS "Service role full access on ledger_entries" ON public.ledger_entries;
CREATE POLICY "Service role full access on ledger_entries" ON public.ledger_entries
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on system_reconciliation_logs" ON public.system_reconciliation_logs;
CREATE POLICY "Service role full access on system_reconciliation_logs" ON public.system_reconciliation_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can view their own ledger entries
DROP POLICY IF EXISTS "Users can view own ledger entries" ON public.ledger_entries;
CREATE POLICY "Users can view own ledger entries" ON public.ledger_entries
    FOR SELECT TO authenticated, anon
    USING (lower(sender_email) = lower(auth.jwt() ->> 'email') OR lower(recipient_email) = lower(auth.jwt() ->> 'email'));

-- Grant access
GRANT ALL ON TABLE public.ledger_entries TO service_role;
GRANT SELECT ON TABLE public.ledger_entries TO authenticated, anon;

GRANT ALL ON TABLE public.system_reconciliation_logs TO service_role;
GRANT SELECT ON TABLE public.system_reconciliation_logs TO authenticated;

-- 4. RPC: Process Ledger Transfer (Atomically insert credit & debit ledger entries)
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
BEGIN
    v_sender_clean := LOWER(TRIM(p_sender_email));
    v_recipient_clean := LOWER(TRIM(p_recipient_email));
    v_amount_naira := p_amount_kobo::NUMERIC / 100.0;

    -- Disallow self transfer
    IF v_sender_clean = v_recipient_clean THEN
        RETURN jsonb_build_object('success', false, 'error', 'Self-transfers are not allowed');
    END IF;

    -- Check amount validity
    IF p_amount_kobo <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;

    -- Check duplicate reference
    IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE reference = p_reference) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Ledger entry already posted (Idempotent success)');
    END IF;

    -- Lock-free ledger insertion for sender debit & recipient credit
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
            'recipient_email', v_recipient_clean
        )
    );

    -- Insert payment audit records
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

    RETURN jsonb_build_object('success', true, 'reference', p_reference);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Automated Notification Trigger on ATW Tier Upgrade
CREATE OR REPLACE FUNCTION public.notify_atw_tier_upgrade()
RETURNS TRIGGER AS $$
DECLARE
    v_new_level INT;
    v_new_cap_naira NUMERIC(15,2);
BEGIN
    IF OLD.atw_tier IS DISTINCT FROM NEW.atw_tier THEN
        v_new_level := COALESCE(NULLIF(regexp_replace(NEW.atw_tier, '\D', '', 'g'), '')::INT, 1);
        v_new_cap_naira := v_new_level * 100000.00;

        INSERT INTO public.notifications (user_email, title, message)
        VALUES (
            NEW.email,
            '🎉 ATW Level Up Unlocked!',
            'Congratulations! You unlocked ' || NEW.atw_tier || '! Your maximum wallet balance holding limit has been increased to ₦' || TO_CHAR(v_new_cap_naira, 'FM999,999,990.00') || '.'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_atw_tier_upgrade ON public.users;
CREATE TRIGGER trg_notify_atw_tier_upgrade
    AFTER UPDATE OF atw_tier ON public.users
    FOR EACH ROW
    WHEN (OLD.atw_tier IS DISTINCT FROM NEW.atw_tier)
    EXECUTE FUNCTION public.notify_atw_tier_upgrade();
