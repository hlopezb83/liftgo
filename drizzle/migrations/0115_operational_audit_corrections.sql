-- OP02: distinguish the actual historical occurrence from created_at (capture).
-- UPDATE completion remains server-now; the browser never supplies a timestamp.
CREATE OR REPLACE FUNCTION public.set_delivery_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trusted boolean := current_user IN ('postgres', 'service_role');
  v_actual timestamptz;
BEGIN
  IF current_setting('app.audit_revert', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'completed' THEN
    IF TG_OP = 'INSERT' THEN
      IF v_trusted THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
      ELSE
        -- A completed INSERT is the explicit "Ya se realizó" workflow.
        -- Midnight represents an actual date when its time was not captured.
        v_actual := (NEW.scheduled_date + COALESCE(NEW.scheduled_time::time, time '00:00'))
          AT TIME ZONE 'America/Monterrey';
        IF v_actual IS NULL OR v_actual > now() THEN
          RAISE EXCEPTION 'La fecha y hora reales del transporte no pueden estar vacías ni ser futuras.'
            USING ERRCODE = 'check_violation';
        END IF;
        NEW.completed_at := v_actual;
      END IF;
    ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := CASE WHEN v_trusted THEN COALESCE(NEW.completed_at, now()) ELSE now() END;
    ELSIF NOT v_trusted THEN
      NEW.completed_at := OLD.completed_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_delivery_completed_at() FROM PUBLIC, anon, authenticated;

-- OP05: immutable pricing basis for each inspection. No historical backfill or
-- automatic billing. Existing completed-return and correction RPCs share this
-- trigger, so no caller can leave the derived hours/charge behind.
CREATE TABLE public.return_inspection_usage_bases (
  inspection_id uuid PRIMARY KEY REFERENCES public.return_inspections(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  basis jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_inspection_usage_bases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.return_inspection_usage_bases FROM PUBLIC, anon, authenticated, service_role;
-- Match the owner-only convention: no reader role or additional app access.
DO $owner_policy$
DECLARE v_owner name;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class
    WHERE oid = 'public.return_inspection_usage_bases'::regclass;
  EXECUTE format('GRANT ALL ON public.return_inspection_usage_bases TO %I', v_owner);
  CREATE POLICY return_usage_basis_deny_application ON public.return_inspection_usage_bases
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
END;
$owner_policy$;
COMMENT ON TABLE public.return_inspection_usage_bases IS
  'Server-only immutable pricing basis. No client grants and an explicit deny-all policy: return-inspection readers must not gain access to contract rates.';

CREATE OR REPLACE FUNCTION public.return_usage_charge_basis(
  p_booking_id uuid, p_org uuid, p_inspected_at timestamptz, p_recorded_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_b public.bookings%ROWTYPE;
  v_c public.contracts%ROWTYPE;
  v_span_end date;
  v_full_months integer;
  v_anchor date;
  v_days_in_month integer;
  v_months numeric;
  v_allowed numeric;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id AND organization_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = 'P0002';
  END IF;
  -- A legacy record has no snapshot. Only recover a provably unchanged basis;
  -- otherwise an explicit audited pricing repair is needed, never today's rate.
  IF p_recorded_at IS NOT NULL AND (v_b.updated_at IS NULL OR v_b.updated_at > p_recorded_at) THEN
    RAISE EXCEPTION 'No se conserva la base histórica de horas y la reserva cambió después de la devolución; requiere revisión administrativa de la tarifa original.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_c FROM public.contracts
   WHERE booking_id = p_booking_id AND organization_id = p_org
     AND (p_recorded_at IS NULL OR created_at <= p_recorded_at)
     AND (p_recorded_at IS NOT NULL OR COALESCE(status, '') <> 'cancelled')
   ORDER BY created_at DESC, id DESC LIMIT 1;
  IF p_recorded_at IS NOT NULL AND v_c.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.booking_id = p_booking_id AND c.organization_id = p_org
      AND c.created_at = v_c.created_at AND c.id <> v_c.id
  ) THEN
    RAISE EXCEPTION 'La base histórica de horas tiene contratos simultáneos; requiere revisión administrativa de la tarifa original.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_recorded_at IS NOT NULL AND v_c.id IS NOT NULL
     AND (v_c.updated_at IS NULL OR v_c.updated_at > p_recorded_at OR v_c.status = 'cancelled') THEN
    RAISE EXCEPTION 'No se conserva la base histórica de horas y el contrato cambió después de la devolución; requiere revisión administrativa de la tarifa original.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(v_c.max_hours_per_month, 0) > 0 AND COALESCE(v_c.extra_hour_rate, 0) > 0 THEN
    v_span_end := COALESCE(v_b.end_date, (p_inspected_at AT TIME ZONE 'America/Monterrey')::date);
    v_full_months := EXTRACT(YEAR FROM age(v_span_end, v_b.start_date))::integer * 12
                   + EXTRACT(MONTH FROM age(v_span_end, v_b.start_date))::integer;
    v_anchor := (v_b.start_date + make_interval(months => v_full_months))::date;
    IF v_anchor > v_span_end THEN
      v_full_months := GREATEST(v_full_months - 1, 0);
      v_anchor := (v_b.start_date + make_interval(months => v_full_months))::date;
    END IF;
    v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', v_anchor) + interval '1 month - 1 day')::date)::integer;
    v_months := GREATEST(1, v_full_months + GREATEST(v_span_end - v_anchor + 1, 0)::numeric / v_days_in_month);
    v_allowed := v_c.max_hours_per_month * v_months;
  END IF;
  RETURN jsonb_build_object('version', 1, 'allowed_hours', v_allowed,
    'extra_hour_rate', v_c.extra_hour_rate, 'contract_id', v_c.id,
    'booking_start', v_b.start_date, 'booking_end', v_b.end_date,
    'source', CASE WHEN p_recorded_at IS NULL THEN 'completion' ELSE 'legacy_unchanged' END);
END;
$$;
REVOKE ALL ON FUNCTION public.return_usage_charge_basis(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_return_usage_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed numeric;
  v_rate numeric;
  v_basis jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_basis := public.return_usage_charge_basis(NEW.booking_id, NEW.organization_id, NEW.inspected_at);
    INSERT INTO public.return_inspection_usage_bases(inspection_id, organization_id, basis)
      VALUES(NEW.id, NEW.organization_id, v_basis);
  ELSE
    -- Recalculate even when the submitted usage is unchanged: a legacy row
    -- may already contain the stale derived figures this migration repairs.
    SELECT basis INTO v_basis FROM public.return_inspection_usage_bases
     WHERE inspection_id = OLD.id AND organization_id = OLD.organization_id;
    IF v_basis IS NULL THEN
      v_basis := public.return_usage_charge_basis(
        OLD.booking_id, OLD.organization_id, OLD.inspected_at, OLD.created_at);
      INSERT INTO public.return_inspection_usage_bases(inspection_id, organization_id, basis)
        VALUES(OLD.id, OLD.organization_id, v_basis);
    END IF;
  END IF;
  IF NEW.hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas.' USING ERRCODE = 'check_violation';
  END IF;
  v_allowed := (v_basis->>'allowed_hours')::numeric;
  v_rate := (v_basis->>'extra_hour_rate')::numeric;
  NEW.extra_hours := NULL;
  NEW.suggested_extra_hour_charge := NULL;
  IF NEW.hours_used > v_allowed AND v_rate > 0 THEN
    NEW.extra_hours := ROUND(NEW.hours_used - v_allowed, 2);
    NEW.suggested_extra_hour_charge := ROUND(NEW.extra_hours * v_rate, 2);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_return_usage_charge() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_recalculate_return_usage_charge ON public.return_inspections;
CREATE TRIGGER trg_recalculate_return_usage_charge
  BEFORE INSERT OR UPDATE OF hours_used, extra_hours, suggested_extra_hour_charge
  ON public.return_inspections FOR EACH ROW EXECUTE FUNCTION public.recalculate_return_usage_charge();

-- OP03: retain damage/repair history, and audit the detachment before removing
-- the mistaken inspection. Never detach billed damage or unfinished repairs.
CREATE OR REPLACE FUNCTION public.void_return_inspection(p_inspection_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.admin_correction_guard();
  v_ins public.return_inspections%ROWTYPE;
  v_b public.bookings%ROWTYPE;
  v_fl text;
  v_damage public.damage_records%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'La anulación requiere un motivo.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_ins FROM public.return_inspections
   WHERE id = p_inspection_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  -- Lock dependencies before evaluating them; preserve each existing FK target.
  FOR v_damage IN SELECT * FROM public.damage_records
    WHERE inspection_id = p_inspection_id ORDER BY id FOR UPDATE
  LOOP
    IF v_damage.organization_id IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'El daño ligado no pertenece a la organización de la devolución.' USING ERRCODE = '42501';
    END IF;
    IF v_damage.invoice_id IS NOT NULL OR v_damage.status = 'invoiced' THEN
      RAISE EXCEPTION 'La devolución tiene daños ligados a facturación; no se puede anular sin revisar esos documentos.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_damage.deleted_at IS NULL
       AND (v_damage.status IS DISTINCT FROM 'repaired' OR v_damage.repaired_at IS NULL) THEN
      RAISE EXCEPTION 'Completa la reparación o archiva el daño mediante el flujo autorizado antes de anular la devolución.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_damage.maintenance_log_id IS NOT NULL THEN
      PERFORM 1 FROM public.maintenance_logs ml
       WHERE ml.id = v_damage.maintenance_log_id AND ml.organization_id = v_org
         AND ml.work_status IN ('completed', 'cancelled') FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El daño tiene una orden de reparación pendiente o no verificable; ciérrala antes de anular la devolución.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;
  SELECT * INTO v_b FROM public.bookings
   WHERE id = v_ins.booking_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status = 'cancelled' THEN
    RAISE EXCEPTION 'La reserva está cancelada; no se puede reabrir.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, source, organization_id)
  VALUES ('return_inspections', p_inspection_id, 'ADMIN_VOID',
          to_jsonb(v_ins) || jsonb_build_object('usage_charge_basis', (SELECT basis FROM public.return_inspection_usage_bases WHERE inspection_id = p_inspection_id AND organization_id = v_org)),
          jsonb_build_object('reason', btrim(p_reason), 'booking_reopened', v_b.booking_number),
          (select auth.uid()), 'user', v_org);

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, source, organization_id)
  SELECT 'damage_records', dr.id, 'ADMIN_CORRECTION',
         jsonb_build_object('inspection_id', p_inspection_id, 'inspection_number', v_ins.inspection_number),
         jsonb_build_object('inspection_id', NULL, 'voided_inspection_id', p_inspection_id, 'reason', btrim(p_reason)),
         (select auth.uid()), 'user', v_org
    FROM public.damage_records dr WHERE dr.inspection_id = p_inspection_id AND dr.organization_id = v_org;
  UPDATE public.damage_records SET inspection_id = NULL, updated_at = now()
   WHERE inspection_id = p_inspection_id AND organization_id = v_org;
  DELETE FROM public.return_inspections WHERE id = p_inspection_id AND organization_id = v_org;

  PERFORM set_config('app.audit_revert', 'on', true);
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'confirmed', return_status = NULL, updated_at = now()
   WHERE id = v_b.id;
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.audit_revert', 'off', true);

  SELECT status INTO v_fl FROM public.forklifts
   WHERE id = v_ins.forklift_id AND organization_id = v_org FOR UPDATE;
  IF v_fl = 'available' AND EXISTS (
    SELECT 1 FROM public.deliveries d
     WHERE d.booking_id = v_b.id AND d.type = 'delivery' AND d.status = 'completed'
  ) THEN
    PERFORM set_config('app.forklift_rpc', 'on', true);
    PERFORM set_config('app.delivery_completed_effect', 'on', true);
    UPDATE public.forklifts SET status = 'rented', updated_at = now() WHERE id = v_ins.forklift_id;
    PERFORM set_config('app.delivery_completed_effect', 'off', true);
    PERFORM set_config('app.forklift_rpc', 'off', true);
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id)
    VALUES (v_ins.forklift_id, 'available', 'rented',
            'Devolución anulada ' || COALESCE(v_ins.inspection_number, '') || ': ' || btrim(p_reason),
            (select auth.uid()), v_org);
  END IF;
  RETURN v_b.id;
END;
$$;

-- Preserve the existing admin-only RPC guard and authenticated entrypoint ACL.
REVOKE ALL ON FUNCTION public.void_return_inspection(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_return_inspection(uuid, text) TO authenticated;
