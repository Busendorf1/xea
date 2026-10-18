-- Migration: Add is_ai_content disclosure column to ads and news tables
-- This ensures transparency and compliance for AI-generated text and media.

-- 1. Add is_ai_content to ads review table
ALTER TABLE public.adds 
ADD COLUMN IF NOT EXISTS is_ai_content BOOLEAN DEFAULT FALSE;

-- 2. Add is_ai_content to active ads table
ALTER TABLE public.addsactive 
ADD COLUMN IF NOT EXISTS is_ai_content BOOLEAN DEFAULT FALSE;

-- 3. Add is_ai_content to news (highlights) review table
ALTER TABLE public.news 
ADD COLUMN IF NOT EXISTS is_ai_content BOOLEAN DEFAULT FALSE;

-- 4. Add is_ai_content to active highlights table
ALTER TABLE public.newsactive 
ADD COLUMN IF NOT EXISTS is_ai_content BOOLEAN DEFAULT FALSE;
