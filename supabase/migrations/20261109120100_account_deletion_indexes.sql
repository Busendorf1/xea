-- Migration: 20261109120100_account_deletion_indexes.sql
-- ============================================================================
-- Run this directly in the Supabase SQL Editor.
-- The CONCURRENTLY keyword was removed so this script runs cleanly inside 
-- Supabase's implicit SQL Editor transaction block without triggering ERROR 25001.
-- ============================================================================

-- 1. O(log n) GIN index for mutuals array (prevents full-table scans when unbinding mutuals)
CREATE INDEX IF NOT EXISTS idx_users_mutuals_gin ON public.users USING gin (mutuals);

-- 2. Case-insensitive identity index on users table
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));

-- 3. Fast lookup for unbinding followers referred by the deleted user
CREATE INDEX IF NOT EXISTS idx_users_lower_referred_by ON public.users (lower(referred_by)) WHERE referred_by IS NOT NULL;

-- 4. Referral graph indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_lower ON public.referrals (lower(referrer_email), status);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_lower ON public.referrals (lower(referee_email));

-- 5. Per-user content and ledger tables
CREATE INDEX IF NOT EXISTS idx_notifications_lower_email ON public.notifications (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_ad_impressions_lower_email ON public.ad_impressions (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_payments_lower_user_email ON public.payments (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_forfeited_balances_lower_user_email ON public.forfeited_balances (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_adds_lower_email ON public.adds (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_addsactive_lower_email ON public.addsactive (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_news_lower_email ON public.news (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_newsactive_lower_email ON public.newsactive (lower(user_email));
