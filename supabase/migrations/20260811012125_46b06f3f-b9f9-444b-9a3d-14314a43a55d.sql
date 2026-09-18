-- FIX-R3-01 (ALTA): bypass transaccional para archivar OTs cerradas con refacciones/MO.
CREATE OR REPLACE FUNCTION public.reject_mutations_on_closed_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_status text;
BEGIN
  IF current_setting('app.maintenance_soft_delete', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  IF v_log_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT work_status INTO v_status FROM public.maintenance_logs WHERE id = v_log_id;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'No se pueden modificar refacciones ni mano de obra de una orden %.', v_status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.maintenance_logs WHERE id = p_log_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;

  -- FIX-R3-01: flag local a la transacción para pasar el guard de OTs cerradas.
  PERFORM set_config('app.maintenance_soft_delete', 'on', true);

  DELETE FROM public.maintenance_parts WHERE maintenance_log_id = p_log_id;
  DELETE FROM public.maintenance_labor WHERE maintenance_log_id = p_log_id;

  UPDATE public.maintenance_logs
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         work_status = CASE
           WHEN work_status IN ('pending', 'in_progress', 'scheduled') THEN 'cancelled'
           ELSE work_status
         END,
         updated_at = now()
   WHERE id = p_log_id;
END;
$$;

-- FIX-R3-03: validar la cotización antes de asignar unidades de venta.
CREATE OR REPLACE FUNCTION public.assign_forklift_to_sale_quote(
  p_quote_id uuid,
  p_forklift_ids uuid[],
  p_line_indices int[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF public.has_active_rental(v_fid) THEN
      RAISE EXCEPTION 'El montacargas % tiene una renta activa: cierra la renta antes de venderlo', v_fid
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
$$;

REVOKE ALL ON FUNCTION public.assign_forklift_to_sale_quote(uuid, uuid[], int[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_forklift_to_sale_quote(uuid, uuid[], int[]) TO authenticated;

-- FIX-R3-04: desasignación transaccional.
CREATE OR REPLACE FUNCTION public.unassign_forklift_from_sale_quote(
  p_assignment_id uuid,
  p_forklift_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.quote_assigned_forklifts%ROWTYPE;
  v_prev text;
  v_deleted_at timestamptz;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_assignment FROM public.quote_assigned_forklifts
   WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación no encontrada: %', p_assignment_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_assignment.forklift_id <> p_forklift_id THEN
    RAISE EXCEPTION 'La asignación % no corresponde al montacargas %', p_assignment_id, p_forklift_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status, deleted_at INTO v_prev, v_deleted_at
    FROM public.forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado: %', p_forklift_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El montacargas % está archivado; restáuralo antes de desasignarlo', p_forklift_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_prev <> 'sold' THEN
    RAISE EXCEPTION 'El montacargas % no está vendido (estado actual: %); nada que revertir', p_forklift_id, v_prev
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  DELETE FROM public.quote_assigned_forklifts WHERE id = p_assignment_id;

  UPDATE public.forklifts
     SET status = 'available', updated_at = now()
   WHERE id = p_forklift_id;

  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_prev, 'available',
          'Desasignado de cotización de venta ' || v_assignment.quote_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.unassign_forklift_from_sale_quote(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unassign_forklift_from_sale_quote(uuid, uuid) TO authenticated;

-- FIX-R3-02F (finanzas, MEDIA): reset del contador de misses al re-timbrar REP.
CREATE OR REPLACE FUNCTION public.claim_payment_rep_stamping(
  p_payment_id uuid,
  p_stale_minutes integer DEFAULT 5
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed uuid;
  v_status text;
BEGIN
  UPDATE public.payments
     SET rep_cfdi_status = 'stamping',
         rep_stamping_started_at = now(),
         rep_lookup_attempts = 0
   WHERE id = p_payment_id
     AND (
       (rep_cfdi_status IN ('pending', 'error', 'none') AND rep_cfdi_uuid IS NULL)
       OR rep_cfdi_status = 'cancelled'
     )
  RETURNING id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    RETURN 'claimed';
  END IF;

  SELECT rep_cfdi_status INTO v_status FROM public.payments WHERE id = p_payment_id;
  RETURN COALESCE(v_status, 'not_found');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_rep_stamping(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_payment_rep_stamping(uuid, integer) TO service_role;