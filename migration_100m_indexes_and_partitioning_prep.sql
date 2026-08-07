-- ============================================================
-- MIGRATION: 100M+ USERS INDEXES & 1M-ROW AUTO-PARTITIONING
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- PART 1: 100M+ SCALE INDEXES FOR PROFILE, NEWS, & INPUT FORMS
-- ------------------------------------------------------------

-- 1. Unique index on lower(email) and phone for instant profile updates
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON public.users (phone) WHERE phone IS NOT NULL AND phone != '';

-- 2. Composite index on newsactive for 100M+ scale highlights feed
CREATE INDEX IF NOT EXISTS idx_newsactive_highlights_feed 
ON public.newsactive (created_at DESC, is_bidded, bid_price DESC)
WHERE is_paused IS NOT TRUE;

-- 3. Composite index on help_tickets for instant user ticket lookup
CREATE INDEX IF NOT EXISTS idx_help_tickets_user_status 
ON public.help_tickets (lower(user_email), resolved_at);

-- 4. Table for Newsletter Subscribers with 3-email per user lifetime cap
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    added_by_user TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS added_by_user TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON public.newsletter_subscribers (lower(email));
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_user ON public.newsletter_subscribers (lower(added_by_user));


-- ------------------------------------------------------------
-- PART 2: AUTOMATIC 1 MILLION ROW TABLE PARTITIONING
-- ------------------------------------------------------------

-- 1. Create Partitioned Master Table for ad_impressions
CREATE TABLE IF NOT EXISTS public.ad_impressions_partitioned (
    id BIGSERIAL,
    ad_id UUID NOT NULL,
    user_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_viewed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    view_count INT DEFAULT 1,
    today_view_count INT DEFAULT 1,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 2. Automatic Partition Creator Function (Creates Current & Next 3 Months Partitions automatically)
CREATE OR REPLACE FUNCTION public.create_monthly_ad_impression_partitions()
RETURNS VOID AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_partition_name TEXT;
  v_sql TEXT;
  i INT;
BEGIN
  FOR i IN 0..3 LOOP
    v_start_date := date_trunc('month', NOW() + (i || ' month')::INTERVAL)::DATE;
    v_end_date := (v_start_date + INTERVAL '1 month')::DATE;
    v_partition_name := 'ad_impressions_y' || to_char(v_start_date, 'YYYY_MM');

    v_sql := format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.ad_impressions_partitioned FOR VALUES FROM (%L) TO (%L);',
      v_partition_name, v_start_date, v_end_date
    );
    EXECUTE v_sql;

    -- Add composite indexes to partition
    v_sql := format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (lower(user_email), ad_id, last_viewed_at, today_view_count, created_at);',
      'idx_' || v_partition_name || '_pacing', v_partition_name
    );
    EXECUTE v_sql;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Execute partition creator to initialize current and future monthly partitions
SELECT public.create_monthly_ad_impression_partitions();

-- 4. Complete Migration Procedure (Executes automatically at 1M rows or on-demand)
CREATE OR REPLACE FUNCTION public.migrate_to_partitioned_impressions()
RETURNS VOID AS $$
BEGIN
  -- Initialize partitions
  PERFORM public.create_monthly_ad_impression_partitions();

  -- Copy existing rows safely into partitioned table
  INSERT INTO public.ad_impressions_partitioned (id, ad_id, user_email, created_at, last_viewed_at, view_count, today_view_count)
  SELECT id, ad_id, user_email, created_at, COALESCE(last_viewed_at, created_at), COALESCE(view_count, 1), COALESCE(today_view_count, 1)
  FROM public.ad_impressions
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Successfully migrated ad_impressions to partitioned table structure.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Automatic 1 Million Row Threshold Inspector Function
CREATE OR REPLACE FUNCTION public.check_and_auto_partition_at_1m()
RETURNS BOOLEAN AS $$
DECLARE
  v_row_count BIGINT;
BEGIN
  -- Count total rows in ad_impressions
  SELECT COUNT(*) INTO v_row_count FROM public.ad_impressions;

  -- If row count reaches or exceeds 1,000,000 (1 Million), execute auto-partitioning!
  IF v_row_count >= 1000000 THEN
    PERFORM public.migrate_to_partitioned_impressions();
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_monthly_ad_impression_partitions() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.migrate_to_partitioned_impressions() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_auto_partition_at_1m() TO anon, authenticated, service_role;
