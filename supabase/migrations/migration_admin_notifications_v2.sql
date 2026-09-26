-- ============================================================
-- MIGRATION: GLOBAL ANNOUNCEMENTS & READ ANNOUNCEMENTS SCHEMAS
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

-- 1. Create Global Announcements Table
CREATE TABLE IF NOT EXISTS public.global_announcements (
    id UUID DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target TEXT DEFAULT 'all' NOT NULL, -- 'all', 'monetized'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT global_announcements_pkey PRIMARY KEY (id)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_global_announcements_target ON public.global_announcements (target);
CREATE INDEX IF NOT EXISTS idx_global_announcements_created_at ON public.global_announcements (created_at DESC);

-- 2. Create Read Announcements Join Table
CREATE TABLE IF NOT EXISTS public.read_announcements (
    user_email TEXT NOT NULL,
    announcement_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT read_announcements_pkey PRIMARY KEY (user_email, announcement_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_read_announcements_user_email ON public.read_announcements (lower(user_email));

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.global_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.read_announcements ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Global Announcements SELECT: Allowed for authenticated users
DROP POLICY IF EXISTS "Users can view global announcements" ON public.global_announcements;
CREATE POLICY "Users can view global announcements" ON public.global_announcements
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- Global Announcements mutations: Service role only
DROP POLICY IF EXISTS "Service role only for global announcements" ON public.global_announcements;
CREATE POLICY "Service role only for global announcements" ON public.global_announcements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Read Announcements SELECT: Users can only see their own read logs
DROP POLICY IF EXISTS "Users can view their own read announcements" ON public.read_announcements;
CREATE POLICY "Users can view their own read announcements" ON public.read_announcements
    FOR SELECT
    TO authenticated, anon
    USING (lower(auth.jwt() ->> 'email') = lower(user_email));

-- Read Announcements INSERT: Users can insert their own read logs
DROP POLICY IF EXISTS "Users can insert their own read announcements" ON public.read_announcements;
CREATE POLICY "Users can insert their own read announcements" ON public.read_announcements
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (lower(auth.jwt() ->> 'email') = lower(user_email));

-- Read Announcements other mutations: Service role only
DROP POLICY IF EXISTS "Service role only for read announcements mutations" ON public.read_announcements;
CREATE POLICY "Service role only for read announcements mutations" ON public.read_announcements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant privileges
GRANT ALL ON TABLE public.global_announcements TO anon;
GRANT ALL ON TABLE public.global_announcements TO authenticated;
GRANT ALL ON TABLE public.global_announcements TO service_role;

GRANT ALL ON TABLE public.read_announcements TO anon;
GRANT ALL ON TABLE public.read_announcements TO authenticated;
GRANT ALL ON TABLE public.read_announcements TO service_role;
