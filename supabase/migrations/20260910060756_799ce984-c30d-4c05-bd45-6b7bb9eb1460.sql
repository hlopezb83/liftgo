DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.enforce_extension_pending_invoice()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.enforce_extension_pending_invoice() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.link_pending_extensions_on_invoice_issued()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.link_pending_extensions_on_invoice_issued() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
