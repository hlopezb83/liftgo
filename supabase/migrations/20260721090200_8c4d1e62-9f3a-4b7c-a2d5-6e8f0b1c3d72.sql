-- ============================================================================
-- BL: unidades archivadas (soft-delete, deleted_at NOT NULL) ya no son
-- reservables. get_available_forklifts y create_booking no filtraban
-- deleted_at, así una unidad archivada seguía apareciendo como disponible y
-- aceptaba reservas nuevas. Se recrean ambas funciones con el filtro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
 RETURNS SETOF forklifts
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT f.*
  FROM forklifts f
  WHERE f.status IN ('available', 'rented')
    -- Unidades archivadas (soft-delete) nunca son reservables.
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND b.status != 'completed'
        AND b.status != 'cancelled'
        AND b.start_date <= p_end_date
        AND b.end_date >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
        FROM maintenance_logs ml
        WHERE ml.next_service_date IS NOT NULL
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date <= (CURRENT_DATE + INTERVAL '3 days')
    )
  ORDER BY f.name;
$function$;

-- Recreada desde 20260720161455 con el filtro deleted_at IS NULL en el lock
-- de la fila (una unidad archivada reporta "Montacargas no encontrado").
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_contact text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_recurring_billing boolean DEFAULT false,
  p_quote_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid;
  v_booking_number text;
  v_current_status text;
  v_starts_today boolean;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role)
     OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id) THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Fechas de reserva requeridas';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La fecha final no puede ser anterior a la inicial';
  END IF;

  -- Lock de la fila del montacargas: cierra la ventana entre check y update.
  -- Unidades archivadas (soft-delete) no son reservables: se comportan como
  -- inexistentes para el flujo de reserva.
  SELECT status INTO v_current_status
  FROM forklifts
  WHERE id = p_forklift_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;

  -- Solo bloqueamos estados operativos incompatibles. La disponibilidad por
  -- fechas la garantiza la exclusion constraint `no_overlapping_bookings`.
  IF v_current_status IN ('maintenance', 'out_of_service') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := next_booking_number();

  -- Si el rango solapa, la exclusion constraint dispara `exclusion_violation`
  -- (SQLSTATE 23P01) y se propaga como error controlado al cliente.
  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number, quote_id)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id)
  RETURNING id INTO v_booking_id;

  v_starts_today := p_start_date <= CURRENT_DATE;

  -- Solo actualiza el estado operativo cuando la reserva arranca hoy o antes.
  -- Las reservas futuras no bloquean la unidad hasta que se materialicen
  -- (ver mark_started_bookings_rented + cron diario).
  IF v_starts_today AND v_current_status = 'available' THEN
    UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');
  END IF;

  RETURN v_booking_id;
END;
$function$;
