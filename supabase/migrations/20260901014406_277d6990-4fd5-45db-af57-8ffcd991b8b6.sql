DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.releasable_payment_locks(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.releasable_payment_locks(integer) FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
