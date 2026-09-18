DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.trg_customer_archive_unlink_user()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.trg_customer_archive_unlink_user() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
