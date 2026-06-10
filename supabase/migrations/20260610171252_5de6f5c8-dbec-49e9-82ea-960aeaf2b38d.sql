-- Drop all overloads of e2e_seed_scenario and e2e_teardown so the new signature can be applied cleanly
DROP FUNCTION IF EXISTS public.e2e_seed_scenario();
DROP FUNCTION IF EXISTS public.e2e_seed_scenario(text);
DROP FUNCTION IF EXISTS public.e2e_teardown();
DROP FUNCTION IF EXISTS public.e2e_teardown(text);

-- 1. Flag de seguridad
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS allow_e2e_seed boolean NOT NULL DEFAULT true;

-- 2. Folios reales excluyen E2E
CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'COT-' || lpad((coalesce(max(
    nullif(regexp_replace(quote_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM quotes
  WHERE coalesce(is_e2e, false) = false AND quote_number NOT LIKE 'E2E-%';
$$;

CREATE OR REPLACE FUNCTION public.next_booking_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'RSV-' || LPAD(
    (COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(booking_number, '[^0-9]', '', 'g'), '')::int)
       FROM public.bookings
       WHERE coalesce(is_e2e, false) = false AND booking_number NOT LIKE 'E2E-%'),
      0
    ) + 1)::text,
    4, '0'
  );
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'FAC-' || lpad(
    GREATEST(
      coalesce(max(nullif(regexp_replace(invoice_number,'[^0-9]','','g'),'')::int), 0) + 1,
      coalesce((SELECT min_next_number FROM public.invoice_number_settings LIMIT 1), 1)
    )::text, 4, '0')
  FROM public.invoices
  WHERE coalesce(is_e2e, false) = false AND invoice_number NOT LIKE 'E2E-%';
$$;

-- 3. Folios E2E
CREATE OR REPLACE FUNCTION public.next_quote_number_e2e()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'E2E-COT-' || lpad((coalesce(max(
    nullif(regexp_replace(replace(quote_number, 'E2E-COT-', ''), '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM quotes WHERE quote_number LIKE 'E2E-COT-%';
$$;

CREATE OR REPLACE FUNCTION public.next_booking_number_e2e()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'E2E-RSV-' || lpad((coalesce(max(
    nullif(regexp_replace(replace(booking_number, 'E2E-RSV-', ''), '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM bookings WHERE booking_number LIKE 'E2E-RSV-%';
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number_e2e()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'E2E-FAC-' || lpad((coalesce(max(
    nullif(regexp_replace(replace(invoice_number, 'E2E-FAC-', ''), '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM invoices WHERE invoice_number LIKE 'E2E-FAC-%';
$$;

-- 4. Constraint CFDI bloqueado en E2E
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_e2e_no_cfdi;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_e2e_no_cfdi
  CHECK (NOT (coalesce(is_e2e, false) = true AND cfdi_uuid IS NOT NULL));

-- 5. Constraint scope obligatorio
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['forklifts','customers','quotes','bookings','invoices','payments','equipment_models']) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_e2e_scope_required');
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (NOT (coalesce(is_e2e, false) = true AND e2e_scope IS NULL))', t, t || '_e2e_scope_required');
  END LOOP;
END $$;

-- 6. e2e_seed_scenario(p_scope text) — scope obligatorio
CREATE FUNCTION public.e2e_seed_scenario(p_scope text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_model_id uuid; v_forklift_id uuid; v_customer_id uuid;
  v_quote_id uuid; v_booking_id uuid; v_invoice_id uuid;
  v_quote_number text; v_booking_number text; v_invoice_number text;
  v_subtotal numeric := 10000; v_tax numeric := 1600; v_total numeric := 11600;
  v_allowed boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_seed_scenario requires admin role';
  END IF;
  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_scenario requires a non-null p_scope';
  END IF;
  SELECT coalesce(allow_e2e_seed, false) INTO v_allowed FROM public.company_settings LIMIT 1;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'E2E seeding disabled on this environment';
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

  v_quote_number := public.next_quote_number_e2e();
  INSERT INTO public.quotes (quote_number, customer_id, customer_name, forklift_id, equipment_model_id,
    start_date, end_date, line_items, subtotal, tax_rate, tax_amount, total,
    status, currency, quote_type, is_e2e, e2e_scope)
  VALUES (v_quote_number, v_customer_id, 'E2E Cliente', v_forklift_id, v_model_id,
    CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    jsonb_build_array(jsonb_build_object('description', 'Renta mensual E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'accepted', 'MXN', 'rental', true, p_scope)
  RETURNING id INTO v_quote_id;

  v_booking_number := public.next_booking_number_e2e();
  INSERT INTO public.bookings (booking_number, forklift_id, customer_id, customer_name,
    start_date, end_date, status, quote_id, is_e2e, e2e_scope)
  VALUES (v_booking_number, v_forklift_id, v_customer_id, 'E2E Cliente',
    CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'confirmed', v_quote_id, true, p_scope)
  RETURNING id INTO v_booking_id;

  v_invoice_number := public.next_invoice_number_e2e();
  INSERT INTO public.invoices (invoice_number, booking_id, customer_id, customer_name, quote_id,
    line_items, subtotal, tax_rate, tax_amount, total,
    status, issued_at, due_date, moneda, is_e2e, e2e_scope)
  VALUES (v_invoice_number, v_booking_id, v_customer_id, 'E2E Cliente', v_quote_id,
    jsonb_build_array(jsonb_build_object('description', 'Renta mensual E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'issued', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days',
    'MXN', true, p_scope)
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'model_id', v_model_id, 'forklift_id', v_forklift_id, 'customer_id', v_customer_id,
    'quote_id', v_quote_id, 'quote_number', v_quote_number,
    'booking_id', v_booking_id, 'booking_number', v_booking_number,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'total', v_total, 'scope', p_scope
  );
END;
$$;

-- 7. e2e_teardown(p_scope text) — scope obligatorio
CREATE FUNCTION public.e2e_teardown(p_scope text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_counts jsonb := '{}'::jsonb; v_n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_teardown requires admin role';
  END IF;
  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_teardown requires a non-null p_scope';
  END IF;

  DELETE FROM public.payments WHERE is_e2e = true AND (
    e2e_scope = p_scope
    OR invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true AND e2e_scope = p_scope)
  ); GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payments', v_n);

  DELETE FROM public.invoices WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_n);

  DELETE FROM public.bookings WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bookings', v_n);

  DELETE FROM public.quote_assigned_forklifts
    WHERE quote_id IN (SELECT id FROM public.quotes WHERE is_e2e = true AND e2e_scope = p_scope);

  DELETE FROM public.quotes WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotes', v_n);

  DELETE FROM public.forklifts WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('forklifts', v_n);

  DELETE FROM public.equipment_models WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('equipment_models', v_n);

  DELETE FROM public.customers WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('customers', v_n);

  RETURN v_counts;
END;
$$;

-- 8. e2e_purge_all — limpieza manual admin
CREATE OR REPLACE FUNCTION public.e2e_purge_all()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_counts jsonb := '{}'::jsonb; v_n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_purge_all requires admin role';
  END IF;
  DELETE FROM public.payments WHERE is_e2e = true; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payments', v_n);
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