-- Sprint 4 (Fix 4.4): semántica única de "renta activa" = entrega completada
-- sin devolución completada. Antes bastaba una reserva confirmada (demasiado
-- estricto: bloqueaba unidades ya devueltas).

CREATE OR REPLACE FUNCTION public.has_open_rental(p_forklift_id uuid)
RETURNS boolean
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
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.deliveries d
      ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
    WHERE b.forklift_id = p_forklift_id
      AND b.status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries r
        WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
      )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_open_rental(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_open_rental(uuid) TO authenticated, service_role;

-- RPC de venta: usar la nueva semántica.
CREATE OR REPLACE FUNCTION public.assign_forklift_to_sale_quote(p_quote_id uuid, p_forklift_ids uuid[], p_line_indices integer[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_idx int;
  v_fid uuid;
  v_prev text;
  v_deleted_at timestamptz;
  v_quote public.quotes%ROWTYPE;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_forklift_ids IS NULL OR p_line_indices IS NULL
     OR array_length(p_forklift_ids, 1) IS NULL
     OR array_length(p_forklift_ids, 1) <> array_length(p_line_indices, 1) THEN
    RAISE EXCEPTION 'Las listas de unidades y líneas deben tener la misma longitud'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada: %', p_quote_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_quote.quote_type <> 'sale' THEN
    RAISE EXCEPTION 'La cotización % no es de venta (tipo: %)', p_quote_id, v_quote.quote_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'La cotización debe estar aceptada por el cliente para asignar unidades (estado actual: %).', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  FOR v_idx IN 1 .. array_length(p_forklift_ids, 1) LOOP
    v_fid := p_forklift_ids[v_idx];

    SELECT status, deleted_at INTO v_prev, v_deleted_at
      FROM public.forklifts WHERE id = v_fid FOR UPDATE;
    IF v_prev IS NULL THEN
      RAISE EXCEPTION 'Montacargas no encontrado: %', v_fid USING ERRCODE = 'check_violation';
    END IF;
    IF v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'El montacargas % está archivado; restáuralo antes de asignarlo a una venta', v_fid
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev = 'sold' THEN
      RAISE EXCEPTION 'El montacargas % ya está vendido', v_fid USING ERRCODE = 'check_violation';
    END IF;
    IF public.has_open_rental(v_fid) THEN
      RAISE EXCEPTION 'La unidad tiene una renta activa; completa la devolución antes de venderla o darla de baja'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.quote_assigned_forklifts (quote_id, forklift_id, line_index)
    VALUES (p_quote_id, v_fid, p_line_indices[v_idx]);

    UPDATE public.forklifts
       SET status = 'sold', updated_at = now()
     WHERE id = v_fid;

    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_fid, v_prev, 'sold',
            'Asignado a cotización de venta ' || p_quote_id::text);
  END LOOP;
END;
$function$;

-- RPC de cambio de estado: misma semántica que el trigger.
CREATE OR REPLACE FUNCTION public.change_forklift_status(p_forklift_id uuid, p_new_status text, p_reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_current text; v_confirmed int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin')
       OR public.has_role(auth.uid(),'administrativo')
       OR public.has_role(auth.uid(),'mechanic')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_current FROM public.forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current = p_new_status THEN RETURN; END IF;
  IF p_new_status NOT IN ('available','rented','maintenance','retired','sold') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_new_status;
  END IF;

  SELECT count(*) INTO v_confirmed
    FROM public.bookings WHERE forklift_id = p_forklift_id AND status = 'confirmed';
  IF p_new_status = 'rented' AND v_confirmed = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa';
  END IF;

  IF v_current = 'rented'
     AND p_new_status IN ('maintenance','available','sold','retired')
     AND public.has_open_rental(p_forklift_id) THEN
    RAISE EXCEPTION 'La unidad tiene una renta activa; completa la devolución antes de venderla o darla de baja'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_new_status IN ('maintenance','sold','retired') AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'La razón es obligatoria para este cambio de estado';
  END IF;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = p_new_status WHERE id = p_forklift_id;
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_current, p_new_status, p_reason);
END;
$function$;

-- Trigger de UPDATE directo: misma semántica.
CREATE OR REPLACE FUNCTION public.guard_forklift_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_confirmed int;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF current_setting('app.forklift_rpc', true) = 'on' THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_confirmed
    FROM public.bookings WHERE forklift_id = NEW.id AND status = 'confirmed';

  IF OLD.status = 'rented'
     AND NEW.status IN ('maintenance','available','sold','retired','out_of_service')
     AND public.has_open_rental(NEW.id) THEN
    RAISE EXCEPTION 'La unidad tiene una renta activa; completa la devolución antes de venderla o darla de baja'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'rented' AND OLD.status IS DISTINCT FROM 'rented' AND v_confirmed = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('maintenance','sold','retired') AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on'
     AND NOT EXISTS (SELECT 1 FROM public.maintenance_logs WHERE forklift_id = NEW.id AND work_status NOT IN ('completed','cancelled','closed','done')) THEN
    RAISE EXCEPTION 'Cambio a % solo via change_forklift_status (con razon) o con bitacora de mantenimiento abierta', NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;