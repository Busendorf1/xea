-- Migration: Premium Monetization Billing & Subscription System

-- 1. Add monetization columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS monetized_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS monetization_type TEXT;
