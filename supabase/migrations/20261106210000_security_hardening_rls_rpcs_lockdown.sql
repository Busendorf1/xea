-- ============================================================================
-- MIGRATION: 20261106210000_security_hardening_rls_rpcs_lockdown.sql
-- Target: Supabase / PostgreSQL (udgaognmnfsiwvvqvxdq)
-- Purpose:
--   1. Revoke public/anon execute on financial & balance-crediting RPCs
--   2. Drop dangerous zero-downtime wide-open write/delete policies (table-existence checked)
--   3. Restrict public.users updates to non-sensitive profile columns only (column-existence checked)
--   4. Lock down public.payments so only service_role can write payment records
--   5. Lock down active ads & news feeds to read-only for public/anon
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1. REVOKE DANGEROUS RPC PERMISSIONS FROM PUBLIC ROLES (service_role ONLY)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'transfer_wallet_atomic') THEN
    REVOKE ALL ON FUNCTION public.transfer_wallet_atomic(text, text, numeric, text) FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.transfer_wallet_atomic(text, text, numeric, text) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'credit_affiliate_platform_share_atomic') THEN
    REVOKE ALL ON FUNCTION public.credit_affiliate_platform_share_atomic(numeric, uuid, text) FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.credit_affiliate_platform_share_atomic(numeric, uuid, text) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'apply_agent_commission_atomic') THEN
    REVOKE ALL ON FUNCTION public.apply_agent_commission_atomic(text, numeric, uuid) FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.apply_agent_commission_atomic(text, numeric, uuid) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'flush_affiliate_yield_shards_atomic') THEN
    REVOKE ALL ON FUNCTION public.flush_affiliate_yield_shards_atomic(text) FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.flush_affiliate_yield_shards_atomic(text) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reset_inactive_monetized_users') THEN
    REVOKE ALL ON FUNCTION public.reset_inactive_monetized_users() FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.reset_inactive_monetized_users() TO service_role;
  END IF;
END $$;

-- 2. DROP PERMISSIVE ZERO-DOWNTIME WRITE & DELETE POLICIES ACROSS EXISTING TABLES
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users',
    'adds',
    'addsactive',
    'completed_ads',
    'news',
    'newsactive',
    'ad_impressions',
    'payments',
    'notifications',
    'business_subscribers',
    'ad_reports',
    'referrals'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'xea_zero_downtime_insert_' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'xea_zero_downtime_update_' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'xea_zero_downtime_delete_' || t, t);
    END IF;
  END LOOP;
END $$;

-- 3. LOCK DOWN PAYMENTS TABLE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    DROP POLICY IF EXISTS xea_zero_downtime_select_payments ON public.payments;
    DROP POLICY IF EXISTS xea_service_role_all_payments ON public.payments;
    CREATE POLICY xea_service_role_all_payments ON public.payments
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    GRANT ALL ON public.payments TO service_role;
  END IF;
END $$;

-- 4. LOCK DOWN USERS TABLE: COLUMN-LEVEL PRIVILEGE RESTRICTION
DO $$
DECLARE
  col text;
  allowed_cols text[] := ARRAY[
    'firstName', 'lastName', 'username', 'bio', 'profileImage',
    'country', 'state', 'location', 'dob', 'gender', 'employment',
    'industry', 'interest', 'lifestyle', 'behavior', 'personality',
    'intl_travel', 'local_travel', 'business_name', 'has_updated_profile',
    'lastUpdated'
  ];
  existing_cols text[] := '{}';
  col_sql text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    REVOKE UPDATE, DELETE, INSERT ON public.users FROM anon, authenticated, PUBLIC;

    FOREACH col IN ARRAY allowed_cols
    LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = col
      ) THEN
        existing_cols := array_append(existing_cols, quote_ident(col));
      END IF;
    END LOOP;

    IF array_length(existing_cols, 1) > 0 THEN
      col_sql := array_to_string(existing_cols, ', ');
      EXECUTE format('GRANT UPDATE (%s) ON public.users TO anon, authenticated', col_sql);
    END IF;

    GRANT ALL ON public.users TO service_role;
  END IF;
END $$;

-- 5. LOCK DOWN ADVERTISEMENTS & HIGHLIGHTS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'addsactive') THEN
    ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS bid_price NUMERIC DEFAULT NULL;
    ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS is_bidded BOOLEAN DEFAULT FALSE;
    REVOKE INSERT, UPDATE, DELETE ON public.addsactive FROM anon, authenticated, PUBLIC;
    GRANT SELECT ON public.addsactive TO anon, authenticated;
    GRANT ALL ON public.addsactive TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'newsactive') THEN
    ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS bid_price NUMERIC DEFAULT NULL;
    ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS is_bidded BOOLEAN DEFAULT FALSE;
    REVOKE INSERT, UPDATE, DELETE ON public.newsactive FROM anon, authenticated, PUBLIC;
    GRANT SELECT ON public.newsactive TO anon, authenticated;
    GRANT ALL ON public.newsactive TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'adds') THEN
    ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS bid_price NUMERIC DEFAULT NULL;
    ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS is_bidded BOOLEAN DEFAULT FALSE;
    REVOKE INSERT, UPDATE, DELETE ON public.adds FROM anon, authenticated, PUBLIC;
    GRANT SELECT ON public.adds TO anon, authenticated;
    GRANT ALL ON public.adds TO service_role;

    ALTER TABLE public.adds ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS xea_adds_select ON public.adds;
    DROP POLICY IF EXISTS xea_adds_insert ON public.adds;
    DROP POLICY IF EXISTS xea_adds_update ON public.adds;
    DROP POLICY IF EXISTS xea_adds_delete ON public.adds;
    DROP POLICY IF EXISTS xea_service_role_all_adds ON public.adds;
    CREATE POLICY xea_service_role_all_adds ON public.adds
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY xea_adds_select ON public.adds
      FOR SELECT TO anon, authenticated
      USING (lower(user_email) = lower(coalesce(auth.jwt()->>'email', '')));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'news') THEN
    ALTER TABLE public.news ADD COLUMN IF NOT EXISTS bid_price NUMERIC DEFAULT NULL;
    ALTER TABLE public.news ADD COLUMN IF NOT EXISTS is_bidded BOOLEAN DEFAULT FALSE;
    REVOKE INSERT, UPDATE, DELETE ON public.news FROM anon, authenticated, PUBLIC;
    GRANT SELECT ON public.news TO anon, authenticated;
    GRANT ALL ON public.news TO service_role;

    ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS xea_news_select ON public.news;
    DROP POLICY IF EXISTS xea_news_insert ON public.news;
    DROP POLICY IF EXISTS xea_news_update ON public.news;
    DROP POLICY IF EXISTS xea_news_delete ON public.news;
    DROP POLICY IF EXISTS xea_service_role_all_news ON public.news;
    CREATE POLICY xea_service_role_all_news ON public.news
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY xea_news_select ON public.news
      FOR SELECT TO anon, authenticated
      USING (lower(user_email) = lower(coalesce(auth.jwt()->>'email', '')));
  END IF;
END $$;

-- 6. 100M+ USER SCALE FUNCTIONAL INDEXES (ELIMINATES SEQUENTIAL SCANS ON CASE-INSENSITIVE LOOKUPS)
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_lower_username ON public.users (lower(username));
CREATE INDEX IF NOT EXISTS idx_adds_lower_user_email ON public.adds (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_addsactive_lower_user_email ON public.addsactive (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_news_lower_user_email ON public.news (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_newsactive_lower_user_email ON public.newsactive (lower(user_email));

COMMIT;

NOTIFY pgrst, 'reload schema';
