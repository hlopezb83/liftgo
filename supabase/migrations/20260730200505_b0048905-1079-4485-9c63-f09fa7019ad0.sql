-- ============================================================
-- R6-DB-01 (N6-MEC-01, P0): el mechanic no puede cerrar el ciclo de reparación.
-- ============================================================

GRANT UPDATE (status, maintenance_log_id, repaired_at, deleted_at, deleted_by)
  ON public.damage_records TO authenticated;

DROP POLICY IF EXISTS "Mechanics update damage_records" ON public.damage_records;
CREATE POLICY "Mechanics update damage_records"
  ON public.damage_records FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'mechanic'::public.app_role)
    AND deleted_at IS NULL
    AND status IN ('reported', 'in_repair')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'mechanic'::public.app_role)
    AND (
      (deleted_at IS NULL AND status IN ('in_repair', 'repaired'))
      OR deleted_at IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.guard_damage_record_mechanic_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'mechanic'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'administrativo'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'dispatcher'::public.app_role)
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.description IS DISTINCT FROM OLD.description
     OR NEW.estimated_cost IS DISTINCT FROM OLD.estimated_cost
     OR NEW.actual_cost IS DISTINCT FROM OLD.actual_cost
     OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.inspection_id IS DISTINCT FROM OLD.inspection_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.previous_forklift_status IS DISTINCT FROM OLD.previous_forklift_status THEN
    RAISE EXCEPTION 'Un mechanic solo puede actualizar el estado y cierre del daño (status, maintenance_log_id, repaired_at o su archivo), no montos, cliente ni factura.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'in_repair' AND NEW.status = 'repaired' THEN
      NEW.repaired_at := COALESCE(NEW.repaired_at, now());
    ELSIF OLD.status = 'reported' AND NEW.status = 'in_repair'
          AND NEW.maintenance_log_id IS NOT NULL THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Transición de estado no permitida para mechanic en daños: % -> %. Solo se permite in_repair -> repaired (cierre de reparación) o reported -> in_repair con orden de trabajo ligada.',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    IF OLD.status NOT IN ('reported', 'in_repair') THEN
      RAISE EXCEPTION 'Un mechanic solo puede archivar daños abiertos (reported/in_repair). Estado actual: %.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_damage_mechanic_update ON public.damage_records;
CREATE TRIGGER trg_guard_damage_mechanic_update
  BEFORE UPDATE ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_mechanic_update();

CREATE OR REPLACE FUNCTION public.restore_forklift_on_damage_repaired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restore text;
  v_closed boolean;
BEGIN
  v_closed :=
    (NEW.status = 'repaired' AND OLD.status IS DISTINCT FROM 'repaired')
    OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL);

  IF v_closed
     AND NEW.forklift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.damage_records
        WHERE forklift_id = NEW.forklift_id
          AND deleted_at IS NULL
          AND id <> NEW.id
          AND status IN ('reported', 'in_repair')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.maintenance_logs
        WHERE forklift_id = NEW.forklift_id
          AND work_status IN ('pending', 'in_progress')
     ) THEN
    v_restore := public.damage_restore_forklift_status(NEW.forklift_id, NEW.previous_forklift_status);
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_restore, updated_at = now()
     WHERE id = NEW.forklift_id
       AND status = 'maintenance'
       AND status IS DISTINCT FROM v_restore;
    IF FOUND THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, 'maintenance', v_restore,
              'Daño ' || NEW.id::text ||
              CASE WHEN NEW.status = 'repaired' THEN ' reparado' ELSE ' archivado' END ||
              ': restauracion de estado');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_damage_repaired_restore ON public.damage_records;
CREATE TRIGGER trg_damage_repaired_restore
  BEFORE UPDATE OF status, deleted_at ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.restore_forklift_on_damage_repaired();

-- ============================================================
-- R6-DB-02: alinear RLS a la matriz role_permissions.
-- ============================================================

DROP POLICY IF EXISTS "Administrativo full access forklifts" ON public.forklifts;
DROP POLICY IF EXISTS "Administrativo read forklifts" ON public.forklifts;
CREATE POLICY "Administrativo read forklifts"
  ON public.forklifts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrativo'::public.app_role));

DROP POLICY IF EXISTS "Dispatchers update forklifts" ON public.forklifts;
DROP POLICY IF EXISTS "Dispatchers full access damage_records" ON public.damage_records;

