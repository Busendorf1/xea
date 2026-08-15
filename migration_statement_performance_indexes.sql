-- ============================================================
-- MIGRATION: HIGH-PERFORMANCE STATEMENT & PAYMENTS INDEXES
-- Run this in your Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Accelerate statement payments queries by user_email and type
CREATE INDEX IF NOT EXISTS idx_payments_user_email_type ON public.payments (user_email, type, created_at DESC);

-- 2. Accelerate statement queries by user_email ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_payments_user_email_created ON public.payments (user_email, created_at DESC);
