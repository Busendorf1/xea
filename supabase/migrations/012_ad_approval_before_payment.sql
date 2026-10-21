-- ============================================================
-- MIGRATION 012: CAMPAIGN APPROVAL BEFORE PAYMENT & 3-DAY AUTO-PURGE
-- Execute in Supabase SQL Editor
-- ============================================================

-- 1. Adds Table Enhancements
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review';
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- 2. News (Highlights) Table Enhancements
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review';
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- 3. Composite Performance Indexes (Optimized for 100M+ Scale & Fast Tab Filtering)
CREATE INDEX IF NOT EXISTS idx_adds_user_status_pending 
  ON public.adds (user_email, status) 
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_adds_approved_at_purge 
  ON public.adds (approved_at) 
  WHERE approved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_user_status_pending 
  ON public.news (user_email, status);

CREATE INDEX IF NOT EXISTS idx_news_approved_at_purge 
  ON public.news (approved_at) 
  WHERE approved_at IS NOT NULL;

-- 4. Native PostgreSQL pg_cron Job for Highly Reliable Hourly Purge
-- (Runs directly inside Postgres database engine; zero dependency on external hosting or Vercel cron)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if already registered to prevent duplicates
    PERFORM cron.unschedule('hourly-purge-expired-approved-campaigns')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-purge-expired-approved-campaigns');

    -- Schedule hourly cleanup
    PERFORM cron.schedule(
      'hourly-purge-expired-approved-campaigns',
      '0 * * * *',
      $cron$
        -- Purge expired approved ads (> 3 days = 72 hours)
        DELETE FROM public.adds 
        WHERE (
          status = 'approved_pending_publish' 
          OR (admin_statement IS NOT NULL AND admin_statement LIKE 'APPROVED:%')
        )
        AND (
          (approved_at IS NOT NULL AND approved_at < NOW() - INTERVAL '3 days')
          OR (created_at < NOW() - INTERVAL '3 days' AND (admin_statement LIKE 'APPROVED:%'))
        );

        -- Purge expired approved highlights (> 3 days = 72 hours)
        DELETE FROM public.news 
        WHERE (
          status = 'approved_pending_publish' 
          OR (admin_statement IS NOT NULL AND admin_statement LIKE 'APPROVED:%')
        )
        AND (
          (approved_at IS NOT NULL AND approved_at < NOW() - INTERVAL '3 days')
          OR (created_at < NOW() - INTERVAL '3 days' AND (admin_statement LIKE 'APPROVED:%'))
        );
      $cron$
    );
  END IF;
END $$;
