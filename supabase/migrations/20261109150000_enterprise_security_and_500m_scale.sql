-- ============================================================================
-- Migration: 20261109150000_enterprise_security_and_500m_scale.sql
-- Description:
-- 1. Enable Row Level Security (RLS) on public.users and restrict anon access
-- 2. Add partial index on users(lower(trim(email))) WHERE is_affiliate = TRUE
-- 3. Atomic balance increment RPC (eliminates JS read-modify-write races)
-- 4. Sharded impression counter table & RPCs (eliminates viral ad hot-row locks)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROW LEVEL SECURITY (RLS) ON public.users
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    -- Enable RLS
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

    -- Revoke direct table operations from anon/public
    REVOKE ALL ON public.users FROM anon, PUBLIC;

    -- Ensure service_role maintains full administrative privileges
    GRANT ALL ON public.users TO service_role;

    -- Authenticated users select policy: only their own row
    DROP POLICY IF EXISTS "Users can select own profile" ON public.users;
    CREATE POLICY "Users can select own profile"
      ON public.users
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = id OR
        lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      );

    -- Authenticated users update policy: only their own profile
    DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
    CREATE POLICY "Users can update own profile"
      ON public.users
      FOR UPDATE
      TO authenticated
      USING (
        auth.uid() = id OR
        lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
      WITH CHECK (
        auth.uid() = id OR
        lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      );

    -- Grant basic usage to authenticated role
    GRANT SELECT ON public.users TO authenticated;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. PARTIAL INDEX FOR CRITICAL-PATH AFFILIATE EMAIL SCAN
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_affiliate_active_emails
ON public.users (lower(trim(email)))
WHERE is_affiliate = TRUE;

-- ----------------------------------------------------------------------------
-- 3. ATOMIC USER BALANCE INCREMENT RPC (NO JS RACE CONDITIONS)
-- ----------------------------------------------------------------------------
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
  -- Row Exclusive Lock for update on the targeted user row
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

-- ----------------------------------------------------------------------------
-- 4. SHARDED IMPRESSION COUNTERS FOR 500M+ USER SCALE (VIRAL AD PROTECTION)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_impression_shards (
  ad_id UUID NOT NULL,
  shard_id SMALLINT NOT NULL,
  impression_count BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ad_id, shard_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_impression_shards_ad
ON public.ad_impression_shards (ad_id);

ALTER TABLE public.ad_impression_shards ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ad_impression_shards TO service_role;
GRANT SELECT ON public.ad_impression_shards TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.record_sharded_ad_impression(
  p_ad_id UUID,
  p_num_shards INT DEFAULT 32
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shard_id SMALLINT;
BEGIN
  v_shard_id := floor(random() * p_num_shards)::SMALLINT;

  INSERT INTO public.ad_impression_shards (ad_id, shard_id, impression_count, updated_at)
  VALUES (p_ad_id, v_shard_id, 1, now())
  ON CONFLICT (ad_id, shard_id)
  DO UPDATE SET
    impression_count = ad_impression_shards.impression_count + 1,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sharded_ad_impression(UUID, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.get_ad_sharded_impression_total(p_ad_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(impression_count), 0)::BIGINT
  FROM public.ad_impression_shards
  WHERE ad_id = p_ad_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_ad_sharded_impression_total(UUID) TO service_role, authenticated, anon;
