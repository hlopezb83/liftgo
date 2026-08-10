-- M10: no se puede cancelar una reserva con entregas completed (la unidad está
-- con el cliente); exigir el flujo de devolución.
-- Basado en la versión vigente (20260725072649). Conserva íntegra su lógica
-- (ya usa public.today_mty(), M11 ya aplicado en runtime).
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_forklift uuid; v_status text; v_note text; v_released int := 0;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT forklift_id, status INTO v_forklift, v_status
  FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_forklift IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF v_status = 'cancelled' THEN RETURN; END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva completada';
  END IF;

  -- M10: si ya hubo entregas completadas, la unidad está físicamente con el
  -- cliente. Cancelar liberaría la unidad sin devolución ni inspección de daños.
  IF EXISTS (
    SELECT 1 FROM public.deliveries
    WHERE booking_id = p_booking_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene entregas completadas: la unidad está con el cliente. Registra la devolución (inspección de retorno) en lugar de cancelar la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;

  UPDATE deliveries SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id AND status IN ('pending','scheduled');

  UPDATE forklifts
     SET status = 'available', updated_at = now()
   WHERE id = v_forklift AND status = 'rented'
     AND NOT EXISTS (
       SELECT 1 FROM bookings
       WHERE forklift_id = v_forklift AND id <> p_booking_id
         AND status = 'confirmed'
         AND start_date <= public.today_mty()
         AND end_date   >= public.today_mty()
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;

  v_note := 'Reserva cancelada' ||
            CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
                 THEN ': ' || btrim(p_reason) ELSE '' END;

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available', v_note, auth.uid());
  END IF;
END;
$$;
