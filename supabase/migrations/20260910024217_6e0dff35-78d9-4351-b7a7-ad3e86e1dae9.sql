CREATE OR REPLACE FUNCTION public.sync_forklift_on_booking_exit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift uuid;
  v_released integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    v_forklift := OLD.forklift_id;
  END IF;

  IF v_forklift IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts f
     SET status = 'available', updated_at = now()
   WHERE f.id = v_forklift
     AND f.status = 'rented'
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
         JOIN public.deliveries d
           ON d.booking_id = b.id
          AND d.type = 'delivery'
          AND d.status = 'completed'
        WHERE b.forklift_id = v_forklift
          AND b.id IS DISTINCT FROM OLD.id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;
  PERFORM set_config('app.forklift_rpc', 'off', true);

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (
      v_forklift,
      'rented',
      'available',
      'Reserva ' || COALESCE(OLD.booking_number, OLD.id::text)
        || CASE WHEN TG_OP = 'DELETE' THEN ' eliminada' ELSE ' cancelada' END
        || ': unidad liberada',
      (select auth.uid())
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_forklift_on_booking_exit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift uuid;
  v_status text;
  v_note text;
  v_released integer := 0;
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id, status
    INTO v_forklift, v_status
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;
  IF v_forklift IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva completada';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.deliveries
     WHERE booking_id = p_booking_id
       AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene entregas completadas: la unidad está con el cliente. Registra la devolución (inspección de retorno) en lugar de cancelar la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.invoices i
     WHERE (
       i.booking_id = p_booking_id
       OR EXISTS (
         SELECT 1
           FROM public.invoice_bookings ib
          WHERE ib.invoice_id = i.id
            AND ib.booking_id = p_booking_id
       )
     )
       AND i.status NOT IN ('draft', 'cancelled')
       AND COALESCE(i.cancellation_status, '') <> 'accepted'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene facturas emitidas vigentes. Cancela primero la factura (y su CFDI ante el SAT) antes de cancelar la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_booking_id;
  UPDATE public.deliveries
     SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id
     AND status IN ('pending', 'scheduled');

  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts f
     SET status = 'available', updated_at = now()
   WHERE f.id = v_forklift
     AND f.status = 'rented'
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
         JOIN public.deliveries d
           ON d.booking_id = b.id
          AND d.type = 'delivery'
          AND d.status = 'completed'
        WHERE b.forklift_id = v_forklift
          AND b.id <> p_booking_id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;
  PERFORM set_config('app.forklift_rpc', 'off', true);

  v_note := 'Reserva cancelada'
    || CASE
         WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
         THEN ': ' || btrim(p_reason)
         ELSE ''
       END;
  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available', v_note, (select auth.uid()));
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_forklift_rented_requires_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'rented'
     AND OLD.status IS DISTINCT FROM 'rented'
     AND current_setting('app.delivery_completed_effect', true) IS DISTINCT FROM 'on'
     AND NOT public.has_open_rental(NEW.id) THEN
    RAISE EXCEPTION 'Una unidad sólo puede marcarse rentada al completar su entrega al cliente.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'forklift_rented_requires_completed_delivery';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_forklift_rented_requires_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_forklift_rented_requires_delivery ON public.forklifts;
CREATE TRIGGER trg_forklift_rented_requires_delivery
  BEFORE UPDATE OF status ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_forklift_rented_requires_delivery();

CREATE OR REPLACE FUNCTION public.guard_forklift_sale_commitments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold'
     AND EXISTS (
       SELECT 1
         FROM public.bookings b
        WHERE b.forklift_id = NEW.id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     ) THEN
    RAISE EXCEPTION 'La unidad tiene una reserva confirmada pendiente; cancélala o completa su devolución antes de venderla.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'forklift_sale_without_booking_commitments';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_forklift_sale_commitments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_forklift_sale_commitments ON public.forklifts;
CREATE TRIGGER trg_forklift_sale_commitments
  BEFORE UPDATE OF status ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_forklift_sale_commitments();

CREATE OR REPLACE FUNCTION public.get_sale_available_forklifts(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.forklifts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'p_limit debe estar entre 1 y 500' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset no puede ser negativo' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT f.*
    FROM public.forklifts f
   WHERE f.status = 'available'
     AND f.deleted_at IS NULL
     AND COALESCE(f.is_e2e, false) = false
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     )
   ORDER BY f.name, f.id
   LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sale_available_forklifts(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sale_available_forklifts(integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_forklift_rental_status()
RETURNS TABLE(forklift_id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  RETURN QUERY
  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
      FROM public.bookings b
     WHERE b.status = 'confirmed'
       AND NOT public.booking_is_returned(b.id)
       AND EXISTS (
         SELECT 1
           FROM public.deliveries d
          WHERE d.booking_id = b.id
            AND d.type = 'delivery'
            AND d.status = 'completed'
       )
  ),
  blocked AS (
    SELECT DISTINCT dr.forklift_id AS fid
      FROM public.damage_records dr
     WHERE dr.deleted_at IS NULL
       AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
    UNION
    SELECT DISTINCT ml.forklift_id
      FROM public.maintenance_logs ml
     WHERE ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ),
  promote AS (
    UPDATE public.forklifts f
       SET status = 'rented', updated_at = now()
      FROM active a
     WHERE f.id = a.fid
       AND f.status = 'available'
    RETURNING f.id, 'available'::text AS prev, 'rented'::text AS newv
  ),
  demote AS (
    UPDATE public.forklifts f
       SET status = 'available', updated_at = now()
     WHERE f.status = 'rented'
       AND NOT EXISTS (SELECT 1 FROM active a WHERE a.fid = f.id)
       AND NOT EXISTS (SELECT 1 FROM blocked bl WHERE bl.fid = f.id)
    RETURNING f.id, 'rented'::text AS prev, 'available'::text AS newv
  ),
  moved AS (
    SELECT id, prev, newv FROM promote
    UNION ALL
    SELECT id, prev, newv FROM demote
  ),
  logged AS (
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    SELECT m.id, m.prev, m.newv, 'Sincronización de estatus de renta', (select auth.uid())
      FROM moved m
    RETURNING 1
  )
  SELECT m.id, m.prev, m.newv
    FROM moved m
   WHERE (SELECT count(*) FROM logged) >= 0;

  PERFORM set_config('app.forklift_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_forklift_rental_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_forklift_rental_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_delivery_completed_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_allowed text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending' THEN ARRAY['scheduled', 'completed', 'cancelled']
    WHEN 'scheduled' THEN ARRAY['completed', 'cancelled']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transición de entrega no permitida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'deliveries_status_transition';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_delivery_completed_terminal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_delivery_completed_terminal ON public.deliveries;
CREATE TRIGGER trg_guard_delivery_completed_terminal
  BEFORE UPDATE OF status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_completed_terminal();

NOTIFY pgrst, 'reload schema';