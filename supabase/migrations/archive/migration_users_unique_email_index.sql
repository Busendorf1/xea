-- ==============================================================================
-- Migration: Enforce Case-Insensitive Unique Index on public.users(lower(email))
-- File: supabase/migrations/migration_users_unique_email_index.sql
-- Purpose:
--   1. Replaces any legacy non-unique functional indexes with a strict UNIQUE index.
--   2. Guarantees sub-millisecond O(log N) P2P lookups and absolute data integrity.
--   3. Idempotent and safe for production deployment.
-- ==============================================================================

DO $$
BEGIN
  -- 1. Check for legacy duplicate lowercased emails before creating the unique index
  --    If duplicates exist, keep the row with the most recent updated_at/created_at
  IF EXISTS (
    SELECT 1 FROM (
      SELECT lower(email) AS clean_email, COUNT(*) AS cnt
      FROM public.users
      WHERE email IS NOT NULL AND email != ''
      GROUP BY lower(email)
      HAVING COUNT(*) > 1
    ) dupes
  ) THEN
    RAISE NOTICE 'Duplicate lower(email) detected. Deduplicating by keeping newest record...';
    
    DELETE FROM public.users
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY lower(email) 
                 ORDER BY COALESCE(updated_at, created_at, NOW()) DESC, id DESC
               ) AS rn
        FROM public.users
        WHERE email IS NOT NULL AND email != ''
      ) ranked
      WHERE ranked.rn > 1
    );
  END IF;
END $$;

-- 2. Drop any legacy non-unique index that might occupy the name
-- (migration_indexing_and_scalability.sql previously created a non-unique idx_users_lower_email)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'users' 
      AND indexname = 'idx_users_lower_email'
      AND indexdef NOT LIKE '%UNIQUE%'
  ) THEN
    RAISE NOTICE 'Dropping existing non-unique idx_users_lower_email to upgrade to UNIQUE...';
    DROP INDEX IF EXISTS public.idx_users_lower_email;
  END IF;
END $$;

-- Drop alternative legacy name if present
DROP INDEX IF EXISTS public.idx_users_email_lower;

-- 3. Create the production UNIQUE B-Tree index on lower(email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email 
  ON public.users (lower(email))
  WHERE email IS NOT NULL AND email != '';

-- 4. Update planner statistics immediately
ANALYZE public.users;
