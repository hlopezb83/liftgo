CREATE OR REPLACE FUNCTION public.purge_e2e_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  c_activity int; c_payments int; c_invoices int; c_bookings int;
  c_qaf int; c_quotes int; c_forklifts int; c_models int; c_customers int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden purgar datos E2E';
  END IF;

  DELETE FROM public.activity_feed WHERE is_e2e = true;
  GET DIAGNOSTICS c_activity = ROW_COUNT;

  DELETE FROM public.payments WHERE invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true);
  GET DIAGNOSTICS c_payments = ROW_COUNT;

  DELETE FROM public.invoices WHERE is_e2e = true;
  GET DIAGNOSTICS c_invoices = ROW_COUNT;

  DELETE FROM public.bookings WHERE is_e2e = true;
  GET DIAGNOSTICS c_bookings = ROW_COUNT;

  DELETE FROM public.quote_assigned_forklifts WHERE quote_id IN (SELECT id FROM public.quotes WHERE is_e2e = true);
  GET DIAGNOSTICS c_qaf = ROW_COUNT;

  DELETE FROM public.quotes WHERE is_e2e = true;
  GET DIAGNOSTICS c_quotes = ROW_COUNT;

  DELETE FROM public.forklifts WHERE is_e2e = true;
  GET DIAGNOSTICS c_forklifts = ROW_COUNT;

  DELETE FROM public.equipment_models WHERE is_e2e = true;
  GET DIAGNOSTICS c_models = ROW_COUNT;

  DELETE FROM public.customers WHERE is_e2e = true;
  GET DIAGNOSTICS c_customers = ROW_COUNT;

  result := jsonb_build_object(
    'activity_feed', c_activity,
    'payments', c_payments,
    'invoices', c_invoices,
    'bookings', c_bookings,
    'quote_assigned_forklifts', c_qaf,
    'quotes', c_quotes,
    'forklifts', c_forklifts,
    'equipment_models', c_models,
    'customers', c_customers
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_e2e_data() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.purge_e2e_data() TO authenticated, service_role;