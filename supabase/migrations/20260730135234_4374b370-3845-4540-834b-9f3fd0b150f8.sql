-- GUI-DB-01: get_customer_summary usaba i.currency; la columna real es moneda.
CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals   jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role) OR
    (has_role(auth.uid(), 'customer'::app_role)
      AND p_customer_id = get_customer_id_for_user(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'booking_number', b.booking_number,
    'start_date', b.start_date, 'end_date', b.end_date, 'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM bookings b
  LEFT JOIN forklifts f ON f.id = b.forklift_id
  WHERE b.customer_id = p_customer_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'issued_at', i.issued_at,
    'due_date', i.due_date, 'total', i.total, 'status', i.status,
    'currency', COALESCE(i.moneda, 'MXN'),
    'tipo_cambio', COALESCE(NULLIF(i.tipo_cambio, 0), 1)
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id;

  SELECT jsonb_build_object(
    'total_invoiced', COALESCE(SUM(
      ROUND(total * COALESCE(NULLIF(tipo_cambio,0),1), 2)
    ) FILTER (WHERE status <> 'cancelled'), 0),
    'total_paid', (
      SELECT COALESCE(SUM(p.amount * COALESCE(NULLIF(i2.tipo_cambio,0),1)), 0)
      FROM public.payments p
      JOIN public.invoices i2 ON i2.id = p.invoice_id
      WHERE i2.customer_id = p_customer_id
        AND i2.status <> 'cancelled'
    ),
    'outstanding_revenue', (
      SELECT COALESCE(SUM(b.balance_mxn), 0)
      FROM public.v_invoices_with_balance b
      WHERE b.customer_id = p_customer_id
        AND b.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(b.cancellation_status, '') <> 'accepted'
    )
  ) INTO v_totals
  FROM invoices
  WHERE customer_id = p_customer_id;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals',   v_totals
  );
END;
$function$;

-- GUI-DB-03: cerrar/cancelar una OT no libera la unidad si tiene daños abiertos.
CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift_status  text;
  v_active_bookings  int;
  v_open_damages     int;
BEGIN
  IF NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.work_status IS NOT DISTINCT FROM NEW.work_status THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_forklift_status
    FROM public.forklifts WHERE id = NEW.forklift_id FOR UPDATE;

  IF v_forklift_status IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_bookings
    FROM public.bookings
   WHERE forklift_id = NEW.forklift_id
     AND status = 'confirmed'
     AND CURRENT_DATE BETWEEN start_date AND end_date;

  IF NEW.work_status = 'in_progress'
     AND v_forklift_status = 'available' THEN
    UPDATE public.forklifts SET status = 'maintenance', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' en progreso');
  ELSIF NEW.work_status IN ('completed', 'cancelled')
     AND v_forklift_status = 'maintenance'
     AND v_active_bookings = 0 THEN
    SELECT COUNT(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = NEW.forklift_id
       AND deleted_at IS NULL
       AND status IN ('reported', 'in_repair');
    IF v_open_damages > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' ||
              CASE WHEN NEW.work_status = 'completed' THEN 'completada' ELSE 'cancelada' END ||
              ': la unidad permanece en mantenimiento por ' || v_open_damages ||
              ' daño(s) abierto(s) (reported/in_repair)');
      RETURN NEW;
    END IF;
    UPDATE public.forklifts SET status = 'available', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'available',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' ||
            CASE WHEN NEW.work_status = 'completed' THEN 'completada' ELSE 'cancelada' END);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_forklift_on_maintenance ON public.maintenance_logs;
CREATE TRIGGER trg_sync_forklift_on_maintenance
AFTER INSERT OR UPDATE OF work_status ON public.maintenance_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_forklift_status_on_maintenance();

