DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.sync_invoice_status_from_credit_notes()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.sync_invoice_status_from_credit_notes() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
