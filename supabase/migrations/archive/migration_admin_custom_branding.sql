-- Migration: Add Admin Custom Branding & Free Campaign Columns
-- Run this in your Supabase SQL Editor

-- 1. Add custom branding columns to ads table
ALTER TABLE public.ads
ADD COLUMN IF NOT EXISTS is_admin_post BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS custom_sponsor_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS custom_sponsor_handle TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS custom_sponsor_logo TEXT DEFAULT NULL;

-- 2. Add custom branding columns to news / highlights table
ALTER TABLE public.news
ADD COLUMN IF NOT EXISTS is_admin_post BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS custom_sponsor_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS custom_sponsor_handle TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS custom_sponsor_logo TEXT DEFAULT NULL;

-- 3. Add performance indexes for admin post querying
CREATE INDEX IF NOT EXISTS idx_ads_is_admin_post ON public.ads(is_admin_post);
CREATE INDEX IF NOT EXISTS idx_news_is_admin_post ON public.news(is_admin_post);
