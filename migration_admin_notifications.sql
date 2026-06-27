-- ============================================================
-- MIGRATION: SECURE ADMIN BULK NOTIFICATIONS RPC
-- Run this in your Supabase SQL Editor (New query -> Run)
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_bulk_notifications(
    p_target text,
    p_title text,
    p_message text,
    p_target_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Run as owner to bypass user RLS policies
AS $$
BEGIN
    IF p_target = 'user' THEN
        -- Verify that the target user email actually exists (case-insensitive check)
        IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(p_target_email)) THEN
            INSERT INTO public.notifications (user_email, title, message)
            VALUES (lower(p_target_email), p_title, p_message);
        ELSE
            RAISE EXCEPTION 'User email % does not exist.', p_target_email;
        END IF;
    ELSIF p_target = 'monetized' THEN
        INSERT INTO public.notifications (user_email, title, message)
        SELECT email, p_title, p_message
        FROM public.users
        WHERE monetized = 'yes' OR monetized = 'true' OR monetized::boolean = true;
    ELSIF p_target = 'all' THEN
        INSERT INTO public.notifications (user_email, title, message)
        SELECT email, p_title, p_message
        FROM public.users;
    ELSE
        RAISE EXCEPTION 'Invalid notification target: %', p_target;
    END IF;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.send_bulk_notifications(text, text, text, text) TO service_role;
