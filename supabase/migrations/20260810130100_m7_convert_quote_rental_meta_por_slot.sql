-- M7: convert_quote_to_bookings consume rental_meta POR SLOT en el orden de la
-- cotización, no "LIMIT 1 del primer match del modelo" para todas las unidades.
-- Basado en la versión vigente (20260729082148). CURRENT_DATE → public.today_mty() (ya vigente).
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
 RETURNS TABLE(booking_id uuid, forklift_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE; v_assignment jsonb; v_forklift_id uuid; v_model_id uuid;
  v_daily numeric; v_weekly numeric; v_monthly numeric; v_booking_id uuid; v_meta jsonb;
  v_slots jsonb; v_idx int;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'ventas'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;

  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir cotizaciones aceptadas (estado actual: %)', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;

  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;

  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;

  -- M7: expandir rental_meta a slots por unidad preservando el orden de la
  -- cotización (una línea con quantity=N genera N slots con SUS tarifas).
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

    -- M7: consumir el PRIMER slot pendiente del modelo (y retirarlo de la
    -- lista), en vez de LIMIT 1 sobre todo rental_meta para cada unidad.
    v_meta := NULL;
    IF v_model_id IS NOT NULL THEN
      SELECT s.elem, s.ord - 1 INTO v_meta, v_idx
        FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS s(elem, ord)
       WHERE (s.elem->>'modelId')::uuid = v_model_id
       ORDER BY s.ord
       LIMIT 1;
      IF v_meta IS NOT NULL THEN
        v_slots := v_slots - v_idx; -- jsonb - int: elimina el elemento por índice
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
       SET daily_rate = v_daily, weekly_rate = v_weekly, monthly_rate = v_monthly,
           currency = COALESCE(v_quote.currency, 'MXN'), tipo_cambio = COALESCE(v_quote.tipo_cambio, 1)
     WHERE id = v_booking_id;

    RETURN QUERY SELECT v_booking_id, v_forklift_id;
  END LOOP;
END;
$function$;
