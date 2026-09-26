-- ============================================================
-- MIGRATION: BVN UNIQUE HASH column
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- 1. Add bvn_hash column to public.users table if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bvn_hash TEXT;

-- 2. Add unique constraint to bvn_hash to prevent duplicate registrations
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS unique_bvn_hash;
ALTER TABLE public.users ADD CONSTRAINT unique_bvn_hash UNIQUE (bvn_hash);
