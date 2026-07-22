CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift_id uuid;
  v_current_status text;
  v_old_status text;
  v_other_active int;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'ventas'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id, status INTO v_forklift_id, v_current_status
    FROM bookings WHERE id = p_booking_id;

  IF v_forklift_id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_current_status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva en estado %', v_current_status
      USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;
  SELECT count(*) INTO v_other_active FROM bookings
   WHERE forklift_id = v_forklift_id AND id != p_booking_id AND status = 'confirmed';
  IF v_other_active = 0 THEN
    SELECT status INTO v_old_status FROM forklifts WHERE id = v_forklift_id;
    UPDATE forklifts SET status = 'available', updated_at = now() WHERE id = v_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_forklift_id, v_old_status, 'available', 'Booking cancelled');
  END IF;
END;
$function$;