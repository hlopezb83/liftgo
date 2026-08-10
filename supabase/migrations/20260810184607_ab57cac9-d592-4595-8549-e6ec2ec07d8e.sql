-- M9: integridad referencial de deliveries contra su reserva
-- (booking confirmed + forklift match + fecha en ventana).
CREATE OR REPLACE FUNCTION public.validate_delivery_booking_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  -- Entregas sueltas (sin reserva) no se validan.
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- La cancelación en cascada desde cancel_booking siempre se permite.
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva % no existe', NEW.booking_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- El montacargas de la entrega debe ser el de la reserva (siempre).
  IF NEW.forklift_id IS DISTINCT FROM v_booking.forklift_id THEN
    RAISE EXCEPTION 'El montacargas de la entrega (%) no corresponde al de la reserva (%).',
      NEW.forklift_id, v_booking.forklift_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Registros retroactivos ya completados (DeliveryFormDialog "ya entregada")
  -- se eximen de los checks de vigencia/ventana.
  IF COALESCE(NEW.status, 'scheduled') = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Solo se programan entregas de reservas confirmadas.
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se pueden programar entregas de una reserva confirmada (estado actual: %).',
      v_booking.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Ventana: la ENTREGA debe caer dentro de la renta.
  IF NEW.type = 'delivery'
     AND (NEW.scheduled_date < v_booking.start_date OR NEW.scheduled_date > v_booking.end_date) THEN
    RAISE EXCEPTION 'La entrega (%) debe caer dentro de la ventana de la renta (% → %).',
      NEW.scheduled_date, v_booking.start_date, v_booking.end_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- La RECOLECCIÓN no puede ser anterior al inicio.
  IF NEW.type = 'pickup' AND NEW.scheduled_date < v_booking.start_date THEN
    RAISE EXCEPTION 'La recolección (%) no puede ser anterior al inicio de la renta (%).',
      NEW.scheduled_date, v_booking.start_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_delivery_booking_integrity ON public.deliveries;
CREATE TRIGGER trg_delivery_booking_integrity
  BEFORE INSERT OR UPDATE OF booking_id, forklift_id, scheduled_date, type, status
  ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_booking_integrity();

-- M10: no se puede cancelar una reserva con entregas completed.
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

-- M11: "hoy" del negocio = America/Monterrey, explícito.
CREATE OR REPLACE FUNCTION public.guard_quote_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    IF NEW.valid_until IS NOT NULL AND NEW.valid_until < public.today_mty() THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion vencida (valid_until=%)', NEW.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.valid_until IS NOT NULL AND OLD.valid_until < public.today_mty() THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion cuya vigencia ya vencio (valid_until=%). Extiende la vigencia y reenviala primero.', OLD.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $do$
DECLARE
  r record;
  new_def text;
  targets text[] := ARRAY[
    'guard_quote_acceptance','validate_delivery_not_in_past',
    'create_booking','cancel_booking','convert_quote_to_bookings'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY(targets)
      AND pg_get_functiondef(p.oid) ~* '\mCURRENT_DATE\M'
  LOOP
    new_def := regexp_replace(r.def, '\mCURRENT_DATE\M', 'public.today_mty()', 'gi');
    EXECUTE new_def;
  END LOOP;
END
$do$;