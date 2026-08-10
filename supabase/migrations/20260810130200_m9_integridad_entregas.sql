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

  -- La RECOLECCIÓN no puede ser anterior al inicio (puede ser posterior a
  -- end_date: la renta pudo haber vencido ya — ver FIX-05).
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
