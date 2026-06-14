CREATE OR REPLACE FUNCTION public.e2e_seed_scenario(p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_model_id uuid; v_forklift_id uuid; v_customer_id uuid;
  v_quote_id uuid; v_booking_id uuid; v_invoice_id uuid;
  v_maintenance_log_id uuid;
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
    v_subtotal, 16, v_tax, v_total, 'sent', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days',
    'MXN', true, p_scope)
  RETURNING id INTO v_invoice_id;

  -- Orden de mantenimiento pendiente. No tiene columna is_e2e/e2e_scope,
  -- pero el FK a forklifts es ON DELETE CASCADE, así que el teardown la
  -- elimina automáticamente al borrar el montacargas sembrado.
  INSERT INTO public.maintenance_logs (forklift_id, service_type, description,
    cost, performed_at, work_status)
  VALUES (v_forklift_id, 'preventive', 'E2E Kanban WO - ' || substr(p_scope, 1, 16),
    0, CURRENT_DATE, 'pending')
  RETURNING id INTO v_maintenance_log_id;

  RETURN jsonb_build_object(
    'model_id', v_model_id, 'forklift_id', v_forklift_id, 'customer_id', v_customer_id,
    'quote_id', v_quote_id, 'quote_number', v_quote_number,
    'booking_id', v_booking_id, 'booking_number', v_booking_number,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'maintenance_log_id', v_maintenance_log_id,
    'total', v_total, 'scope', p_scope
  );
END;
$function$;