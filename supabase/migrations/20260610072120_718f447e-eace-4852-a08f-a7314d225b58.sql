-- 1. Add nullable e2e_scope column to all seed tables (backward compatible: NULL = legacy behavior)
ALTER TABLE public.equipment_models ADD COLUMN IF NOT EXISTS e2e_scope text;
ALTER TABLE public.forklifts        ADD COLUMN IF NOT EXISTS e2e_scope text;
ALTER TABLE public.customers        ADD COLUMN IF NOT EXISTS e2e_scope text;
ALTER TABLE public.quotes           ADD COLUMN IF NOT EXISTS e2e_scope text;
ALTER TABLE public.bookings         ADD COLUMN IF NOT EXISTS e2e_scope text;
ALTER TABLE public.invoices         ADD COLUMN IF NOT EXISTS e2e_scope text;
ALTER TABLE public.payments         ADD COLUMN IF NOT EXISTS e2e_scope text;

-- Partial indexes only on scoped e2e rows — keeps teardown filter fast without bloating prod data
CREATE INDEX IF NOT EXISTS idx_equipment_models_e2e_scope ON public.equipment_models(e2e_scope) WHERE e2e_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forklifts_e2e_scope        ON public.forklifts(e2e_scope)        WHERE e2e_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_e2e_scope        ON public.customers(e2e_scope)        WHERE e2e_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_e2e_scope           ON public.quotes(e2e_scope)           WHERE e2e_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_e2e_scope         ON public.bookings(e2e_scope)         WHERE e2e_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_e2e_scope         ON public.invoices(e2e_scope)         WHERE e2e_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_e2e_scope         ON public.payments(e2e_scope)         WHERE e2e_scope IS NOT NULL;

-- 2. Replace e2e_seed_scenario to accept an optional scope tag
CREATE OR REPLACE FUNCTION public.e2e_seed_scenario(p_scope text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_model_id      uuid;
  v_forklift_id   uuid;
  v_customer_id   uuid;
  v_quote_id      uuid;
  v_booking_id    uuid;
  v_invoice_id    uuid;
  v_quote_number  text;
  v_booking_number text;
  v_invoice_number text;
  v_subtotal      numeric := 10000;
  v_tax           numeric := 1600;
  v_total         numeric := 11600;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_seed_scenario requires admin role';
  END IF;

  INSERT INTO public.equipment_models (manufacturer, model, default_capacity_kg, default_fuel_type,
                                        default_daily_rate, default_weekly_rate, default_monthly_rate, is_e2e, e2e_scope)
  VALUES ('E2E-Maker', 'E2E-Model-' || substr(gen_random_uuid()::text,1,8), 2500, 'LPG',
          500, 3000, 10000, true, p_scope)
  RETURNING id INTO v_model_id;

  INSERT INTO public.forklifts (name, model, manufacturer, capacity_kg, fuel_type, status,
                                 daily_rate, weekly_rate, monthly_rate, is_e2e, e2e_scope)
  VALUES ('E2E-FL-' || substr(gen_random_uuid()::text,1,8), 'E2E-Model', 'E2E-Maker', 2500, 'LPG',
          'available', 500, 3000, 10000, true, p_scope)
  RETURNING id INTO v_forklift_id;

  INSERT INTO public.customers (name, email, phone, rfc, is_e2e, e2e_scope)
  VALUES ('E2E Cliente ' || substr(gen_random_uuid()::text,1,8),
          'e2e-' || substr(gen_random_uuid()::text,1,8) || '@test.local',
          '8181818181', 'XAXX010101000', true, p_scope)
  RETURNING id INTO v_customer_id;

  v_quote_number := public.next_quote_number();
  INSERT INTO public.quotes (quote_number, customer_id, customer_name, forklift_id, equipment_model_id,
                              start_date, end_date, line_items, subtotal, tax_rate, tax_amount, total,
                              status, currency, quote_type, is_e2e, e2e_scope)
  VALUES (v_quote_number, v_customer_id, 'E2E Cliente', v_forklift_id, v_model_id,
          CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
          jsonb_build_array(jsonb_build_object(
            'description', 'Renta mensual E2E',
            'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal
          )),
          v_subtotal, 16, v_tax, v_total, 'accepted', 'MXN', 'rental', true, p_scope)
  RETURNING id INTO v_quote_id;

  v_booking_number := public.next_booking_number();
  INSERT INTO public.bookings (booking_number, forklift_id, customer_id, customer_name,
                                start_date, end_date, status, quote_id, is_e2e, e2e_scope)
  VALUES (v_booking_number, v_forklift_id, v_customer_id, 'E2E Cliente',
          CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'confirmed', v_quote_id, true, p_scope)
  RETURNING id INTO v_booking_id;

  v_invoice_number := public.next_invoice_number();
  INSERT INTO public.invoices (invoice_number, booking_id, customer_id, customer_name, quote_id,
                                line_items, subtotal, tax_rate, tax_amount, total,
                                status, issued_at, due_date, moneda, is_e2e, e2e_scope)
  VALUES (v_invoice_number, v_booking_id, v_customer_id, 'E2E Cliente', v_quote_id,
          jsonb_build_array(jsonb_build_object(
            'description', 'Renta mensual E2E',
            'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal
          )),
          v_subtotal, 16, v_tax, v_total, 'issued', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days',
          'MXN', true, p_scope)
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'model_id', v_model_id,
    'forklift_id', v_forklift_id,
    'customer_id', v_customer_id,
    'quote_id', v_quote_id,
    'quote_number', v_quote_number,
    'booking_id', v_booking_id,
    'booking_number', v_booking_number,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total', v_total,
    'scope', p_scope
  );
