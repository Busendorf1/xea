-- =========================================================
-- HIGH-SCALABILITY DATABASE MIGRATION FOR 100M+ USERS
-- =========================================================

-- 1. Composite B-Tree Indexes for Sub-Millisecond Feed Queries
CREATE INDEX IF NOT EXISTS idx_addsactive_feed_matching
ON public.addsactive (is_paused, completed_at, cost_per_impression DESC, created_at DESC)
WHERE is_paused = false AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_addsactive_demographics
ON public.addsactive (gender, country, state)
WHERE is_paused = false;

CREATE INDEX IF NOT EXISTS idx_adds_user_email
ON public.adds (user_email);

CREATE INDEX IF NOT EXISTS idx_ad_reports_ad_id
ON public.ad_reports (ad_id);

CREATE INDEX IF NOT EXISTS idx_blocked_ads_lookup
ON public.blocked_ads (ad_id, user_email);

CREATE INDEX IF NOT EXISTS idx_blocked_advertisers_email
ON public.blocked_advertisers (advertiser_email);

-- 2. Atomic Bulk Impression Increment RPC Function (Eliminates Write Locks)
CREATE OR REPLACE FUNCTION public.increment_ad_impressions_bulk(
    p_ad_id text,
    p_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update active table
    UPDATE public.addsactive
    SET impression_count = COALESCE(impression_count, 0) + p_count,
        completed_at = CASE 
            WHEN (COALESCE(impression_count, 0) + p_count) >= COALESCE(impressions, 1000) 
            THEN NOW() 
            ELSE completed_at 
        END
    WHERE id = p_ad_id;

    -- Update review/archive adds table
    UPDATE public.adds
    SET impression_count = COALESCE(impression_count, 0) + p_count,
        completed_at = CASE 
            WHEN (COALESCE(impression_count, 0) + p_count) >= COALESCE(impressions, 1000) 
            THEN NOW() 
            ELSE completed_at 
        END
    WHERE id = p_ad_id;
END;
$$;
