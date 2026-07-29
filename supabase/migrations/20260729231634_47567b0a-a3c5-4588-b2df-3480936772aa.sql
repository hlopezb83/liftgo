-- DB4-04 (N-R4-B, MEDIO): salida simetrica de DB3-17e.
CREATE OR REPLACE FUNCTION public.sync_forklift_on_booking_exit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_forklift uuid;
  v_released int := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  END IF;

  IF v_forklift IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  UPDATE public.forklifts
     SET status = 'available', updated_at = now()
   WHERE id = v_forklift
     AND status = 'rented'
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings
       WHERE forklift_id = v_forklift
         AND id IS DISTINCT FROM OLD.id
         AND status = 'confirmed'
         AND start_date <= CURRENT_DATE
         AND end_date   >= CURRENT_DATE
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available',
            'Reserva ' || COALESCE(OLD.booking_number, OLD.id::text) ||
            CASE WHEN TG_OP = 'DELETE' THEN ' eliminada' ELSE ' cancelada' END ||
            ': unidad liberada',
            auth.uid());
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_sync_forklift_on_booking_cancel ON public.bookings;
CREATE TRIGGER trg_sync_forklift_on_booking_cancel
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_on_booking_exit();

DROP TRIGGER IF EXISTS trg_sync_forklift_on_booking_delete ON public.bookings;
CREATE TRIGGER trg_sync_forklift_on_booking_delete
  AFTER DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_on_booking_exit();