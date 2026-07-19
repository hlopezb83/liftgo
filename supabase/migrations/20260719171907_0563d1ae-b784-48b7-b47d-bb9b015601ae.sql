-- BL-33: reject expired quotes at accept/convert time (do not depend on daily cron)

CREATE OR REPLACE FUNCTION public.accept_quote_from_portal(p_quote_id uuid, p_ip text DEFAULT NULL::text)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer UUID;
  v_quote public.quotes;
BEGIN
  v_customer := public.get_customer_id_for_user(auth.uid());
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_quote.customer_id <> v_customer THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_quote.status <> 'sent' THEN RAISE EXCEPTION 'Cotización no disponible para aceptar'; END IF;

  -- BL-33: rechazar vencidas aunque el cron aún no las marque
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotización vencida';
  END IF;

  UPDATE public.quotes
    SET status = 'accepted',
        accepted_at = now(),
        accepted_ip = p_ip,
        accepted_by_user_id = auth.uid()
    WHERE id = p_quote_id
    RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$function$;

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
  v_daily numeric;
  v_weekly numeric;
  v_monthly numeric;
  v_booking_id uuid;
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

  IF v_quote.status = 'accepted' THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;

  -- BL-33: no convertir cotizaciones vencidas
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;

  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;

  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments)
  LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    v_daily   := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
    v_weekly  := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
    v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);

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

    UPDATE bookings
       SET daily_rate   = NULLIF(v_daily,   0),
           weekly_rate  = NULLIF(v_weekly,  0),
           monthly_rate = NULLIF(v_monthly, 0)
     WHERE id = v_booking_id;

    booking_id := v_booking_id;
    forklift_id := v_forklift_id;
    RETURN NEXT;
  END LOOP;

  UPDATE quotes SET status = 'accepted' WHERE id = p_quote_id;
END;
$function$;