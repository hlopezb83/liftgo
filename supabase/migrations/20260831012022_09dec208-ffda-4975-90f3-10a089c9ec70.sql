-- A3-07: cerrar el bypass de validaciones al INSERTAR entregas con
-- status='completed'. El atajo se mantiene solo para UPDATE (completar una
-- entrega ya programada), que es el flujo legítimo.
CREATE OR REPLACE FUNCTION public.validate_delivery_booking_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva % no existe', NEW.booking_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.forklift_id IS DISTINCT FROM v_booking.forklift_id THEN
    RAISE EXCEPTION 'El montacargas de la entrega (%) no corresponde al de la reserva (%).',
      NEW.forklift_id, v_booking.forklift_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A3-07: antes esto aplicaba también a INSERT, permitiendo crear entregas
  -- "ya completadas" fuera de la ventana de renta o sobre reservas no
  -- confirmadas. Completar una entrega existente (UPDATE) sigue exento.
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.status, 'scheduled') = 'completed' THEN
    RETURN NEW;
  END IF;

  -- FIX-R2-11: reprogramar una RECOLECCIÓN residual de una reserva ya
  -- completada se permite. No aplica a INSERTs ni a entregas (type='delivery').
  IF TG_OP = 'UPDATE' AND NEW.type = 'pickup' AND v_booking.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se pueden programar entregas de una reserva confirmada (estado actual: %).',
      v_booking.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.type = 'delivery'
     AND (NEW.scheduled_date < v_booking.start_date OR NEW.scheduled_date > v_booking.end_date) THEN
    RAISE EXCEPTION 'La entrega (%) debe caer dentro de la ventana de la renta (% → %).',
      NEW.scheduled_date, v_booking.start_date, v_booking.end_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.type = 'pickup' AND NEW.scheduled_date < v_booking.start_date THEN
    RAISE EXCEPTION 'La recolección (%) no puede ser anterior al inicio de la renta (%).',
      NEW.scheduled_date, v_booking.start_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $function$;