END;
$function$;

-- 3. Replace e2e_teardown to accept optional scope. When p_scope is NULL → legacy behavior (delete ALL is_e2e rows).
--    When p_scope is provided → only delete rows tagged with that scope (parallel-safe).
CREATE OR REPLACE FUNCTION public.e2e_teardown(p_scope text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_teardown requires admin role';
  END IF;

  -- Cascade-clean payments first (FK to invoices). When scoped, payments inherit scope from their invoice.
  IF p_scope IS NULL THEN
    DELETE FROM public.payments WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.payments WHERE is_e2e = true AND (
      e2e_scope = p_scope
      OR invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true AND e2e_scope = p_scope)
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('payments', v_n);

  IF p_scope IS NULL THEN
    DELETE FROM public.invoices WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.invoices WHERE is_e2e = true AND e2e_scope = p_scope; GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('invoices', v_n);

  IF p_scope IS NULL THEN
    DELETE FROM public.bookings WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.bookings WHERE is_e2e = true AND e2e_scope = p_scope; GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('bookings', v_n);

  -- quote_assigned_forklifts → cascade by quote_id
  IF p_scope IS NULL THEN
    DELETE FROM public.quote_assigned_forklifts
      WHERE quote_id IN (SELECT id FROM public.quotes WHERE is_e2e = true);
    DELETE FROM public.quotes WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.quote_assigned_forklifts
      WHERE quote_id IN (SELECT id FROM public.quotes WHERE is_e2e = true AND e2e_scope = p_scope);
    DELETE FROM public.quotes WHERE is_e2e = true AND e2e_scope = p_scope; GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('quotes', v_n);

  IF p_scope IS NULL THEN
    DELETE FROM public.forklifts WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.forklifts WHERE is_e2e = true AND e2e_scope = p_scope; GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('forklifts', v_n);

  IF p_scope IS NULL THEN
    DELETE FROM public.equipment_models WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.equipment_models WHERE is_e2e = true AND e2e_scope = p_scope; GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('equipment_models', v_n);

  IF p_scope IS NULL THEN
    DELETE FROM public.customers WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.customers WHERE is_e2e = true AND e2e_scope = p_scope; GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('customers', v_n);

  RETURN v_counts;
END;
$function$;