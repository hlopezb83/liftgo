-- v7.217.0 · C5a: RPC transaccional para eliminar reservas
CREATE OR REPLACE FUNCTION public.delete_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_forklift uuid;
  v_has_active boolean;
BEGIN
  -- Solo admin/administrativo pueden eliminar reservas (paridad con cancel_booking).
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'administrativo')) THEN
    RAISE EXCEPTION 'No autorizado para eliminar reservas' USING ERRCODE = '42501';
  END IF;

  SELECT status, forklift_id
    INTO v_status, v_forklift
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- Solo se pueden borrar reservas ya canceladas o completadas.
  -- Para reservas activas (pending/confirmed/in_progress) usar cancel_booking primero.
  IF v_status NOT IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar reservas canceladas o completadas (estado actual: %). Usa cancelar primero.', v_status
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.bookings WHERE id = p_booking_id;

  -- Si el equipo queda sin reservas activas, regresarlo a 'available'.
  IF v_forklift IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.forklift_id = v_forklift
        AND b.status IN ('confirmed', 'in_progress', 'pending')
    ) INTO v_has_active;

    IF NOT v_has_active THEN
      UPDATE public.forklifts
         SET status = 'available'
       WHERE id = v_forklift
         AND status = 'rented';

      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
      SELECT v_forklift, 'rented', 'available', 'Reserva eliminada', auth.uid()
      WHERE EXISTS (SELECT 1 FROM public.forklifts WHERE id = v_forklift);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_booking(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_booking(uuid) FROM anon, public;