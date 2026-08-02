-- migration_ad_account_bans.sql
-- Add advertiser account ban & deactivation management columns to public.users table

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_account_status TEXT DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_ban_until TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_ban_reason TEXT DEFAULT NULL;

-- Index for fast user status lookups
CREATE INDEX IF NOT EXISTS idx_users_ad_account_status ON public.users (ad_account_status);

NOTIFY pgrst, 'reload schema';
