-- ============================================================================
-- MIGRATION: PAAYH AGENTS VIRAL REFERRAL SYSTEM (100M+ SCALE ATOMIC ENGINE)
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

-- 1. Extend public.users with Agent columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_registered_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_total_earned NUMERIC(12,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users (referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users (lower(referred_by));
CREATE INDEX IF NOT EXISTS idx_users_is_agent ON public.users (is_agent) WHERE is_agent = true;

-- 2. Ensure public.referrals table exists and has Agent commission & opt-out columns
CREATE TABLE IF NOT EXISTS public.referrals (
    id BIGSERIAL PRIMARY KEY,
    referrer_email TEXT NOT NULL,
    referee_email TEXT UNIQUE NOT NULL,
    device_hash TEXT,
    ip_address TEXT,
    status VARCHAR(20) DEFAULT 'active',
    interactions_count INT DEFAULT 0,
    commission_rate NUMERIC(5,4) DEFAULT 0.0200,
    total_commission_earned NUMERIC(12,2) DEFAULT 0.00,
    opt_out_status VARCHAR(20) DEFAULT 'none',
    opt_out_requested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    qualified_at TIMESTAMPTZ
);

ALTER TABLE public.referrals ALTER COLUMN device_hash DROP NOT NULL;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) DEFAULT 0.0200;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS total_commission_earned NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS opt_out_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS opt_out_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_lower ON public.referrals (lower(referrer_email), status);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_lower ON public.referrals (lower(referee_email));

-- 3. Create Agent Commission Audit Log table
CREATE TABLE IF NOT EXISTS public.agent_commission_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_email TEXT NOT NULL,
    referee_email TEXT NOT NULL,
    source_type VARCHAR(30) DEFAULT 'ad_earn',
    ad_id UUID,
    gross_earning NUMERIC(12,2) NOT NULL,
    deducted_commission NUMERIC(12,2) NOT NULL,
    net_referee_earning NUMERIC(12,2) NOT NULL,
    commission_rate NUMERIC(5,4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_comm_logs_agent ON public.agent_commission_logs (lower(agent_email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_comm_logs_referee ON public.agent_commission_logs (lower(referee_email), created_at DESC);

ALTER TABLE IF EXISTS public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_commission_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_commission_logs FROM anon, authenticated;

-- 4. Single-Round-Trip Atomic Commission Split RPC for 100M+ Scale (/api/earn hot path)
CREATE OR REPLACE FUNCTION public.apply_agent_commission_atomic(
    p_earner_email TEXT,
    p_gross_amount NUMERIC,
    p_ad_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_earner_email TEXT := lower(trim(p_earner_email));
    v_earner_is_agent BOOLEAN := false;
    v_earner_monetized BOOLEAN := false;
    v_earner_new_bal NUMERIC(12,2);
    v_ref_row RECORD;
    v_agent1_email TEXT;
    v_agent1_new_bal NUMERIC(12,2);
    v_rate NUMERIC(5,4);
    v_deducted NUMERIC(12,2);
    v_net_earner NUMERIC(12,2);
    v_agent1_net NUMERIC(12,2);
    v_up_row RECORD;
    v_agent0_email TEXT := NULL;
    v_agent0_cut NUMERIC(12,2) := 0.00;
    v_agent0_new_bal NUMERIC(12,2) := NULL;
BEGIN
    IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    -- 1. Lookup active upline referral row in O(1) via idx_referrals_referee_lower
    SELECT id, lower(trim(referrer_email)) AS referrer_email, status, opt_out_status
    INTO v_ref_row
    FROM public.referrals
    WHERE lower(referee_email) = v_earner_email
    LIMIT 1;

    IF NOT FOUND
       OR v_ref_row.status = 'opted_out'
       OR v_ref_row.opt_out_status IN ('accepted', 'forced') THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_agent1_email := v_ref_row.referrer_email;
    IF v_agent1_email IS NULL OR v_agent1_email = '' OR v_agent1_email = v_earner_email THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    -- 2. Check if earner is monetized (unmonetized accounts do not earn, so 0 commission for Agent)
    --    and check if earner is an Agent (4% deduction) or regular user (2% deduction)
    SELECT
        COALESCE(is_agent, false),
        (COALESCE(monetized::text, 'false') IN ('true', 'yes', '1', 't') OR COALESCE(monetization_clicks, 0) >= 300)
    INTO v_earner_is_agent, v_earner_monetized
    FROM public.users
    WHERE lower(email) = v_earner_email
    LIMIT 1;

    IF NOT COALESCE(v_earner_monetized, false) THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0, 'reason', 'EARNER_NOT_MONETIZED');
    END IF;

    v_rate := CASE WHEN v_earner_is_agent THEN 0.0400 ELSE 0.0200 END;
    v_deducted := ROUND(p_gross_amount * v_rate, 2);

    IF v_deducted <= 0 THEN
        RETURN jsonb_build_object('applied', false, 'deducted', 0);
    END IF;

    v_net_earner := ROUND(p_gross_amount - v_deducted, 2);
    v_agent1_net := v_deducted;

    -- 3. Check if Agent 1 also has an active upline Agent (Agent 0) -> 4% of Agent 1's earning
    SELECT id, lower(trim(referrer_email)) AS referrer_email, status, opt_out_status
    INTO v_up_row
    FROM public.referrals
    WHERE lower(referee_email) = v_agent1_email
    LIMIT 1;

    IF FOUND
       AND v_up_row.status != 'opted_out'
       AND COALESCE(v_up_row.opt_out_status, 'none') NOT IN ('accepted', 'forced')
       AND v_up_row.referrer_email != v_earner_email
       AND v_up_row.referrer_email != v_agent1_email THEN
        v_agent0_email := v_up_row.referrer_email;
        v_agent0_cut := ROUND(v_deducted * 0.0400, 2);
        IF v_agent0_cut > 0 THEN
            v_agent1_net := ROUND(v_deducted - v_agent0_cut, 2);
        END IF;
    END IF;

    -- 4. Deduct from earner and credit Agent 1 (and Agent 0 if present) atomically
    UPDATE public.users
    SET balance = GREATEST(0, ROUND(COALESCE(balance, 0) - v_deducted, 2))
    WHERE lower(email) = v_earner_email
    RETURNING balance INTO v_earner_new_bal;

    UPDATE public.users
    SET balance = ROUND(COALESCE(balance, 0) + v_agent1_net, 2),
        agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + v_agent1_net, 2)
    WHERE lower(email) = v_agent1_email
    RETURNING balance INTO v_agent1_new_bal;

    UPDATE public.referrals
    SET total_commission_earned = ROUND(COALESCE(total_commission_earned, 0) + v_deducted, 2),
        commission_rate = v_rate
    WHERE id = v_ref_row.id;

    IF v_agent0_email IS NOT NULL AND v_agent0_cut > 0 THEN
        UPDATE public.users
        SET balance = ROUND(COALESCE(balance, 0) + v_agent0_cut, 2),
            agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + v_agent0_cut, 2)
        WHERE lower(email) = v_agent0_email
        RETURNING balance INTO v_agent0_new_bal;

        UPDATE public.referrals
        SET total_commission_earned = ROUND(COALESCE(total_commission_earned, 0) + v_agent0_cut, 2),
            commission_rate = 0.0400
        WHERE id = v_up_row.id;
    END IF;

    RETURN jsonb_build_object(
        'applied', true,
        'deducted', v_deducted,
        'net_earner_amount', v_net_earner,
        'earner_new_balance', v_earner_new_bal,
        'agent1_email', v_agent1_email,
        'agent1_credit', v_agent1_net,
        'agent1_new_balance', v_agent1_new_bal,
        'agent0_email', v_agent0_email,
        'agent0_credit', v_agent0_cut,
        'agent0_new_balance', v_agent0_new_bal,
        'rate', v_rate
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) TO service_role;

COMMIT;
