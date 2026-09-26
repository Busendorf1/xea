-- MIGRATION: STOP AUTO-ACTIVATING HIGHLIGHTS TO REQUIRE /ADMIN APPROVAL
-- Previously, a trigger (trigger_activate_news) instantly copied all submitted highlights
-- into public.newsactive and deleted them from public.news, bypassing the /admin approval queue.
--
-- Run this SQL in your Supabase Dashboard SQL Editor to ensure all submitted highlights
-- stay in public.news until an administrator explicitly approves them in /admin.

-- 1. Drop trigger on public.news table
DROP TRIGGER IF EXISTS trigger_activate_news ON public.news;

-- 2. Drop trigger function
DROP FUNCTION IF EXISTS public.tr_activate_news();
