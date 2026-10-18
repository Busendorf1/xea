-- ==============================================================================
-- MIGRATION 011: IMMEDIATE BVN_HASH COMPATIBILITY & LOGIN UNBLOCK
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)
-- ==============================================================================

-- 1. Permanently drop bvn_hash and bvn from public.users
ALTER TABLE public.users DROP COLUMN IF EXISTS bvn_hash CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS bvn CASCADE;

-- 2. Sanitize any legacy 'PLACEHOLDER' string in users.dob
UPDATE public.users 
SET dob = '1970-01-01' 
WHERE dob IS NULL OR dob::TEXT = 'PLACEHOLDER' OR dob::TEXT = '';

-- 3. Case-insensitive index on email
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));

-- 4. Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
