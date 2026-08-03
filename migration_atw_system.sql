-- ============================================================
-- MIGRATION: ATW SCORE SYSTEM, PREMIUM SUBSCRIBERS & 7-DAY GRACE
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- 1. Add ATW Score, Tier, and Official Account fields to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS attention_worth_score NUMERIC(12,4) DEFAULT 0.1000;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS atw_tier VARCHAR(10) DEFAULT 'ATW1';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_official_platform_account BOOLEAN DEFAULT false;

-- Create index for fast ATW tier queries
CREATE INDEX IF NOT EXISTS idx_users_atw_tier ON public.users (atw_tier);
CREATE INDEX IF NOT EXISTS idx_users_attention_score ON public.users (attention_worth_score);

-- 2. Create Premium Subscribers Table
CREATE TABLE IF NOT EXISTS public.premium_subscribers (
    id UUID DEFAULT extensions.uuid_generate_v4() NOT NULL,
    business_name TEXT NOT NULL,
    domain TEXT UNIQUE NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 30.00 NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    contact_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT premium_subscribers_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_premium_subscribers_domain ON public.premium_subscribers (lower(domain));

-- Seed official baggyt.com subscriber record
INSERT INTO public.premium_subscribers (business_name, domain, discount_percentage, status, contact_email)
VALUES ('Baggyt E-commerce', 'baggyt.com', 30.00, 'active', 'official@baggyt.com')
ON CONFLICT (domain) DO UPDATE SET discount_percentage = 30.00, status = 'active';

-- Seed official Baggyt platform account in users if exists, or update flag
UPDATE public.users
SET is_official_platform_account = true
WHERE lower(email) = 'official@baggyt.com' OR lower(business_name) = 'baggyt official';

-- 3. Create Completed Ads Rating Ledger Table
CREATE TABLE IF NOT EXISTS public.completed_ads_ratings (
    id UUID DEFAULT extensions.uuid_generate_v4() NOT NULL,
    ad_id UUID NOT NULL,
    advertiser_email TEXT NOT NULL,
    star_rating INT NOT NULL CHECK (star_rating >= 1 AND star_rating <= 5),
    score_increment NUMERIC(6,4) NOT NULL,
    listeners_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT completed_ads_ratings_pkey PRIMARY KEY (id),
    CONSTRAINT unique_ad_advertiser_rating UNIQUE (ad_id, advertiser_email)
);

CREATE INDEX IF NOT EXISTS idx_completed_ads_ratings_ad ON public.completed_ads_ratings (ad_id);

-- 4. RPC to batch update listener ATW scores on advertiser rating
CREATE OR REPLACE FUNCTION public.apply_ad_rating_to_listeners(
    p_ad_id UUID,
    p_advertiser_email TEXT,
    p_star_rating INT
) RETURNS NUMERIC AS $$
DECLARE
    v_increment NUMERIC(6,4);
    v_listeners TEXT[];
    v_listener_count INT := 0;
BEGIN
    -- Determine score increment based on 1 to 5 star rating
    IF p_star_rating = 1 THEN 
        v_increment := 0.0100;
    ELSIF p_star_rating = 2 THEN 
        v_increment := 0.0200;
    ELSIF p_star_rating = 3 THEN 
        v_increment := 0.0300;
    ELSIF p_star_rating = 4 THEN 
        v_increment := 0.0400;
    ELSIF p_star_rating = 5 THEN 
        v_increment := 0.0500;
    ELSE 
        RAISE EXCEPTION 'Invalid star rating. Must be between 1 and 5.';
    END IF;

    -- Fetch all distinct listeners who viewed this ad
    SELECT ARRAY_AGG(DISTINCT lower(user_email))
    INTO v_listeners
    FROM public.ad_impressions
    WHERE ad_id = p_ad_id AND user_email IS NOT NULL AND user_email != '';

    IF v_listeners IS NOT NULL AND cardinality(v_listeners) > 0 THEN
        v_listener_count := cardinality(v_listeners);

        -- Update attention_worth_score with a peak ceiling of 1,000,000
        UPDATE public.users
        SET attention_worth_score = LEAST(1000000.0000, COALESCE(attention_worth_score, 0.1000) + v_increment),
            atw_tier = (
                CASE
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 1000000.0000 THEN 'ATW14'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 500000.0000 THEN 'ATW13'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 250000.0000 THEN 'ATW12'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 150000.0000 THEN 'ATW11'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 90000.0000 THEN 'ATW10'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 70000.0000 THEN 'ATW9'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 50000.0000 THEN 'ATW8'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 40000.0000 THEN 'ATW7'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 30000.0000 THEN 'ATW6'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 20000.0000 THEN 'ATW5'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 10000.0000 THEN 'ATW4'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 5000.0000 THEN 'ATW3'
                    WHEN (COALESCE(attention_worth_score, 0.1000) + v_increment) >= 1000.0000 THEN 'ATW2'
                    ELSE 'ATW1'
                END
            )
        WHERE lower(email) = ANY(v_listeners);
    END IF;

    -- Record in rating ledger
    INSERT INTO public.completed_ads_ratings (ad_id, advertiser_email, star_rating, score_increment, listeners_count)
    VALUES (p_ad_id, lower(p_advertiser_email), p_star_rating, v_increment, v_listener_count)
    ON CONFLICT (ad_id, advertiser_email) DO NOTHING;

    RETURN v_increment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Enable RLS
ALTER TABLE public.premium_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completed_ads_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select premium subscribers" ON public.premium_subscribers;
CREATE POLICY "Public select premium subscribers" ON public.premium_subscribers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role mutate premium subscribers" ON public.premium_subscribers;
CREATE POLICY "Service role mutate premium subscribers" ON public.premium_subscribers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view rating ledger" ON public.completed_ads_ratings;
CREATE POLICY "Users view rating ledger" ON public.completed_ads_ratings FOR SELECT TO authenticated, anon USING (lower(advertiser_email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Service role mutate rating ledger" ON public.completed_ads_ratings;
CREATE POLICY "Service role mutate rating ledger" ON public.completed_ads_ratings FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.premium_subscribers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.completed_ads_ratings TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_ad_rating_to_listeners(UUID, TEXT, INT) TO authenticated, service_role;
