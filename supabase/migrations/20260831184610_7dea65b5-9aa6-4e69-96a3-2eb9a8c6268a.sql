ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

DO $$
BEGIN
  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
     SET rejected_by = approved_by,
         rejected_at = approved_at,
         approved_by = NULL,
         approved_at = NULL
   WHERE approval_status = 'rejected'
     AND rejected_by IS NULL
     AND approved_by IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reject_supplier_bill(p_bill_id uuid, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT public.has_role((select auth.uid()),'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden rechazar facturas';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Las notas de rechazo son obligatorias';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  -- A6R2-2: el rechazante ya no se guarda como aprobador.
  UPDATE public.supplier_bills
    SET approval_status = 'rejected',
        approved_by = NULL,
        approved_at = NULL,
        rejected_by = (select auth.uid()),
        rejected_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, (select auth.uid()), 'rejected', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.rejected','supplier_bill', p_bill_id,
    'Factura rechazada',
    'Factura ' || COALESCE(v_number,'') || ' rechazada: ' || p_notes,
    (select auth.uid()));
END $function$;

CREATE OR REPLACE FUNCTION public.get_mrr_detail()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_fx_missing int := 0;
  v_today date := (now() AT TIME ZONE 'America/Monterrey')::date;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'auditor'::app_role) OR
    has_role((select auth.uid()), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH base AS (
    SELECT
      f.id AS forklift_id, f.name AS forklift_name, f.model, f.manufacturer, f.serial_number,
      COALESCE(f.monthly_rate, 0) AS forklift_monthly_rate,
      COALESCE(f.daily_rate, 0) AS daily_rate,
      COALESCE(f.weekly_rate, 0) AS weekly_rate,
      c.id AS customer_id, c.name AS customer_name,
      b.booking_number, b.start_date, b.end_date,
      -- A2-7: sin paridad 1:1; divisa sin tipo de cambio queda en NULL.
      COALESCE(b.monthly_rate, f.monthly_rate, 0)
        * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
               THEN 1 ELSE NULLIF(b.tipo_cambio, 0) END AS monthly_rate,
      CASE WHEN b.monthly_rate IS NOT NULL THEN 'booking' ELSE 'forklift' END AS rate_source
    FROM bookings b
    JOIN forklifts f ON f.id = b.forklift_id
    JOIN customers c ON c.id = b.customer_id
    WHERE b.recurring_billing = true
      AND b.status = 'confirmed'
      AND b.start_date <= v_today
      AND (b.end_date IS NULL OR b.end_date >= v_today)
      AND COALESCE(b.is_e2e, false) = false
      AND COALESCE(f.is_e2e, false) = false
  ),
  rows_cte AS (
    SELECT * FROM base WHERE monthly_rate IS NOT NULL
  )
  SELECT json_build_object(
    'items', COALESCE((
      SELECT json_agg(json_build_object(
        'forklift_id', forklift_id, 'forklift_name', forklift_name, 'model', model,
        'manufacturer', manufacturer, 'serial_number', serial_number,
        'monthly_rate', monthly_rate,
        'forklift_monthly_rate', forklift_monthly_rate,
        'rate_source', rate_source,
        'daily_rate', daily_rate, 'weekly_rate', weekly_rate,
        'customer_name', customer_name, 'customer_id', customer_id,
        'booking_number', booking_number,
        'start_date', start_date, 'end_date', end_date
      ) ORDER BY customer_name, booking_number)
      FROM rows_cte
    ), '[]'::json),
    'total_mrr', COALESCE((SELECT SUM(monthly_rate) FROM rows_cte), 0),
    'fx_missing_count', (SELECT COUNT(*) FROM base WHERE monthly_rate IS NULL)
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
 RETURNS TABLE(booking_id uuid, forklift_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE; v_assignment jsonb; v_forklift_id uuid; v_model_id uuid;
  v_daily numeric; v_weekly numeric; v_monthly numeric; v_booking_id uuid; v_meta jsonb;
  v_slots jsonb; v_idx int;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'dispatcher'::app_role) OR has_role((select auth.uid()), 'ventas'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir cotizaciones aceptadas (estado actual: %)', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- A3B-05: si todas las reservas previas se cancelaron, la cotización se puede reconvertir.
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE quote_id = p_quote_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;
  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;
  SELECT COALESCE(jsonb_agg(elem ORDER BY ord, n), '[]'::jsonb)
    INTO v_slots
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(v_quote.rental_meta) = 'array'
              THEN v_quote.rental_meta ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS t(elem, ord)
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE((t.elem->>'quantity')::int, 1), 1)) AS g(n);
  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    SELECT equipment_model_id INTO v_model_id FROM forklifts WHERE id = v_forklift_id;
    v_meta := NULL;
    IF v_model_id IS NOT NULL THEN
      SELECT s.elem, s.ord - 1 INTO v_meta, v_idx
        FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS s(elem, ord)
       WHERE (s.elem->>'modelId')::uuid = v_model_id
       ORDER BY s.ord
       LIMIT 1;
      IF v_meta IS NOT NULL THEN
        v_slots := v_slots - v_idx;
      END IF;
    END IF;
    IF v_meta IS NOT NULL THEN
      v_daily := COALESCE((v_meta->>'dailyRate')::numeric, 0);
      v_weekly := COALESCE((v_meta->>'weeklyRate')::numeric, 0);
      v_monthly := COALESCE((v_meta->>'monthlyRate')::numeric, 0);
    ELSE
      v_daily := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
      v_weekly := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
      v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);
    END IF;
    v_booking_id := public.create_booking(
      v_forklift_id, v_quote.customer_id, v_quote.customer_name, NULL,
      v_quote.start_date, v_quote.end_date, p_recurring, p_quote_id
    );
    UPDATE public.bookings
       SET daily_rate = COALESCE(NULLIF(v_daily, 0), daily_rate),
           weekly_rate = COALESCE(NULLIF(v_weekly, 0), weekly_rate),
           monthly_rate = COALESCE(NULLIF(v_monthly, 0), monthly_rate),
           currency = COALESCE(v_quote.currency, 'MXN'),
           tipo_cambio = COALESCE(NULLIF(v_quote.tipo_cambio, 0),
                          CASE WHEN COALESCE(v_quote.currency, 'MXN') = 'MXN' THEN 1 END)
     WHERE id = v_booking_id;
    RETURN QUERY SELECT v_booking_id, v_forklift_id;
  END LOOP;

  UPDATE public.quotes SET status = 'converted' WHERE id = p_quote_id;
END;
$function$;