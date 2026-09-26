-- ============================================================
-- MIGRATION: HIGH-PERFORMANCE MONETIZATION INDEXES
-- Run this in your Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Accelerate email lookups to sub-millisecond speeds (<1ms)
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- 2. Accelerate monetization status & click progress queries
CREATE INDEX IF NOT EXISTS idx_users_monetized_clicks ON public.users (monetized, monetization_clicks);

-- 3. Accelerate 7-day inactivity tracking
CREATE INDEX IF NOT EXISTS idx_users_last_active ON public.users (last_active_at);

-- 4. Ensure correct RPC execution permissions
GRANT EXECUTE ON FUNCTION public.check_and_update_monetization_status(TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.increment_user_click_progress(TEXT, INT) TO authenticated, service_role, anon;
