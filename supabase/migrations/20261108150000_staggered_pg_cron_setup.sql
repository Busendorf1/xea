-- Migration: 20261108150000_staggered_pg_cron_setup.sql
-- Native PostgreSQL pg_cron procedures for 6-hour staggered active-active failover

-- 1. Database Cleanup Stored Procedure
CREATE OR REPLACE FUNCTION public.run_database_cleanup_cron()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_ads INT := 0;
  v_expired_news INT := 0;
  v_completed_ads INT := 0;
  v_tickets INT := 0;
  v_cooldowns INT := 0;
BEGIN
  -- 1. Purge expired approved campaigns (> 3 days)
  DELETE FROM public.adds 
  WHERE (status = 'approved_pending_publish' OR admin_statement LIKE 'APPROVED:%')
    AND (
      (approved_at IS NOT NULL AND approved_at < NOW() - INTERVAL '3 days')
      OR (created_at < NOW() - INTERVAL '3 days' AND admin_statement LIKE 'APPROVED:%')
    );
  GET DIAGNOSTICS v_expired_ads = ROW_COUNT;

  DELETE FROM public.news 
  WHERE (status = 'approved_pending_publish' OR admin_statement LIKE 'APPROVED:%')
    AND (
      (approved_at IS NOT NULL AND approved_at < NOW() - INTERVAL '3 days')
      OR (created_at < NOW() - INTERVAL '3 days' AND admin_statement LIKE 'APPROVED:%')
    );
  GET DIAGNOSTICS v_expired_news = ROW_COUNT;

  -- 2. Archive and purge completed ads older than 48 hours
  DELETE FROM public.completed_ads
  WHERE completed_at < NOW() - INTERVAL '48 hours';
  GET DIAGNOSTICS v_completed_ads = ROW_COUNT;

  -- 3. Purge resolved help tickets older than 24 hours
  DELETE FROM public.help_tickets
  WHERE resolved_at IS NOT NULL
    AND resolved_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_tickets = ROW_COUNT;

  -- 4. Lift expired account suspensions / pacing cooldowns
  UPDATE public.users
  SET suspended_until = NULL
  WHERE suspended_until IS NOT NULL AND suspended_until < NOW();
  GET DIAGNOSTICS v_cooldowns = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'expired_approved_ads_purged', v_expired_ads,
    'expired_approved_news_purged', v_expired_news,
    'completed_ads_purged', v_completed_ads,
    'resolved_tickets_purged', v_tickets,
    'cooldowns_cleared', v_cooldowns,
    'executed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_database_cleanup_cron() TO authenticated, service_role;

-- 2. Financial Ledger Reconciliation Stored Procedure
CREATE OR REPLACE FUNCTION public.run_ledger_reconciliation_cron()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent NUMERIC := 0;
  v_received NUMERIC := 0;
  v_variance NUMERIC := 0;
  v_status TEXT := 'HEALTHY';
  v_notes TEXT;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'transfer_sent' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'transfer_received' THEN amount ELSE 0 END), 0)
  INTO v_sent, v_received
  FROM public.payments
  WHERE status = 'success' AND type IN ('transfer_sent', 'transfer_received');

  v_variance := ABS(v_sent - v_received);
  IF v_variance > 0 THEN
    v_status := 'FLAGGED';
    v_notes := 'Discrepancy detected during DB pg_cron audit. Total Sent: ' || v_sent || ', Received: ' || v_received || ', Variance: ' || v_variance;
  ELSE
    v_notes := 'Nightly DB pg_cron audit passed with 0.00 variance.';
  END IF;

  INSERT INTO public.system_reconciliation_logs (
    status,
    total_credits_kobo,
    total_debits_kobo,
    variance_kobo,
    notes,
    created_at
  ) VALUES (
    v_status,
    ROUND(v_received * 100),
    ROUND(v_sent * 100),
    ROUND(v_variance * 100),
    v_notes,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'total_sent', v_sent,
    'total_received', v_received,
    'variance', v_variance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_ledger_reconciliation_cron() TO authenticated, service_role;

-- 3. Register Staggered Schedules in pg_cron (if extension enabled)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing jobs to prevent duplicate entries
    PERFORM cron.unschedule('db-cleanup-staggered')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'db-cleanup-staggered');

    PERFORM cron.unschedule('db-ledger-reconcile-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'db-ledger-reconcile-daily');

    -- Schedule Database Cleanup at 00:00 and 12:00 UTC (Vercel runs at 06:00 and 18:00 UTC)
    PERFORM cron.schedule(
      'db-cleanup-staggered',
      '0 0,12 * * *',
      'SELECT public.run_database_cleanup_cron();'
    );

    -- Schedule Ledger Reconciliation at 02:00 UTC (Vercel runs at 08:00 UTC)
    PERFORM cron.schedule(
      'db-ledger-reconcile-daily',
      '0 2 * * *',
      'SELECT public.run_ledger_reconciliation_cron();'
    );
  END IF;
END $$;
