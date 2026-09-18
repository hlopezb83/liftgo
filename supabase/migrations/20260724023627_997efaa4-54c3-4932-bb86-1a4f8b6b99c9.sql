-- v7.218.0 · ARQ2-B2: guardas de integridad referencial para delete_booking + fix status_logs
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
  v_updated int;
BEGIN
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

  IF v_status NOT IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar reservas canceladas o completadas (estado actual: %). Usa cancelar primero.', v_status
      USING ERRCODE = 'P0001';
  END IF;

  -- ARQ2-B2: pre-validar dependencias con FK NO ACTION/RESTRICT para evitar
  -- el error crudo 23503 y dar un mensaje claro al usuario.
  -- booking_extensions tiene ON DELETE CASCADE → se elimina con la reserva.
  IF EXISTS (SELECT 1 FROM public.invoice_bookings    WHERE booking_id = p_booking_id)
     OR EXISTS (SELECT 1 FROM public.invoices          WHERE booking_id = p_booking_id)
     OR EXISTS (SELECT 1 FROM public.contracts         WHERE booking_id = p_booking_id)
     OR EXISTS (SELECT 1 FROM public.deliveries        WHERE booking_id = p_booking_id)
     OR EXISTS (SELECT 1 FROM public.return_inspections WHERE booking_id = p_booking_id)
     OR EXISTS (SELECT 1 FROM public.damage_records    WHERE booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'La reserva tiene documentos ligados (facturas, contratos, entregas, inspecciones o daños); no se puede eliminar.'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.bookings WHERE id = p_booking_id;

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

      -- ARQ2-B2: sólo registrar status_log si el UPDATE realmente aplicó
      -- (antes se logueaba rented→available aunque el equipo no estuviera rented).
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated > 0 THEN
        INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
        VALUES (v_forklift, 'rented', 'available', 'Reserva eliminada', auth.uid());
      END IF;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_booking(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_booking(uuid) FROM anon, public;