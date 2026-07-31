-- ============================================================
-- MIGRATION 002: ADMIN SECURITY & PERFORMANCE OPTIMIZATIONS
-- ============================================================

-- 1. Create SQL Aggregation RPC (get_admin_overview_stats)
-- Replaces O(N) Node.js in-memory reduce/filter loops with single-pass database aggregation
DROP FUNCTION IF EXISTS public.get_admin_overview_stats();

CREATE OR REPLACE FUNCTION public.get_admin_overview_stats()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalUsers', COALESCE((SELECT COUNT(*) FROM public.users), 0),
    'totalBalance', COALESCE((SELECT SUM(COALESCE(balance, 0)) FROM public.users), 0),
    'totalWithdrawal', COALESCE((SELECT SUM(COALESCE(withdrawal, 0)) FROM public.users), 0),
    'totalMutuals', COALESCE((SELECT SUM(COALESCE(mutual_count, 0)) FROM public.users), 0),
    'monetizedUsers', COALESCE((SELECT COUNT(*) FROM public.users WHERE lower(monetized) IN ('yes', 'true')), 0),
    'suspendedUsers', COALESCE((SELECT COUNT(*) FROM public.users WHERE suspended_until IS NOT NULL AND suspended_until > NOW()), 0),
    'pendingAdsCount', COALESCE((SELECT COUNT(*) FROM public.adds), 0),
    'activeAdsCount', COALESCE((SELECT COUNT(*) FROM public.addsactive), 0),
    'pendingHighlightsCount', COALESCE((SELECT COUNT(*) FROM public.news), 0),
    'activeHighlightsCount', COALESCE((SELECT COUNT(*) FROM public.newsactive), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_admin_overview_stats() TO service_role;
