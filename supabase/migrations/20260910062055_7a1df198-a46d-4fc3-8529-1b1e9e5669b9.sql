-- BLOQUE 2 · A) complete_return_inspection: validación de enums (parche forward
-- sobre la definición vigente, idempotente).
DO $do$
DECLARE
  d text;
  v_val text := $v$  IF COALESCE(p_condition, 'good') NOT IN ('good', 'minor_damage', 'major_damage', 'needs_repair') THEN
    RAISE EXCEPTION 'Condición de devolución no válida (%). Valores permitidos: good, minor_damage, major_damage, needs_repair.', p_condition
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_fuel_level IS NOT NULL AND btrim(p_fuel_level) <> ''
     AND btrim(p_fuel_level) NOT IN ('Full', '3/4', '1/2', '1/4', 'Empty') THEN
    RAISE EXCEPTION 'Nivel de combustible no válido (%). Valores permitidos: Full, 3/4, 1/2, 1/4, Empty.', p_fuel_level
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN$v$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'complete_return_inspection';
  IF d IS NULL THEN
    RAISE EXCEPTION 'complete_return_inspection no existe';
  END IF;
  IF position('Condición de devolución no válida' in d) = 0 THEN
    IF position('  IF COALESCE(p_damage_cost, 0) < 0 THEN' in d) = 0 THEN
      RAISE EXCEPTION 'No se encontró el ancla esperada en complete_return_inspection';
    END IF;
    d := replace(d, '  IF COALESCE(p_damage_cost, 0) < 0 THEN', v_val);
    d := replace(
      d,
      'v_is_damaged_condition := p_condition IN (''damaged'', ''minor_damage'', ''major_damage'', ''needs_repair'');',
      'v_is_damaged_condition := p_condition IN (''minor_damage'', ''major_damage'', ''needs_repair'');'
    );
    EXECUTE d;
  END IF;
END
$do$;

-- Enums a nivel de tabla (los datos históricos ya cumplen).
ALTER TABLE public.return_inspections
  DROP CONSTRAINT IF EXISTS return_inspections_condition_check;
ALTER TABLE public.return_inspections
  ADD CONSTRAINT return_inspections_condition_check
  CHECK (condition IS NULL OR condition IN ('good','minor_damage','major_damage','needs_repair'));

ALTER TABLE public.return_inspections
  DROP CONSTRAINT IF EXISTS return_inspections_fuel_level_check;
ALTER TABLE public.return_inspections
  ADD CONSTRAINT return_inspections_fuel_level_check
  CHECK (fuel_level IS NULL OR fuel_level IN ('Full','3/4','1/2','1/4','Empty'));

-- Sin UPDATE/DELETE/INSERT directo por API: la inspección es inmutable y sólo
-- la RPC auditable `correct_return_inspection` puede corregirla.
DROP POLICY IF EXISTS "Admins full access return_inspections" ON public.return_inspections;
DROP POLICY IF EXISTS "Administrativo full access return_inspections" ON public.return_inspections;
DROP POLICY IF EXISTS "Dispatchers full access return_inspections" ON public.return_inspections;

DROP POLICY IF EXISTS "Staff read return_inspections" ON public.return_inspections;
CREATE POLICY "Staff read return_inspections"
  ON public.return_inspections FOR SELECT TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
  );

REVOKE INSERT, UPDATE, DELETE ON public.return_inspections FROM authenticated;
GRANT SELECT ON public.return_inspections TO authenticated;
GRANT ALL ON public.return_inspections TO service_role;

