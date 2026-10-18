-- ============================================================
-- MIGRATION: 15-DAY NOTIFICATION RETENTION & CLEANUP RPC
-- Deletes notifications older than 15 days to maintain DB space
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_expired_notifications()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete private notifications older than 15 days
  WITH deleted AS (
    DELETE FROM public.notifications
    WHERE created_at < NOW() - INTERVAL '15 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  -- Delete global announcements older than 15 days
  DELETE FROM public.global_announcements
  WHERE created_at < NOW() - INTERVAL '15 days';

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', 'Deleted notifications older than 15 days successfully.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
