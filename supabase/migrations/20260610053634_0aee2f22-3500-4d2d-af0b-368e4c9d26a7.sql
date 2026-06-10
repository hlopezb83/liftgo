-- E2E test data infrastructure: ephemeral flag + admin-only seed/teardown RPCs.

ALTER TABLE public.customers        ADD COLUMN IF NOT EXISTS is_e2e BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.forklifts        ADD COLUMN IF NOT EXISTS is_e2e BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quotes           ADD COLUMN IF NOT EXISTS is_e2e BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.bookings         ADD COLUMN IF NOT EXISTS is_e2e BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.invoices         ADD COLUMN IF NOT EXISTS is_e2e BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.payments         ADD COLUMN IF NOT EXISTS is_e2e BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.equipment_models ADD COLUMN IF NOT EXISTS is_e2e BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_is_e2e ON public.customers(is_e2e) WHERE is_e2e = true;
CREATE INDEX IF NOT EXISTS idx_forklifts_is_e2e ON public.forklifts(is_e2e) WHERE is_e2e = true;
CREATE INDEX IF NOT EXISTS idx_quotes_is_e2e    ON public.quotes(is_e2e)    WHERE is_e2e = true;
CREATE INDEX IF NOT EXISTS idx_bookings_is_e2e  ON public.bookings(is_e2e)  WHERE is_e2e = true;
CREATE INDEX IF NOT EXISTS idx_invoices_is_e2e  ON public.invoices(is_e2e)  WHERE is_e2e = true;
CREATE INDEX IF NOT EXISTS idx_payments_is_e2e  ON public.payments(is_e2e)  WHERE is_e2e = true;

-- ============================================================
-- e2e_seed_scenario: creates a full happy-path scenario.
-- ============================================================
CREATE OR REPLACE FUNCTION public.e2e_seed_scenario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- 1. Equipment model
  INSERT INTO public.equipment_models (manufacturer, model, default_capacity_kg, default_fuel_type,
                                        default_daily_rate, default_weekly_rate, default_monthly_rate, is_e2e)
  VALUES ('E2E-Maker', 'E2E-Model-' || substr(gen_random_uuid()::text,1,8), 2500, 'LPG',
          500, 3000, 10000, true)
  RETURNING id INTO v_model_id;

  -- 2. Forklift (available)
  INSERT INTO public.forklifts (name, model, manufacturer, capacity_kg, fuel_type, status,
                                 daily_rate, weekly_rate, monthly_rate, is_e2e)
  VALUES ('E2E-FL-' || substr(gen_random_uuid()::text,1,8), 'E2E-Model', 'E2E-Maker', 2500, 'LPG',
          'available', 500, 3000, 10000, true)
  RETURNING id INTO v_forklift_id;

  -- 3. Customer
  INSERT INTO public.customers (name, email, phone, rfc, is_e2e)
  VALUES ('E2E Cliente ' || substr(gen_random_uuid()::text,1,8),
          'e2e-' || substr(gen_random_uuid()::text,1,8) || '@test.local',
          '8181818181', 'XAXX010101000', true)
  RETURNING id INTO v_customer_id;

  -- 4. Quote (accepted)
  v_quote_number := public.next_quote_number();
  INSERT INTO public.quotes (quote_number, customer_id, customer_name, forklift_id, equipment_model_id,
                              start_date, end_date, line_items, subtotal, tax_rate, tax_amount, total,
                              status, currency, quote_type, is_e2e)
  VALUES (v_quote_number, v_customer_id, 'E2E Cliente', v_forklift_id, v_model_id,
          CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
          jsonb_build_array(jsonb_build_object(
            'description', 'Renta mensual E2E',
            'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal
          )),
          v_subtotal, 16, v_tax, v_total, 'accepted', 'MXN', 'rental', true)
  RETURNING id INTO v_quote_id;

  -- 5. Booking (confirmed)
  v_booking_number := public.next_booking_number();
  INSERT INTO public.bookings (booking_number, forklift_id, customer_id, customer_name,
                                start_date, end_date, status, quote_id, is_e2e)
  VALUES (v_booking_number, v_forklift_id, v_customer_id, 'E2E Cliente',
          CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'confirmed', v_quote_id, true)
  RETURNING id INTO v_booking_id;

  -- 6. Invoice (issued, pending payment)
  v_invoice_number := public.next_invoice_number();
  INSERT INTO public.invoices (invoice_number, booking_id, customer_id, customer_name, quote_id,
                                line_items, subtotal, tax_rate, tax_amount, total,
                                status, issued_at, due_date, moneda, is_e2e)
  VALUES (v_invoice_number, v_booking_id, v_customer_id, 'E2E Cliente', v_quote_id,
          jsonb_build_array(jsonb_build_object(
            'description', 'Renta mensual E2E',
            'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal
          )),
          v_subtotal, 16, v_tax, v_total, 'issued', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days',
          'MXN', true)
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
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_seed_scenario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_seed_scenario() TO authenticated, service_role;

-- ============================================================
-- e2e_teardown: removes only is_e2e=true rows in FK-safe order.
-- ============================================================
CREATE OR REPLACE FUNCTION public.e2e_teardown()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_teardown requires admin role';
  END IF;

  DELETE FROM public.payments WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payments', v_n);

  -- Cascade to dependent records that reference e2e invoices/bookings/quotes/customers
  DELETE FROM public.payments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true);

  DELETE FROM public.invoices WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_n);

  DELETE FROM public.bookings WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bookings', v_n);

  DELETE FROM public.quote_assigned_forklifts
    WHERE quote_id IN (SELECT id FROM public.quotes WHERE is_e2e = true);

  DELETE FROM public.quotes WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotes', v_n);

  DELETE FROM public.forklifts WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('forklifts', v_n);

  DELETE FROM public.equipment_models WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('equipment_models', v_n);

  DELETE FROM public.customers WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('customers', v_n);

  RETURN v_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_teardown() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_teardown() TO authenticated, service_role;