-- R12 B1: reject_mutations_on_closed_maintenance usaba `status` (columna inexistente).
CREATE OR REPLACE FUNCTION public.reject_mutations_on_closed_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_status text;
BEGIN
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  IF v_log_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT work_status INTO v_status FROM public.maintenance_logs WHERE id = v_log_id;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'No se pueden modificar refacciones ni mano de obra de una orden %.', v_status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- R12 B3: convert_quote_to_bookings rechazaba TODO quote 'accepted' aunque no tuviera bookings.
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
 RETURNS TABLE(booking_id uuid, forklift_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE;
  v_assignment jsonb;
  v_forklift_id uuid;
  v_model_id uuid;
  v_daily numeric;
  v_weekly numeric;
  v_monthly numeric;
  v_booking_id uuid;
  v_meta jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;

  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;

  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;

  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments)
  LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;

    SELECT equipment_model_id INTO v_model_id
      FROM forklifts WHERE id = v_forklift_id;

    v_meta := NULL;
    IF v_model_id IS NOT NULL AND jsonb_typeof(v_quote.rental_meta) = 'array' THEN
      SELECT elem INTO v_meta
      FROM jsonb_array_elements(v_quote.rental_meta) AS elem
      WHERE (elem->>'modelId')::uuid = v_model_id
      LIMIT 1;
    END IF;

    IF v_meta IS NOT NULL THEN
      v_daily   := COALESCE((v_meta->>'dailyRate')::numeric, 0);
      v_weekly  := COALESCE((v_meta->>'weeklyRate')::numeric, 0);
      v_monthly := COALESCE((v_meta->>'monthlyRate')::numeric, 0);
    ELSE
      v_daily   := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
      v_weekly  := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
      v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);
    END IF;

    v_booking_id := public.create_booking(
      v_forklift_id,
      v_quote.customer_id,
      v_quote.customer_name,
      NULL,
      v_quote.start_date,
      v_quote.end_date,
      p_recurring,
      p_quote_id
    );

    UPDATE public.bookings
       SET daily_rate = v_daily,
           weekly_rate = v_weekly,
           monthly_rate = v_monthly,
           currency = COALESCE(v_quote.currency, 'MXN'),
           tipo_cambio = COALESCE(v_quote.tipo_cambio, 1)
     WHERE id = v_booking_id;

    UPDATE public.forklifts SET status = 'rented' WHERE id = v_forklift_id;

    RETURN QUERY SELECT v_booking_id, v_forklift_id;
  END LOOP;

  UPDATE public.quotes SET status = 'accepted' WHERE id = p_quote_id;
END;
$function$;

-- R12 B4: seed idempotente del módulo "Facturas de Proveedor".
INSERT INTO public.role_permissions (role, module, access_level) VALUES
  ('admin',          'Facturas de Proveedor', 'full'),
  ('administrativo', 'Facturas de Proveedor', 'full'),
  ('auditor',        'Facturas de Proveedor', 'read')
ON CONFLICT (role, module) DO NOTHING;
