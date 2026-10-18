-- migration_ad_reports.sql
-- Ad and Advertiser Reporting & Blocking Tables with High-Performance Indexes

CREATE TABLE IF NOT EXISTS public.ad_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_email VARCHAR(255) NOT NULL,
  ad_id VARCHAR(255) NOT NULL,
  advertiser_email VARCHAR(255) NOT NULL,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('ad', 'advertiser')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blocked_advertisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_email VARCHAR(255) NOT NULL,
  advertiser_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_reporter_advertiser UNIQUE (reporter_email, advertiser_email)
);

CREATE TABLE IF NOT EXISTS public.blocked_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_email VARCHAR(255) NOT NULL,
  ad_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_reporter_ad UNIQUE (reporter_email, ad_id)
);

-- High-performance indexes for multi-million row scale
CREATE INDEX IF NOT EXISTS idx_ad_reports_reporter ON public.ad_reports(reporter_email);
CREATE INDEX IF NOT EXISTS idx_ad_reports_advertiser ON public.ad_reports(advertiser_email);
CREATE INDEX IF NOT EXISTS idx_ad_reports_status ON public.ad_reports(status);
CREATE INDEX IF NOT EXISTS idx_ad_reports_created ON public.ad_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocked_advertisers_reporter ON public.blocked_advertisers(reporter_email);
CREATE INDEX IF NOT EXISTS idx_blocked_advertisers_advertiser ON public.blocked_advertisers(advertiser_email);

CREATE INDEX IF NOT EXISTS idx_blocked_ads_reporter ON public.blocked_ads(reporter_email);
CREATE INDEX IF NOT EXISTS idx_blocked_ads_ad ON public.blocked_ads(ad_id);
