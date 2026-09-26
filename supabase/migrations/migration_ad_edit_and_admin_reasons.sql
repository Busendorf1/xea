-- ============================================================
-- MIGRATION: AD EDITING, ADMIN STATEMENTS & PERFORMANCE INDEXING
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add admin_statement column to public.adds and public.addsactive
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS admin_statement TEXT;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS admin_statement TEXT;

-- 2. Add performance composite indexes for scaling to 100M+ users
CREATE INDEX IF NOT EXISTS idx_adds_user_email_created ON public.adds (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addsactive_user_email_created ON public.addsactive (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addsactive_status_geo ON public.addsactive (country, state, province);
