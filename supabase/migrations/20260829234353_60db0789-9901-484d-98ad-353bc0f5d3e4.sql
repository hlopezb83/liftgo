DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.guard_supplier_payment_delete()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.guard_supplier_payment_delete() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
