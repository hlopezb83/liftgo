CREATE OR REPLACE FUNCTION public.extend_booking(
  p_booking_id uuid,
  p_new_end_date date,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forklift_id uuid;
  v_start_date date;
  v_current_end date;
  v_status text;
  v_next_service date;
  v_ext_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Bloquear la reserva para cerrar la ventana entre validación y update.
  SELECT forklift_id, start_date, end_date, status
    INTO v_forklift_id, v_start_date, v_current_end, v_status
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_forklift_id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_status IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'No se puede extender una reserva %', v_status;
  END IF;

  IF p_new_end_date IS NULL OR p_new_end_date <= v_current_end THEN
    RAISE EXCEPTION 'La nueva fecha final debe ser posterior a la actual (%).', v_current_end;
  END IF;

  -- BL-A6: buffer de 3 días de mantenimiento.
  SELECT ml.next_service_date INTO v_next_service
  FROM maintenance_logs ml
  WHERE ml.forklift_id = v_forklift_id
    AND ml.next_service_date IS NOT NULL
  ORDER BY ml.performed_at DESC
  LIMIT 1;

  IF v_next_service IS NOT NULL
     AND v_next_service <= (p_new_end_date + INTERVAL '3 days')::date
     AND v_next_service >= v_start_date THEN
    RAISE EXCEPTION 'La extensión invade la ventana de mantenimiento programado el % (buffer 3 días).', v_next_service;
  END IF;

  -- Verificar colisión con otras reservas activas del mismo montacargas.
  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = v_forklift_id
      AND b.id <> p_booking_id
      AND b.status NOT IN ('cancelled','completed')
      AND daterange(b.start_date, b.end_date, '[]') && daterange(v_start_date, p_new_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'La extensión se traslapa con otra reserva del mismo montacargas.';
  END IF;

  UPDATE bookings
     SET end_date = p_new_end_date,
         updated_at = now()
   WHERE id = p_booking_id;

  INSERT INTO booking_extensions (booking_id, original_end_date, new_end_date, reason)
  VALUES (p_booking_id, v_current_end, p_new_end_date, p_reason)
  RETURNING id INTO v_ext_id;

  RETURN v_ext_id;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_booking(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_booking(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_booking(uuid, date, text) TO service_role;