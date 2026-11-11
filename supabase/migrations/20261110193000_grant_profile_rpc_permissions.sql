-- Restrict explicit execute permissions on user profile RPCs strictly to service_role
-- Guarantees public PostgREST / anon clients cannot invoke security definer profile mutations

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_user_profile'
  ) THEN
    REVOKE ALL ON FUNCTION public.update_user_profile FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.update_user_profile TO service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'auto_provision_user'
  ) THEN
    REVOKE ALL ON FUNCTION public.auto_provision_user FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.auto_provision_user TO service_role;
  END IF;
END $$;
