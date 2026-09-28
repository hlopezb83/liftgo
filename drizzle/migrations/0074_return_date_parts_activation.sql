-- AUD-01: use the operational date in Monterrey, independent of the DB session timezone.
-- AUD-03: activation is idempotent for existing inventory; stock, cost, minimum
-- and location can change only through explicit inventory edit/movement flows.
CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_inspection_id uuid;
  v_old_status text;
  v_new_status text;
  v_customer_id uuid;
  v_is_damaged_condition boolean;
  v_sends_to_maintenance boolean;
  v_booking_start date;
  v_existing_id uuid;
  v_booking_forklift_id uuid;
  v_booking_status text;
  v_open_damages integer;
  v_booking_end date;
  v_max_hours numeric;
  v_extra_rate numeric;
  v_months numeric;
  v_allowed numeric;
  v_extra_hours numeric;
  v_extra_charge numeric;
  v_span_end date;
  v_full_months integer;
  v_anchor date;
  v_rem_days integer;
  v_days_in_month integer;
  v_late_days numeric;
  v_late_charge numeric;
  v_daily_rate numeric;
  v_monthly_rate numeric;
  v_delivery_hours numeric;
  v_pickup_hours numeric;
  v_meter_hours numeric;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.'
      USING ERRCODE = 'P0002';
  END IF;

  -- El montacargas también debe ser de la organización actual: una mezcla A/B
  -- falla antes de cualquier escritura.
  IF p_forklift_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.forklifts f
     WHERE f.id = p_forklift_id AND f.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Montacargas inexistente o no autorizado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(p_condition, 'good') NOT IN ('good', 'minor_damage', 'major_damage', 'needs_repair') THEN
    RAISE EXCEPTION 'Condición de devolución no válida (%). Valores permitidos: good, minor_damage, major_damage, needs_repair.', p_condition
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_fuel_level IS NOT NULL AND btrim(p_fuel_level) <> ''
     AND btrim(p_fuel_level) NOT IN ('Full', '3/4', '1/2', '1/4', 'Empty') THEN
    RAISE EXCEPTION 'Nivel de combustible no válido (%). Valores permitidos: Full, 3/4, 1/2, 1/4, Empty.', p_fuel_level
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN
    RAISE EXCEPTION 'El costo de daño no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_hours_used IS NOT NULL AND p_hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas (%)', p_hours_used
      USING ERRCODE = 'check_violation';
  END IF;

  v_is_damaged_condition := p_condition IN ('minor_damage', 'major_damage', 'needs_repair');
  v_sends_to_maintenance := v_is_damaged_condition;
  IF v_is_damaged_condition
     AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing_id
    FROM public.return_inspections
   WHERE booking_id = p_booking_id
     AND organization_id = v_org
   LIMIT 1;
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

  SELECT start_date, end_date, forklift_id, status
    INTO v_booking_start, v_booking_end, v_booking_forklift_id, v_booking_status
    FROM public.bookings
   WHERE id = p_booking_id
     AND organization_id = v_org
   FOR UPDATE;
  IF v_booking_start IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001';
  END IF;
  IF v_booking_forklift_id IS DISTINCT FROM p_forklift_id THEN
    RAISE EXCEPTION 'La reserva % no corresponde al montacargas % (la reserva es de la unidad %). Verifica la unidad antes de completar la devolucion.',
      p_booking_id, p_forklift_id, v_booking_forklift_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_booking_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se puede registrar la devolución de una reserva confirmada (estado actual: %).', v_booking_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.deliveries
     WHERE booking_id = p_booking_id
       AND organization_id = v_org
       AND type = 'delivery'
       AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'No hay una entrega completada para esta reserva; completa primero la entrega al cliente.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (p_inspected_at AT TIME ZONE 'America/Monterrey')::date < v_booking_start THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser anterior al inicio de la reserva (%).', v_booking_start
      USING ERRCODE = 'P0001';
  END IF;
  IF p_inspected_at > now() THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser futura.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bloque 3A: reconciliación del horómetro.
  SELECT d.hours_reading INTO v_delivery_hours
    FROM public.deliveries d
   WHERE d.booking_id = p_booking_id
     AND d.organization_id = v_org
     AND d.type = 'delivery'
     AND d.status = 'completed'
     AND d.hours_reading IS NOT NULL
     AND d.hours_reading >= 0
   ORDER BY COALESCE(d.completed_at, d.scheduled_date::timestamptz) DESC NULLS LAST,
            d.created_at DESC, d.id DESC
   LIMIT 1;
  SELECT d.hours_reading INTO v_pickup_hours
    FROM public.deliveries d
   WHERE d.booking_id = p_booking_id
     AND d.organization_id = v_org
     AND d.type = 'pickup'
     AND d.status = 'completed'
     AND d.hours_reading IS NOT NULL
     AND d.hours_reading >= 0
   ORDER BY COALESCE(d.completed_at, d.scheduled_date::timestamptz) DESC NULLS LAST,
            d.created_at DESC, d.id DESC
   LIMIT 1;
  IF v_delivery_hours IS NOT NULL AND v_pickup_hours IS NOT NULL THEN
    IF v_pickup_hours < v_delivery_hours THEN
      RAISE EXCEPTION 'Lecturas de horómetro inconsistentes: la recolección (%) es menor que la entrega (%). Corrige las lecturas antes de cerrar la devolución.',
        v_pickup_hours, v_delivery_hours
        USING ERRCODE = 'check_violation';
    END IF;
    v_meter_hours := ROUND(v_pickup_hours - v_delivery_hours, 2);
    IF p_hours_used IS NOT NULL AND ROUND(p_hours_used, 2) <> v_meter_hours THEN
      RAISE NOTICE 'Horas capturadas (%) reconciliadas con el horómetro (% - % = %).',
        p_hours_used, v_pickup_hours, v_delivery_hours, v_meter_hours;
    END IF;
    p_hours_used := v_meter_hours;
  END IF;

  SELECT c.max_hours_per_month, c.extra_hour_rate
    INTO v_max_hours, v_extra_rate
    FROM public.contracts c
   WHERE c.booking_id = p_booking_id
     AND c.organization_id = v_org
     AND COALESCE(c.status, '') <> 'cancelled'
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF p_hours_used IS NOT NULL
     AND COALESCE(v_max_hours, 0) > 0
     AND COALESCE(v_extra_rate, 0) > 0 THEN
    v_span_end := COALESCE(v_booking_end, (p_inspected_at AT TIME ZONE 'America/Monterrey')::date);
    v_full_months := EXTRACT(YEAR FROM age(v_span_end, v_booking_start))::integer * 12
                   + EXTRACT(MONTH FROM age(v_span_end, v_booking_start))::integer;
    v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    IF v_anchor > v_span_end THEN
      v_full_months := GREATEST(v_full_months - 1, 0);
      v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    END IF;
    v_days_in_month := EXTRACT(DAY FROM (
      date_trunc('month', v_anchor) + interval '1 month - 1 day'
    )::date)::integer;
    v_rem_days := GREATEST(v_span_end - v_anchor + 1, 0);
    v_months := GREATEST(1, v_full_months + v_rem_days::numeric / v_days_in_month);
    v_allowed := v_max_hours * v_months;
    IF p_hours_used > v_allowed THEN
      v_extra_hours := ROUND(p_hours_used - v_allowed, 2);
      v_extra_charge := ROUND(v_extra_hours * v_extra_rate, 2);
    END IF;
  END IF;

  IF v_booking_end IS NOT NULL AND (p_inspected_at AT TIME ZONE 'America/Monterrey')::date > v_booking_end THEN
    v_late_days := ((p_inspected_at AT TIME ZONE 'America/Monterrey')::date - v_booking_end)::numeric;
    SELECT b.daily_rate, b.monthly_rate
      INTO v_daily_rate, v_monthly_rate
      FROM public.bookings b
     WHERE b.id = p_booking_id
       AND b.organization_id = v_org;
    IF COALESCE(v_daily_rate, 0) <= 0 AND COALESCE(v_monthly_rate, 0) > 0 THEN
      v_daily_rate := v_monthly_rate
        / EXTRACT(DAY FROM (
            date_trunc('month', v_booking_end) + interval '1 month - 1 day'
          )::date);
    END IF;
    IF COALESCE(v_daily_rate, 0) > 0 THEN
      v_late_charge := ROUND(v_late_days * v_daily_rate, 2);
    END IF;
  END IF;

  SELECT status INTO v_old_status
    FROM public.forklifts
   WHERE id = p_forklift_id
     AND organization_id = v_org
   FOR UPDATE;
  SELECT customer_id INTO v_customer_id
    FROM public.bookings
   WHERE id = p_booking_id
     AND organization_id = v_org;
  IF p_fuel_level IS NULL OR btrim(p_fuel_level) = '' THEN
    RAISE EXCEPTION 'El nivel de combustible es obligatorio en la inspección de devolución'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.return_inspections (
    booking_id, forklift_id, condition, damage_notes, damage_cost,
    hours_used, fuel_level, inspected_by, inspected_at,
    extra_hours, suggested_extra_hour_charge, late_days, suggested_late_charge,
    organization_id
  ) VALUES (
    p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost,
    p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at,
    v_extra_hours, v_extra_charge, v_late_days, v_late_charge,
    v_org
  )
  RETURNING id INTO v_inspection_id;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
     SET return_status = 'returned', status = 'completed', updated_at = now()
   WHERE id = p_booking_id
     AND organization_id = v_org;

  IF v_is_damaged_condition THEN
    INSERT INTO public.damage_records (
      inspection_id, forklift_id, booking_id, customer_id, description,
      estimated_cost, status, previous_forklift_status, organization_id
    ) VALUES (
      v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported', v_old_status, v_org
    );
  END IF;

  IF NOT v_sends_to_maintenance THEN
    SELECT count(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = p_forklift_id
       AND organization_id = v_org
       AND deleted_at IS NULL
       AND (status IN ('reported', 'in_repair') OR repaired_at IS NULL);
    IF v_open_damages > 0 THEN
      v_sends_to_maintenance := true;
    END IF;
  END IF;
  IF NOT v_sends_to_maintenance AND EXISTS (
    SELECT 1
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = p_forklift_id
       AND ml.organization_id = v_org
       AND ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ) THEN
    v_sends_to_maintenance := true;
  END IF;

  IF v_old_status = 'rented' THEN
    v_new_status := CASE
      WHEN v_sends_to_maintenance THEN 'maintenance'
      WHEN EXISTS (
        SELECT 1
          FROM public.bookings b
          JOIN public.deliveries d
            ON d.booking_id = b.id
           AND d.type = 'delivery'
           AND d.status = 'completed'
           AND d.organization_id = v_org
         WHERE b.forklift_id = p_forklift_id
           AND b.organization_id = v_org
           AND b.id <> p_booking_id
           AND b.status = 'confirmed'
           AND NOT public.booking_is_returned(b.id)
      ) THEN 'rented'
      ELSE 'available'
    END;
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_new_status, updated_at = now()
     WHERE id = p_forklift_id
       AND organization_id = v_org;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, organization_id)
    VALUES (
      p_forklift_id, v_old_status, v_new_status,
      'Returned — condition: ' || p_condition,
      v_org
    );
  END IF;

  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_inspection_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_parts_catalog(
  p_catalog_part_id uuid,
  p_stock_quantity integer DEFAULT 0,
  p_min_stock_level integer DEFAULT 0,
  p_unit_cost numeric DEFAULT 0,
  p_location text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org uuid;
  v_user uuid := auth.uid();
  v_catalog public.parts_catalog%ROWTYPE;
  v_local_id uuid;
BEGIN
  v_org := public.current_internal_organization_id();
  IF v_user IS NULL OR v_org IS NULL
     OR NOT public.is_internal_member(v_user)
     OR NOT public.is_parts_writer() THEN
    RAISE EXCEPTION 'No autorizado para configurar el inventario de la empresa'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_stock_quantity, 0) < 0
     OR coalesce(p_min_stock_level, 0) < 0
     OR coalesce(p_unit_cost, 0) < 0 THEN
    RAISE EXCEPTION 'Existencias, mínimo y costo no pueden ser negativos'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_catalog
  FROM public.parts_catalog
  WHERE id = p_catalog_part_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU global no encontrado o inactivo' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_local_id
  FROM public.parts_inventory
  WHERE organization_id = v_org
    AND (
      catalog_part_id = p_catalog_part_id
      OR (
        catalog_part_id IS NULL
        AND sku IS NOT NULL
        AND upper(btrim(sku)) = upper(btrim(v_catalog.sku))
      )
    )
  ORDER BY (catalog_part_id = p_catalog_part_id) DESC, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF v_local_id IS NULL THEN
    INSERT INTO public.parts_inventory (
      organization_id, catalog_part_id, sku, name, category,
      stock_quantity, min_stock_level, unit_cost, location, is_active
    ) VALUES (
      v_org, p_catalog_part_id, v_catalog.sku, v_catalog.name,
      coalesce(v_catalog.category, 'Otros'), coalesce(p_stock_quantity, 0),
      coalesce(p_min_stock_level, 0), coalesce(p_unit_cost, 0),
      nullif(btrim(p_location), ''), true
    ) RETURNING id INTO v_local_id;
  ELSE
    UPDATE public.parts_inventory
    SET catalog_part_id = p_catalog_part_id,
        is_active = true,
        updated_at = now()
    WHERE id = v_local_id AND organization_id = v_org;
  END IF;

  RETURN v_local_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.activate_parts_catalog(uuid, integer, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_parts_catalog(uuid, integer, integer, numeric, text) TO authenticated, service_role;

-- AUD-10: allocate the contract number in the INSERT transaction. A failed
-- contract row also rolls back the counter update, so the next success uses
-- the first available four-digit number for that organization.
CREATE OR REPLACE FUNCTION public.assign_contract_number_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF NEW.contract_number IS NULL OR btrim(NEW.contract_number) = '' THEN
    NEW.contract_number := public.next_contract_number();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_contract_number_on_insert() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_contract_number_on_insert ON public.contracts;
CREATE TRIGGER trg_contract_number_on_insert
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.assign_contract_number_on_insert();

-- AUD-07: expose the full set of units committed today, without the 501-row
-- booking-list limit. RLS and the active internal organization both apply.
CREATE OR REPLACE FUNCTION public.get_occupied_forklift_ids_today()
RETURNS TABLE(forklift_id uuid)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT DISTINCT b.forklift_id
  FROM public.bookings b
  WHERE b.organization_id = public.current_internal_organization_id()
    AND public.is_internal_member((SELECT auth.uid()))
    AND b.status = 'confirmed'
    AND b.is_e2e IS NOT TRUE
    AND b.start_date <= public.today_mty()
    AND b.end_date >= public.today_mty()
    AND b.forklift_id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_occupied_forklift_ids_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_occupied_forklift_ids_today() TO authenticated, service_role;

-- AUD-08: offset paging requires a deterministic final tie-breaker. Keep
-- SECURITY INVOKER: the underlying view must evaluate invoice RLS as the
-- signed-in user (see migration 0037).
CREATE OR REPLACE FUNCTION public.list_invoices_with_balance(
  p_statuses text[] DEFAULT NULL,
  p_due_from date DEFAULT NULL,
  p_due_to date DEFAULT NULL,
  p_with_balance_only boolean DEFAULT true,
  p_limit int DEFAULT NULL,
  p_offset int DEFAULT 0
)
RETURNS SETOF public.v_invoices_with_balance
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT v.*
  FROM public.v_invoices_with_balance v
  WHERE (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'dispatcher'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'auditor'::public.app_role)
  )
  AND (p_statuses IS NULL OR v.status = ANY(p_statuses))
  AND (p_due_from IS NULL OR v.due_date >= p_due_from)
  AND (p_due_to IS NULL OR v.due_date <= p_due_to)
  AND (NOT p_with_balance_only OR COALESCE(v.balance, 0) > 0)
  ORDER BY v.due_date NULLS LAST, v.issued_at DESC, v.id
  LIMIT COALESCE(p_limit, 1000)
  OFFSET COALESCE(p_offset, 0);
$function$;

REVOKE ALL ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, integer, integer) TO authenticated, service_role;
