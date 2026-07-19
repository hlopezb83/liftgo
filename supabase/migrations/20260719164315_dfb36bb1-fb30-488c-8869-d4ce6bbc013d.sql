
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(
  p_quote_id uuid,
  p_assignments jsonb,
  p_recurring boolean DEFAULT false
)
RETURNS TABLE(booking_id uuid, forklift_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;

  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments)
  LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    v_daily   := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
    v_weekly  := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
    v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);

    -- create_booking valida disponibilidad, RLS de rol y asigna folio.
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
$$;

REVOKE ALL ON FUNCTION public.convert_quote_to_bookings(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_bookings(uuid, jsonb, boolean) TO authenticated;
