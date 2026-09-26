-- migration_highlights_enhancements.sql
-- Add targeting, bidding, pause, province, and admin statement columns to news and newsactive tables

ALTER TABLE public.news ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS admin_statement TEXT;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS is_bidded BOOLEAN DEFAULT FALSE;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS bid_price NUMERIC;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS campaign_days INTEGER DEFAULT 1;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS admin_statement TEXT;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS is_bidded BOOLEAN DEFAULT FALSE;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS bid_price NUMERIC;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS campaign_days INTEGER DEFAULT 1;
ALTER TABLE public.newsactive ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Table for bidded highlights priority ranking
CREATE TABLE IF NOT EXISTS public.bidded_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  interest TEXT NOT NULL,
  bid_price NUMERIC NOT NULL,
  campaign_days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