-- GUI-DB-04: cualquier daño en la devolución manda la unidad a mantenimiento.
CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inspection_id uuid; v_old_status text; v_new_status text;
  v_customer_id uuid; v_is_damaged_condition boolean; v_sends_to_maintenance boolean;
  v_booking_start date; v_existing_id uuid; v_booking_forklift_id uuid;
  v_open_damages int;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)
       OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN
    RAISE EXCEPTION 'El costo de daño no puede ser negativo.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_hours_used IS NOT NULL AND p_hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas (%)', p_hours_used
      USING ERRCODE = 'check_violation';
  END IF;
  v_is_damaged_condition := p_condition IN ('damaged', 'minor_damage', 'major_damage', 'needs_repair');
  -- GUI-DB-04: antes minor_damage devolvia la unidad a available con el daño abierto.
  v_sends_to_maintenance := v_is_damaged_condition;
  IF v_is_damaged_condition AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_existing_id FROM return_inspections WHERE booking_id = p_booking_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_is_damaged_condition
       OR COALESCE(p_damage_cost, 0) > 0
       OR (p_damage_notes IS NOT NULL AND btrim(p_damage_notes) <> '') THEN
      RAISE EXCEPTION 'La reserva ya tiene inspeccion de devolucion (%). Para reportar un daño adicional usa el registro de daños, no una re-inspeccion.', v_existing_id
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE NOTICE 'La reserva % ya tenia inspeccion (%); se devuelve la existente.', p_booking_id, v_existing_id;
    RETURN v_existing_id;
  END IF;
  SELECT start_date, forklift_id INTO v_booking_start, v_booking_forklift_id
    FROM bookings WHERE id = p_booking_id;
  IF v_booking_start IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001'; END IF;
  IF v_booking_forklift_id IS DISTINCT FROM p_forklift_id THEN
    RAISE EXCEPTION 'La reserva % no corresponde al montacargas % (la reserva es de la unidad %). Verifica la unidad antes de completar la devolucion.',
      p_booking_id, p_forklift_id, v_booking_forklift_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_inspected_at::date < v_booking_start THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser anterior al inicio de la reserva (%).', v_booking_start
      USING ERRCODE = 'P0001';
  END IF;
  IF p_inspected_at > (now() + interval '30 days') THEN
    RAISE EXCEPTION 'La fecha de inspección no puede estar más de 30 días en el futuro.' USING ERRCODE = 'P0001';
  END IF;
  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id;
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;
  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at)
  RETURNING id INTO v_inspection_id;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;
  IF v_is_damaged_condition THEN
    INSERT INTO damage_records (inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status, previous_forklift_status)
    VALUES (v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported', v_old_status);
  END IF;
  -- GUI-DB-04: una devolucion 'good' tampoco libera la unidad con daños abiertos previos.
  IF NOT v_sends_to_maintenance THEN
    SELECT COUNT(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = p_forklift_id
       AND deleted_at IS NULL
       AND status IN ('reported', 'in_repair');
    IF v_open_damages > 0 THEN
      v_sends_to_maintenance := true;
    END IF;
  END IF;
  v_new_status := CASE WHEN v_sends_to_maintenance THEN 'maintenance' ELSE 'available' END;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE forklifts SET status = v_new_status, updated_at = now() WHERE id = p_forklift_id;
  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, v_new_status, 'Returned — condition: ' || p_condition);
  RETURN v_inspection_id;
END;
$function$;

-- GUI-DB-10: fr.reporter_type se seleccionaba sin estar en el GROUP BY (42803).
CREATE OR REPLACE FUNCTION public.get_feedback_leaderboard(_period text DEFAULT 'all'::text)
RETURNS TABLE(reporter_id uuid, reporter_name text, total_reports bigint, accepted_reports bigint, resolved_reports bigint, total_points bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_is_customer boolean;
BEGIN
  v_start := CASE _period
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  v_is_customer := has_role(auth.uid(), 'customer'::app_role);

  RETURN QUERY
  SELECT
    CASE WHEN v_is_customer THEN NULL::uuid ELSE fr.reporter_id END AS reporter_id,
    CASE
      WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'Equipo LiftGo'
      ELSE COALESCE(MAX(fr.reporter_name), 'Anónimo')
    END AS reporter_name,
    COUNT(*)::bigint AS total_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('accepted','in_progress','resolved','closed'))::bigint AS accepted_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('resolved','closed'))::bigint AS resolved_reports,
    COALESCE(SUM(fr.points_awarded), 0)::bigint AS total_points
  FROM public.feedback_reports fr
  WHERE fr.created_at >= v_start
  GROUP BY fr.reporter_id, fr.reporter_type, (CASE WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'staff' ELSE 'self' END)
  HAVING COALESCE(SUM(fr.points_awarded), 0) > 0
  ORDER BY total_points DESC, resolved_reports DESC
  LIMIT 50;
END;
$function$;