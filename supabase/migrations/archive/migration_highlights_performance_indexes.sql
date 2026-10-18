-- Migration: High-Performance Composite Indexes for newsactive (100M+ Scale)
-- Run this in the Supabase SQL Editor to optimize highlight candidate queries.

-- Index 1: Fast interest-based bidding & timestamp lookup
CREATE INDEX IF NOT EXISTS idx_newsactive_interest_bidded_bid 
ON public.newsactive (interest, is_bidded DESC, bid_price DESC, created_at DESC) 
WHERE (is_paused = FALSE OR is_paused IS NULL);

-- Index 2: Fast creation date & paused status lookup
CREATE INDEX IF NOT EXISTS idx_newsactive_created_active 
ON public.newsactive (created_at DESC) 
WHERE (is_paused = FALSE OR is_paused IS NULL);

-- Index 3: Fast location-targeted queries (country, state)
CREATE INDEX IF NOT EXISTS idx_newsactive_targeting 
ON public.newsactive (country, state, interest) 
WHERE (is_paused = FALSE OR is_paused IS NULL);
