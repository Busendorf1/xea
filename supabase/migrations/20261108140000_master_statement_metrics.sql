-- Migration: 20261108140000_master_statement_metrics.sql
-- Optimizes platform financial statement metrics aggregation into a single SQL pass

DROP FUNCTION IF EXISTS public.get_master_statement_metrics() CASCADE;

CREATE OR REPLACE FUNCTION public.get_master_statement_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inflows NUMERIC := 0;
  v_outflows NUMERIC := 0;
  v_success_count BIGINT := 0;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN type NOT IN ('withdrawal', 'transfer_sent') THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0),
    COUNT(*)
  INTO v_inflows, v_outflows, v_success_count
  FROM public.payments
  WHERE status = 'success';

  RETURN jsonb_build_object(
    'totalInflows', v_inflows,
    'totalOutflows', v_outflows,
    'netPlatformFlow', v_inflows - v_outflows,
    'totalSuccessfulCount', v_success_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_master_statement_metrics() TO authenticated, service_role;

-- Index on payments(status, type, amount) for fast aggregation
CREATE INDEX IF NOT EXISTS idx_payments_status_type_amount ON public.payments (status, type, amount);

-- Standard B-tree index on users(email) to enable fast O(log N) index lookups
CREATE INDEX IF NOT EXISTS idx_users_email_btree ON public.users (email);
