-- ============================================================
-- MIGRATION: PAYMENTS, WITHDRAWALS & NOTIFICATIONS SCHEMAS
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- 1. Create Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_email TEXT NOT NULL,
    reference TEXT UNIQUE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT DEFAULT 'NGN' NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'success', 'failed', 'reversed'
    type TEXT NOT NULL, -- 'ad', 'highlight', 'monetization_standard', 'monetization_instant', 'withdrawal'
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT payments_pkey PRIMARY KEY (id)
);

-- Index for fast queries by user email and reference
CREATE INDEX IF NOT EXISTS idx_payments_user_email ON public.payments (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments (reference);

-- 2. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_email TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

-- Index for fast queries by user email and read status
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON public.notifications (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications (read);

-- 3. Enable RLS on the new tables
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies

-- Payments SELECT: Users can only see their own transactions
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
CREATE POLICY "Users can view their own payments" ON public.payments
    FOR SELECT
    TO authenticated, anon
    USING (lower(auth.jwt() ->> 'email') = lower(user_email));

-- Payments INSERT/UPDATE/DELETE: Disallow client-side mutations (only service_role/admin can change payments)
DROP POLICY IF EXISTS "Service role only for payment mutations" ON public.payments;
CREATE POLICY "Service role only for payment mutations" ON public.payments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Notifications SELECT: Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
    FOR SELECT
    TO authenticated, anon
    USING (lower(auth.jwt() ->> 'email') = lower(user_email));

-- Notifications UPDATE: Users can mark their own notifications as read
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
    FOR UPDATE
    TO authenticated, anon
    USING (lower(auth.jwt() ->> 'email') = lower(user_email))
    WITH CHECK (lower(auth.jwt() ->> 'email') = lower(user_email));

-- Notifications INSERT/DELETE: Disallow client-side mutations (only service_role/admin can insert/delete notifications)
DROP POLICY IF EXISTS "Service role only for notification changes" ON public.notifications;
CREATE POLICY "Service role only for notification changes" ON public.notifications
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Grant privileges
GRANT ALL ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;
