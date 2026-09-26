-- ====================================================================
-- MIGRATION: PREMIUM SUBSCRIBERS WORKFLOW, APPROVAL & PAYMENT AT SCALE
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ====================================================================

-- 1. Ensure columns exist on public.premium_subscribers
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 150000.00;
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.premium_subscribers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Update default status for existing and new records
ALTER TABLE public.premium_subscribers ALTER COLUMN status SET DEFAULT 'pending';

-- 3. Composite and single indexes for 100M+ traffic scale and sub-millisecond lookups
CREATE INDEX IF NOT EXISTS idx_premium_subscribers_status_created 
    ON public.premium_subscribers (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_premium_subscribers_user_email 
    ON public.premium_subscribers (lower(user_email));

CREATE INDEX IF NOT EXISTS idx_premium_subscribers_contact_email 
    ON public.premium_subscribers (lower(contact_email));

CREATE INDEX IF NOT EXISTS idx_premium_subscribers_domain 
    ON public.premium_subscribers (lower(domain));

CREATE INDEX IF NOT EXISTS idx_premium_subscribers_payment_status 
    ON public.premium_subscribers (payment_status);

COMMENT ON TABLE public.premium_subscribers IS 'Stores brand premium subscriber registrations, admin review states, and payment records';