-- 015_enable_rls_on_exposed_tables.sql
--
-- Context: scripts/check_rpc.js (anon-key RLS probe) found these tables readable by
-- anyone holding the public anon/publishable key (which ships to every browser):
--   adds, bidded_ads, premium_subscribers
--
-- The web app only reads/writes these tables server-side through the service-role
-- client (lib/utils/dbAdmin.ts), which bypasses RLS. No browser code queries them and
-- no Realtime subscription targets them, so enabling RLS with NO anon/authenticated
-- policies blocks public access without affecting the app.
--
-- Idempotent: safe to re-run.
-- Verify after applying:  node scripts/check_rpc.js   (should exit 0)

BEGIN;

-- Live Zero-Downtime Guard: If a table lock cannot be acquired within 4 seconds,
-- abort instead of queuing and blocking active user traffic.
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE IF EXISTS public.adds                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bidded_ads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.premium_subscribers ENABLE ROW LEVEL SECURITY;

-- Defence in depth: remove any table-level grants to the public roles.
-- service_role keeps full access and is unaffected by RLS.
REVOKE ALL ON TABLE public.adds                FROM anon, authenticated;
REVOKE ALL ON TABLE public.bidded_ads          FROM anon, authenticated;
REVOKE ALL ON TABLE public.premium_subscribers FROM anon, authenticated;

COMMIT;
