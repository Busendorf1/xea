-- Add scheduled_start_at and scheduled_end_at to adds, addsactive, completed_ads, news, and newsactive
-- Supports scheduled campaign start & end date windows and progressive 80% / 100% duration broadening

ALTER TABLE IF EXISTS public.adds
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE IF EXISTS public.addsactive
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE IF EXISTS public.completed_ads
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE IF EXISTS public.news
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE IF EXISTS public.newsactive
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index for active unpaused campaigns ordered by priority bid and recency
CREATE INDEX IF NOT EXISTS idx_addsactive_delivery_schedule
  ON public.addsactive (cost_per_impression DESC, created_at DESC)
  WHERE completed_at IS NULL AND (is_paused IS NULL OR is_paused = false);

CREATE INDEX IF NOT EXISTS idx_newsactive_delivery_schedule
  ON public.newsactive (is_bidded DESC, bid_price DESC, created_at DESC)
  WHERE is_paused IS NULL OR is_paused = false;
