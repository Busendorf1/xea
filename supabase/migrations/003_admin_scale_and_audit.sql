-- ============================================================
-- MIGRATION 003: ADMIN SCALE, MEMORY PROTECTION & AUDIT TRAIL
-- Target: 100M+ Scale Optimization & Compliance Logging
-- ============================================================

-- 1. Enable pg_trgm for sub-millisecond fuzzy ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON public.users USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON public.users USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_help_tickets_user_email_trgm ON public.help_tickets USING gin (user_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_help_tickets_subject_trgm ON public.help_tickets USING gin (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ad_reports_reporter_email_trgm ON public.ad_reports USING gin (reporter_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ad_reports_advertiser_email_trgm ON public.ad_reports USING gin (advertiser_email gin_trgm_ops);

-- 2. Single-pass Aggregation RPC for Admin Overview Stats
-- Replaces O(N) memory-leaking in-memory reduction loops with single-query database engine aggregation
DROP FUNCTION IF EXISTS public.get_admin_overview_stats();

CREATE OR REPLACE FUNCTION public.get_admin_overview_stats()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_users BIGINT;
  v_total_balance NUMERIC;
  v_total_withdrawal NUMERIC;
  v_total_mutuals BIGINT;
  v_monetized_users BIGINT;
  v_suspended_users BIGINT;
  v_pending_ads BIGINT;
  v_active_ads BIGINT;
  v_pending_highlights BIGINT;
  v_active_highlights BIGINT;
  v_paused_ads BIGINT;
  v_reported_count BIGINT;
  v_help_tickets_count BIGINT;
  v_active_impressions BIGINT;
  v_active_mutuals BIGINT;
  v_target_impressions BIGINT;
  v_total_clicks BIGINT;
  v_click_rate NUMERIC;
BEGIN
  -- Aggregate user metrics
  SELECT 
    COUNT(*),
    COALESCE(SUM(COALESCE(balance, 0)), 0),
    COALESCE(SUM(COALESCE(withdrawal, 0)), 0),
    COALESCE(SUM(COALESCE(mutual_count, 0)), 0),
    COALESCE(COUNT(*) FILTER (WHERE lower(monetized::text) IN ('yes', 'true')), 0),
    COALESCE(COUNT(*) FILTER (WHERE suspended_until IS NOT NULL AND suspended_until > NOW()), 0)
  INTO 
    v_total_users,
    v_total_balance,
    v_total_withdrawal,
    v_total_mutuals,
    v_monetized_users,
    v_suspended_users
  FROM public.users;

  -- Count pending and active campaigns
  SELECT COUNT(*) INTO v_pending_ads FROM public.adds;
  SELECT COUNT(*) INTO v_active_ads FROM public.addsactive;
  SELECT COUNT(*) INTO v_pending_highlights FROM public.news;
  SELECT COUNT(*) INTO v_active_highlights FROM public.newsactive;
  SELECT COUNT(*) INTO v_reported_count FROM public.ad_reports;
  SELECT COUNT(*) INTO v_help_tickets_count FROM public.help_tickets;

  -- Count paused campaigns
  SELECT 
    (COALESCE((SELECT COUNT(*) FROM public.adds WHERE is_paused = true), 0) +
     COALESCE((SELECT COUNT(*) FROM public.addsactive WHERE is_paused = true), 0))
  INTO v_paused_ads;

  -- Calculate click and impression metrics
  SELECT 
    COALESCE(SUM(COALESCE(impression_count, 0)), 0),
    COALESCE(SUM(COALESCE(mutual_adds_count, 0)), 0),
    COALESCE(SUM(COALESCE(impressions, 0)), 0)
  INTO 
    v_active_impressions,
    v_active_mutuals,
    v_target_impressions
  FROM public.addsactive;

  v_total_clicks := v_active_impressions + v_active_mutuals;
  IF v_target_impressions > 0 THEN
    v_click_rate := ROUND((v_total_clicks::NUMERIC / v_target_impressions::NUMERIC) * 100, 2);
  ELSE
    v_click_rate := 0;
  END IF;

  SELECT jsonb_build_object(
    'totalUsers', v_total_users,
    'totalBalance', v_total_balance,
    'totalWithdrawal', v_total_withdrawal,
    'totalMutuals', v_total_mutuals,
    'monetizedUsers', v_monetized_users,
    'suspendedUsers', v_suspended_users,
    'pendingAdsCount', v_pending_ads,
    'activeAdsCount', v_active_ads,
    'pendingHighlightsCount', v_pending_highlights,
    'activeHighlightsCount', v_active_highlights,
    'pausedAdsCount', v_paused_ads,
    'reportedCount', v_reported_count,
    'helpTicketsCount', v_help_tickets_count,
    'totalClicks', v_total_clicks,
    'clickRate', v_click_rate,
    'timestamp', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_admin_overview_stats() TO service_role;

-- 3. Fast Reconciliation RPC (Zero-memory database calculation)
DROP FUNCTION IF EXISTS public.get_admin_reconciliation_metrics();

CREATE OR REPLACE FUNCTION public.get_admin_reconciliation_metrics()
RETURNS JSONB AS $$
DECLARE
  v_sent NUMERIC := 0;
  v_received NUMERIC := 0;
  v_variance NUMERIC := 0;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'transfer_sent' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'transfer_received' THEN amount ELSE 0 END), 0)
  INTO v_sent, v_received
  FROM public.payments
  WHERE status = 'success' AND type IN ('transfer_sent', 'transfer_received');

  v_variance := ABS(v_sent - v_received);

  RETURN jsonb_build_object(
    'total_sent_naira', v_sent,
    'total_received_naira', v_received,
    'variance_naira', v_variance,
    'status', CASE WHEN v_variance = 0 THEN 'HEALTHY' ELSE 'FLAGGED' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_admin_reconciliation_metrics() TO service_role;

-- 4. Audit Log Table for all Admin Actions & Mutations
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
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.admin_audit_logs (action);
