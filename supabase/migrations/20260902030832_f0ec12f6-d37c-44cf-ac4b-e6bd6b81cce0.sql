DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.releasable_payment_locks(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.releasable_payment_locks(integer) FROM authenticated, anon, PUBLIC';
  END IF;
END $lgp_guard$;