-- ============================================================
-- R6-DB-03: máquina de estados en invoices.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
  v_initial text[];
  v_due date;
  v_jwt_role text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_initial := CASE TG_TABLE_NAME
      WHEN 'invoices'       THEN ARRAY['draft','sent']
      WHEN 'quotes'         THEN ARRAY['draft','sent']
      WHEN 'bookings'       THEN ARRAY['confirmed']
      WHEN 'supplier_bills' THEN ARRAY['draft','pending']
      WHEN 'forklifts'      THEN ARRAY['available']
      ELSE ARRAY[]::text[]
    END;

    IF TG_TABLE_NAME = 'supplier_bills' AND NEW.status::text = 'overdue' THEN
      v_due := NULLIF(to_jsonb(NEW) ->> 'due_date', '')::date;
      IF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NOT (NEW.status::text = ANY(v_initial)) THEN
      RAISE EXCEPTION 'Estado inicial no permitido en %: %. Usa el flujo/RPC correspondiente.',
        TG_TABLE_NAME, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','overdue','cancelled']
      WHEN 'sent'     THEN ARRAY['overdue','paid','cancelled']
      WHEN 'overdue'  THEN ARRAY['paid','cancelled']
      WHEN 'partial'  THEN ARRAY['overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','rejected','expired']
      WHEN 'sent'     THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'  THEN ARRAY['draft']
      WHEN 'accepted' THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'bookings' THEN CASE OLD.status::text
      WHEN 'confirmed' THEN ARRAY['completed','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'supplier_bills' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['pending','cancelled']
      WHEN 'pending'  THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['pending','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['pending','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['pending','partial','overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'forklifts' THEN CASE OLD.status::text
      WHEN 'available'      THEN ARRAY['rented','maintenance','out_of_service','retired','sold']
      WHEN 'rented'         THEN ARRAY['available','maintenance','out_of_service','retired','sold']
      WHEN 'maintenance'    THEN ARRAY['available','rented','out_of_service','retired','sold']
      WHEN 'out_of_service' THEN ARRAY['available','maintenance','retired','sold']
      WHEN 'retired'        THEN ARRAY['available']
      ELSE ARRAY[]::text[] END
    ELSE ARRAY[]::text[]
  END;

  IF TG_TABLE_NAME = 'invoices'
     AND current_setting('app.payment_sync', true) = 'on'
     AND pg_trigger_depth() > 1
     AND OLD.status::text IN ('sent','partial','overdue','paid')
     AND NEW.status::text IN ('sent','partial','overdue','paid') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND OLD.status::text = 'paid'
     AND NEW.status::text = 'cancelled' THEN
    BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
    IF v_jwt_role = 'service_role'
       OR current_setting('app.sat_flow', true) IS NOT DISTINCT FROM 'on' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_invoice_status_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    IF NOT (
      current_setting('app.payment_sync', true) IS NOT DISTINCT FROM 'on'
      AND pg_trigger_depth() > 1
    ) AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Una factura solo puede marcarse como pagada cuando tiene al menos un pago registrado. Registra el pago y deja que el flujo de pagos actualice el estado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF current_setting('app.sat_flow', true) IS DISTINCT FROM 'on' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
      IF NEW.cancellation_reason IS NULL OR btrim(NEW.cancellation_reason) = '' THEN
        RAISE EXCEPTION 'Cancelar una factura requiere un motivo (cancellation_reason). Las facturas timbradas se cancelan por el flujo SAT.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_status_integrity ON public.invoices;
CREATE TRIGGER trg_guard_invoice_status_integrity
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_status_integrity();

-- ============================================================
-- R6-DB-04: resincronizar secuencias de folios (incluye entregas).
-- ============================================================
DO $$
DECLARE
  v_quote_max bigint;
  v_booking_max bigint;
  v_bill_max bigint;
  v_delivery_max bigint;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(quote_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_quote_max
  FROM public.quotes
  WHERE coalesce(is_e2e, false) = false AND quote_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(booking_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_booking_max
  FROM public.bookings
  WHERE coalesce(is_e2e, false) = false AND booking_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(bill_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_bill_max
  FROM public.supplier_bills;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(delivery_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_delivery_max
  FROM public.deliveries
  WHERE delivery_number NOT LIKE 'E2E-%';

  PERFORM setval('public.quote_number_seq',
    GREATEST(v_quote_max, (SELECT last_value FROM public.quote_number_seq), 1), true);
  PERFORM setval('public.booking_number_seq',
    GREATEST(v_booking_max, (SELECT last_value FROM public.booking_number_seq), 1), true);
  PERFORM setval('public.supplier_bill_number_seq',
    GREATEST(v_bill_max, (SELECT last_value FROM public.supplier_bill_number_seq), 1), true);
  PERFORM setval('public.delivery_number_seq',
    GREATEST(v_delivery_max, (SELECT last_value FROM public.delivery_number_seq), 1), true);
END $$;

-- ============================================================
-- R6-DB-05: RPC de diagnóstico de consistencia de flota (solo lectura).
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_fleet_status_consistency()
RETURNS TABLE(
  forklift_id uuid,
  forklift_name text,
  status_actual text,
  status_esperado text,
  motivo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH calc AS (
    SELECT
      f.id,
      f.name,
      f.status,
      EXISTS (
        SELECT 1 FROM public.maintenance_logs ml
         WHERE ml.forklift_id = f.id
           AND ml.work_status IN ('pending', 'in_progress')
      ) AS has_open_ot,
      EXISTS (
        SELECT 1 FROM public.damage_records dr
         WHERE dr.forklift_id = f.id
           AND dr.deleted_at IS NULL
           AND dr.status IN ('reported', 'in_repair')
      ) AS has_open_damage,
      EXISTS (
        SELECT 1 FROM public.bookings b
         WHERE b.forklift_id = f.id
           AND b.status = 'confirmed'
           AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
      ) AS has_active_booking
    FROM public.forklifts f
    WHERE f.deleted_at IS NULL
  ),
  evaluada AS (
    SELECT
      c.*,
      CASE
        WHEN c.has_open_ot OR c.has_open_damage THEN 'maintenance'
        WHEN c.has_active_booking THEN 'rented'
        ELSE 'available'
      END AS esperado,
      concat_ws('; ',
        CASE WHEN c.has_open_ot THEN 'tiene OT abierta (pending/in_progress)' END,
        CASE WHEN c.has_open_damage THEN 'tiene daño abierto (reported/in_repair)' END,
        CASE WHEN c.has_active_booking THEN 'tiene reserva confirmada activa hoy' END,
        CASE WHEN NOT c.has_open_ot AND NOT c.has_open_damage AND NOT c.has_active_booking
             THEN 'sin OT, daño ni reserva activa' END
      ) AS motivo
    FROM calc c
  )
  SELECT
    e.id,
    e.name,
    e.status,
    e.esperado,
    e.motivo
  FROM evaluada e
  WHERE e.status IN ('available', 'rented', 'maintenance')
    AND e.status IS DISTINCT FROM e.esperado
  ORDER BY e.name;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_fleet_status_consistency() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_fleet_status_consistency() TO authenticated;