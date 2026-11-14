-- ============================================================================
-- Drop legacy 12-argument `get_ad_capacity_counts` overload that caused
-- PostgREST PGRST203 ambiguity alongside the 8-argument `20261114190000` RPC.
-- Safe and idempotent across both web (`xea`) and mobile (`xea-mobile`) repos.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_ad_capacity_counts(
    TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT,
    TEXT[], TEXT[], TEXT[], TEXT[], TEXT[]
) CASCADE;

NOTIFY pgrst, 'reload schema';
