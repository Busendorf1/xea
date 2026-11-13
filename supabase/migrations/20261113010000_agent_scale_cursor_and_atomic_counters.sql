-- ============================================================================
-- MIGRATION: 500M+ SCALE AGENT PAGINATION, PRE-AGGREGATED COUNTERS & ATOMIC RPC
-- ============================================================================

BEGIN;

-- 1. Guarantee increment_user_balance_atomic exists in every environment (eliminates fallback race)
CREATE OR REPLACE FUNCTION public.increment_user_balance_atomic(
  p_email TEXT,
  p_amount NUMERIC,
  p_source TEXT DEFAULT 'commission',
  p_is_affiliate BOOLEAN DEFAULT FALSE,
  p_is_career BOOLEAN DEFAULT FALSE,
  p_affiliate_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_next_bal NUMERIC;
  v_next_aff_total NUMERIC;
BEGIN
  SELECT id, balance, affiliate_earned_total, is_affiliate, is_career, affiliate_role
  INTO v_user
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_email))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_next_bal := ROUND(COALESCE(v_user.balance, 0) + p_amount, 2);
  v_next_aff_total := ROUND(COALESCE(v_user.affiliate_earned_total, 0) + p_amount, 2);

  UPDATE public.users
  SET balance = v_next_bal,
      affiliate_earned_total = CASE WHEN p_source = 'affiliate' THEN v_next_aff_total ELSE affiliate_earned_total END,
      monetized = TRUE,
      is_affiliate = CASE WHEN p_is_affiliate THEN TRUE ELSE is_affiliate END,
      is_career = CASE WHEN p_is_career THEN TRUE ELSE is_career END,
      affiliate_role = CASE WHEN p_affiliate_role IS NOT NULL AND affiliate_role IS NULL THEN p_affiliate_role ELSE affiliate_role END
  WHERE id = v_user.id;

  RETURN jsonb_build_object(
    'success', true,
    'userId', v_user.id,
    'previousBalance', v_user.balance,
    'newBalance', v_next_bal,
    'affiliateTotal', v_next_aff_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_user_balance_atomic(TEXT, NUMERIC, TEXT, BOOLEAN, BOOLEAN, TEXT) TO service_role;

-- 2. Atomic increment on referrals.total_commission_earned + users.agent_total_earned
CREATE OR REPLACE FUNCTION public.increment_referral_commission_atomic(
  p_referrer_email TEXT,
  p_referee_email TEXT,
  p_amount NUMERIC,
  p_rate NUMERIC DEFAULT 0.01
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_referrer TEXT := lower(trim(COALESCE(p_referrer_email, '')));
  v_clean_referee TEXT := lower(trim(COALESCE(p_referee_email, '')));
  v_ref RECORD;
  v_next_edge_total NUMERIC;
BEGIN
  IF v_clean_referrer = '' OR v_clean_referee = '' OR COALESCE(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral commission parameters');
  END IF;

  SELECT id, total_commission_earned
  INTO v_ref
  FROM public.referrals
  WHERE lower(trim(referee_email)) = v_clean_referee
    AND lower(trim(referrer_email)) = v_clean_referrer
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral edge not found');
  END IF;

  v_next_edge_total := ROUND(COALESCE(v_ref.total_commission_earned, 0) + p_amount, 2);

  UPDATE public.referrals
  SET total_commission_earned = v_next_edge_total,
      commission_rate = COALESCE(p_rate, commission_rate)
  WHERE id = v_ref.id;

  UPDATE public.users
  SET agent_total_earned = ROUND(COALESCE(agent_total_earned, 0) + p_amount, 2)
  WHERE lower(trim(email)) = v_clean_referrer;

  RETURN jsonb_build_object(
    'success', true,
    'referralId', v_ref.id,
    'totalCommissionEarned', v_next_edge_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_referral_commission_atomic(TEXT, TEXT, NUMERIC, NUMERIC) TO service_role;

-- 3. Pre-aggregated invites counter on users + keyset pagination index on referrals
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS agent_invites_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS agent_total_earned NUMERIC(12,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_keyset_desc
  ON public.referrals (lower(referrer_email), created_at DESC, referee_email DESC)
  WHERE status IS DISTINCT FROM 'opted_out' AND COALESCE(is_opted_out, FALSE) = FALSE;

-- 4. Maintain agent_invites_count automatically on referral lifecycle transitions
CREATE OR REPLACE FUNCTION public.trg_fn_sync_agent_invites_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_active BOOLEAN := FALSE;
  v_new_active BOOLEAN := FALSE;
  v_old_ref TEXT := NULL;
  v_new_ref TEXT := NULL;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_ref := lower(trim(COALESCE(OLD.referrer_email, '')));
    v_old_active := (
      v_old_ref <> ''
      AND lower(COALESCE(OLD.status, 'active')) <> 'opted_out'
      AND COALESCE(OLD.is_opted_out, FALSE) = FALSE
      AND lower(COALESCE(OLD.opt_out_status, 'none')) NOT IN ('accepted', 'forced')
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_ref := lower(trim(COALESCE(NEW.referrer_email, '')));
    v_new_active := (
      v_new_ref <> ''
      AND lower(COALESCE(NEW.status, 'active')) <> 'opted_out'
      AND COALESCE(NEW.is_opted_out, FALSE) = FALSE
      AND lower(COALESCE(NEW.opt_out_status, 'none')) NOT IN ('accepted', 'forced')
    );
  END IF;

  IF v_old_active AND (NOT v_new_active OR v_old_ref IS DISTINCT FROM v_new_ref) THEN
    UPDATE public.users
    SET agent_invites_count = GREATEST(0, COALESCE(agent_invites_count, 0) - 1)
    WHERE lower(trim(email)) = v_old_ref;
  END IF;

  IF v_new_active AND (NOT v_old_active OR v_old_ref IS DISTINCT FROM v_new_ref) THEN
    UPDATE public.users
    SET agent_invites_count = COALESCE(agent_invites_count, 0) + 1
    WHERE lower(trim(email)) = v_new_ref;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_referrals_sync_invites_count ON public.referrals;
CREATE TRIGGER trg_referrals_sync_invites_count
  AFTER INSERT OR UPDATE OR DELETE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_agent_invites_count();

-- 5. Backfill pre-aggregated invites count & lifetime earned totals safely
WITH referral_agg AS (
  SELECT
    lower(trim(referrer_email)) AS ref_email,
    COUNT(*) FILTER (
      WHERE lower(COALESCE(status, 'active')) <> 'opted_out'
        AND COALESCE(is_opted_out, FALSE) = FALSE
        AND lower(COALESCE(opt_out_status, 'none')) NOT IN ('accepted', 'forced')
    )::INTEGER AS active_count,
    ROUND(COALESCE(SUM(COALESCE(total_commission_earned, 0)), 0), 2) AS earned_sum
  FROM public.referrals
  WHERE referrer_email IS NOT NULL AND trim(referrer_email) <> ''
  GROUP BY lower(trim(referrer_email))
)
UPDATE public.users u
SET
  agent_invites_count = a.active_count,
  agent_total_earned = GREATEST(COALESCE(u.agent_total_earned, 0), a.earned_sum)
FROM referral_agg a
WHERE lower(trim(u.email)) = a.ref_email;

COMMIT;