CREATE OR REPLACE FUNCTION public.correct_return_inspection(
  p_inspection_id uuid,
  p_reason text,
  p_condition text DEFAULT NULL,
  p_damage_notes text DEFAULT NULL,
  p_damage_cost numeric DEFAULT NULL,
  p_hours_used numeric DEFAULT NULL,
  p_fuel_level text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ins public.return_inspections%ROWTYPE;
  v_condition text;
  v_fuel text;
  v_cost numeric;
  v_notes text;
  v_hours numeric;
  v_customer_id uuid;
  v_forklift_status text;
  v_new_status text;
  v_damaged boolean;
  v_to_maintenance boolean;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede corregir una inspección de devolución.'
      USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'La corrección requiere un motivo.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_ins FROM public.return_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF v_ins.id IS NULL THEN
    RAISE EXCEPTION 'Inspección no encontrada' USING ERRCODE = 'P0001';
  END IF;

  v_condition := COALESCE(p_condition, v_ins.condition);
  v_fuel      := COALESCE(NULLIF(btrim(COALESCE(p_fuel_level, '')), ''), v_ins.fuel_level);
  v_cost      := COALESCE(p_damage_cost, v_ins.damage_cost);
  v_notes     := COALESCE(NULLIF(btrim(COALESCE(p_damage_notes, '')), ''), v_ins.damage_notes);
  v_hours     := COALESCE(p_hours_used, v_ins.hours_used);

  IF v_condition NOT IN ('good','minor_damage','major_damage','needs_repair') THEN
    RAISE EXCEPTION 'Condición de devolución no válida (%).', v_condition
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_fuel IS NOT NULL AND v_fuel NOT IN ('Full','3/4','1/2','1/4','Empty') THEN
    RAISE EXCEPTION 'Nivel de combustible no válido (%).', v_fuel
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(v_cost, 0) < 0 OR COALESCE(v_hours, 0) < 0 THEN
    RAISE EXCEPTION 'Costos y horas no pueden ser negativos.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.return_inspections
     SET condition = v_condition,
         damage_notes = CASE WHEN v_condition = 'good' THEN v_notes
                             ELSE COALESCE(v_notes, 'Daño reportado en devolución') END,
         damage_cost = v_cost,
         hours_used = v_hours,
         fuel_level = v_fuel
   WHERE id = p_inspection_id;

  v_damaged := v_condition IN ('minor_damage','major_damage','needs_repair');
  SELECT customer_id INTO v_customer_id FROM public.bookings WHERE id = v_ins.booking_id;
  SELECT status INTO v_forklift_status FROM public.forklifts WHERE id = v_ins.forklift_id FOR UPDATE;

  IF v_damaged THEN
    IF EXISTS (
      SELECT 1 FROM public.damage_records
       WHERE inspection_id = p_inspection_id AND deleted_at IS NULL
    ) THEN
      UPDATE public.damage_records
         SET description = COALESCE(v_notes, description),
             estimated_cost = COALESCE(v_cost, estimated_cost)
       WHERE inspection_id = p_inspection_id
         AND deleted_at IS NULL
         AND status IN ('reported','in_repair');
    ELSE
      INSERT INTO public.damage_records (
        inspection_id, forklift_id, booking_id, customer_id, description,
        estimated_cost, status, previous_forklift_status
      ) VALUES (
        p_inspection_id, v_ins.forklift_id, v_ins.booking_id, v_customer_id,
        COALESCE(v_notes, 'Daño reportado en devolución'),
        COALESCE(v_cost, 0), 'reported', v_forklift_status
      );
    END IF;
  ELSE
    UPDATE public.damage_records
       SET deleted_at = now()
     WHERE inspection_id = p_inspection_id
       AND deleted_at IS NULL
       AND status = 'reported'
       AND repaired_at IS NULL;
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
     SET return_status = 'returned', status = 'completed', updated_at = now()
   WHERE id = v_ins.booking_id
     AND (return_status IS DISTINCT FROM 'returned' OR status IS DISTINCT FROM 'completed');

  v_to_maintenance := v_damaged
    OR EXISTS (
      SELECT 1 FROM public.damage_records
       WHERE forklift_id = v_ins.forklift_id
         AND deleted_at IS NULL
         AND (status IN ('reported','in_repair') OR repaired_at IS NULL)
    )
    OR EXISTS (
      SELECT 1 FROM public.maintenance_logs ml
       WHERE ml.forklift_id = v_ins.forklift_id
         AND ml.deleted_at IS NULL
         AND ml.work_status IN ('pending','in_progress','waiting_parts')
    );

  IF v_forklift_status IN ('rented','available','maintenance') THEN
    v_new_status := CASE
      WHEN v_to_maintenance THEN 'maintenance'
      WHEN EXISTS (
        SELECT 1
          FROM public.bookings b
          JOIN public.deliveries d
            ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
         WHERE b.forklift_id = v_ins.forklift_id
           AND b.id <> v_ins.booking_id
           AND b.status = 'confirmed'
           AND NOT public.booking_is_returned(b.id)
      ) THEN 'rented'
      ELSE 'available'
    END;
    IF v_new_status IS DISTINCT FROM v_forklift_status THEN
      PERFORM set_config('app.forklift_rpc', 'on', true);
      UPDATE public.forklifts SET status = v_new_status, updated_at = now()
       WHERE id = v_ins.forklift_id;
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (v_ins.forklift_id, v_forklift_status, v_new_status,
              'Corrección de devolución: ' || btrim(p_reason));
    END IF;
  END IF;

  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN p_inspection_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_return_inspection(uuid, text, text, text, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_return_inspection(uuid, text, text, text, numeric, numeric, text) TO authenticated, service_role;

-- ============================================================
-- BLOQUE 2 · B) credit_notes: notas timbradas/canceladas inmutables
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_credit_note_stamping_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR (select auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.cfdi_status = 'stamping' AND (
    NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.motive IS DISTINCT FROM OLD.motive
    OR NEW.reason_text IS DISTINCT FROM OLD.reason_text
    OR NEW.line_items IS DISTINCT FROM OLD.line_items
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
  ) THEN
    RAISE EXCEPTION 'La nota de crédito está en proceso de timbrado y su contenido fiscal es inmutable.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.cfdi_status IN ('stamped','cancelled') OR OLD.status IN ('stamped','cancelled') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.cfdi_status IS DISTINCT FROM OLD.cfdi_status
       OR NEW.cancellation_status IS DISTINCT FROM OLD.cancellation_status
       OR NEW.cancellation_motive IS DISTINCT FROM OLD.cancellation_motive
       OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.substitution_uuid IS DISTINCT FROM OLD.substitution_uuid
       OR NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number
       OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.motive IS DISTINCT FROM OLD.motive
       OR NEW.reason_text IS DISTINCT FROM OLD.reason_text
       OR NEW.line_items IS DISTINCT FROM OLD.line_items
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
       OR NEW.cfdi_uuid IS DISTINCT FROM OLD.cfdi_uuid
       OR NEW.cfdi_xml_url IS DISTINCT FROM OLD.cfdi_xml_url
       OR NEW.cfdi_pdf_url IS DISTINCT FROM OLD.cfdi_pdf_url
       OR NEW.facturapi_invoice_id IS DISTINCT FROM OLD.facturapi_invoice_id
    THEN
      RAISE EXCEPTION 'La nota de crédito % ya fue timbrada o cancelada: usa el flujo de cancelación fiscal, no la edición directa.', OLD.credit_note_number
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_credit_note_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR (select auth.uid()) IS NULL THEN
    RETURN OLD;
  END IF;
  IF OLD.cfdi_status IN ('stamped','stamping','cancelled') OR OLD.status IN ('stamped','cancelled') THEN
    RAISE EXCEPTION 'No se puede eliminar la nota de crédito % (timbrada o cancelada). Usa el flujo de cancelación fiscal.', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_credit_note_delete ON public.credit_notes;
CREATE TRIGGER trg_guard_credit_note_delete
  BEFORE DELETE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_credit_note_delete();

REVOKE ALL ON FUNCTION public.guard_credit_note_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_credit_note_stamping_snapshot() FROM PUBLIC;

-- ============================================================
-- BLOQUE 2 · C) contracts: congelar identidad y exigir firma
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_signed_contract_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_allowed text[];
  v_jwt_role text;
  v_is_service boolean;
  v_editable text[] := ARRAY[
    'status','updated_at','notes','signed_snapshot',
    'deposit_status','deposit_settled_at','deposit_settled_amount','deposit_notes'
  ];
  v_changed text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  v_is_service := (v_jwt_role = 'service_role') OR (select auth.uid()) IS NULL;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := CASE OLD.status
      WHEN 'draft' THEN ARRAY['sent', 'signed', 'active', 'completed', 'cancelled']
      WHEN 'sent' THEN ARRAY['draft', 'signed', 'active', 'completed', 'cancelled']
      WHEN 'signed' THEN ARRAY['completed', 'cancelled']
      WHEN 'active' THEN ARRAY['completed', 'cancelled']
      ELSE ARRAY[]::text[]
    END;

    IF NOT (NEW.status = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'Transición de contrato no permitida: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'contracts_status_transition';
    END IF;

    IF OLD.status IN ('signed', 'active') AND NOT v_is_service
       AND NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Solo un administrador puede finalizar o cancelar un contrato firmado o activo.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IN ('signed','active') AND NOT v_is_service THEN
      IF NEW.signed_at IS NULL OR NEW.signed_by IS NULL OR btrim(NEW.signed_by) = '' THEN
        RAISE EXCEPTION 'Para marcar el contrato como % se requieren la fecha de firma (signed_at) y quién firmó (signed_by).', NEW.status
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.signed_at > now() THEN
        RAISE EXCEPTION 'La fecha de firma no puede ser futura.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF OLD.status IN ('signed', 'active', 'cancelled', 'completed') AND NOT v_is_service THEN
    SELECT string_agg(n.key, ', ' ORDER BY n.key) INTO v_changed
      FROM jsonb_each(to_jsonb(NEW)) n
      JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
     WHERE n.value IS DISTINCT FROM o.value
       AND NOT (n.key = ANY(v_editable));
    IF v_changed IS NOT NULL THEN
      RAISE EXCEPTION 'No se pueden editar los campos de un contrato firmado, activo, completado o cancelado (campos: %).', v_changed
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;