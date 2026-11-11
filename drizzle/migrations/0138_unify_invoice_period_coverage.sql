-- A pending fiscal cancellation continues occupying the billing period.
CREATE FUNCTION public.invoice_booking_period_is_occupied(
  p_status text, p_cfdi_status text, p_cfdi_uuid text, p_cancellation_status text
)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN p_cfdi_status = 'stamping' THEN true
    WHEN p_cfdi_status = 'stamped' OR p_cfdi_uuid IS NOT NULL
      THEN p_cancellation_status IS DISTINCT FROM 'accepted'
    ELSE p_status IS DISTINCT FROM 'cancelled' AND p_cfdi_status IS DISTINCT FROM 'cancelled'
  END;
$function$;
REVOKE ALL ON FUNCTION public.invoice_booking_period_is_occupied(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_booking_period_is_occupied(text,text,text,text) TO authenticated, service_role;

-- Computed field for the recurring planner's direct and embedded PostgREST reads.
CREATE FUNCTION public.invoice_occupies_booking_period(public.invoices)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public
AS $function$
  SELECT public.invoice_booking_period_is_occupied(
    $1.status::text, $1.cfdi_status::text, $1.cfdi_uuid::text, $1.cancellation_status::text
  );
$function$;
REVOKE ALL ON FUNCTION public.invoice_occupies_booking_period(public.invoices) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_occupies_booking_period(public.invoices) TO authenticated, service_role;

CREATE FUNCTION public.get_invoice_booking_billing_evidence_v2(
  p_expected_organization_id uuid,
  p_booking_ids uuid[],
  p_include_e2e boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_org uuid := public.current_internal_organization_id();
  v_uid uuid := (SELECT auth.uid());
  v_role text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR p_expected_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa del historial.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid
    ORDER BY array_position(ARRAY['admin','administrativo','auditor','ventas','dispatcher','mechanic','customer']::text[], ur.role::text) LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'administrativo', 'auditor') OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp WHERE rp.role::text = v_role
      AND rp.module = 'Facturas' AND rp.access_level IN ('read', 'full')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el historial de facturación.' USING ERRCODE = '42501';
  END IF;
  -- Preserve historical invoices with any number of linked bookings in one snapshot.
  IF p_booking_ids IS NULL OR array_position(p_booking_ids, NULL) IS NOT NULL OR p_include_e2e IS NULL THEN
    RAISE EXCEPTION 'Reservas de historial inválidas.' USING ERRCODE = '22023';
  END IF;
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT b.id FROM public.bookings b WHERE b.organization_id = v_org AND b.id = ANY(p_booking_ids)
      AND (p_include_e2e OR b.is_e2e IS NOT TRUE)
  ), relevant_ids AS (
    SELECT i.id FROM requested r JOIN public.invoices i ON i.booking_id = r.id WHERE i.organization_id = v_org
    UNION
    SELECT ib.invoice_id FROM requested r JOIN public.invoice_bookings ib ON ib.booking_id = r.id
  ), relevant_invoices AS MATERIALIZED (
    SELECT i.id, i.booking_id, i.status, i.line_items, i.moneda, i.billing_period_start, i.billing_period_end, true AS occupies_booking_period
    FROM relevant_ids r JOIN public.invoices i ON i.id = r.id
    WHERE i.organization_id = v_org AND public.invoice_occupies_booking_period(i)
  ), claims AS (
    SELECT i.id AS invoice_id, i.booking_id
    FROM relevant_invoices i JOIN public.bookings b ON b.id = i.booking_id AND b.organization_id = v_org
    UNION ALL
    SELECT i.id, ib.booking_id
    FROM relevant_invoices i JOIN public.invoice_bookings ib ON ib.invoice_id = i.id
      JOIN public.bookings b ON b.id = ib.booking_id AND b.organization_id = v_org
  )
  SELECT jsonb_build_object(
    'bookingIds', coalesce((SELECT jsonb_agg(r.id ORDER BY r.id) FROM requested r), '[]'::jsonb),
    'invoices', coalesce((SELECT jsonb_agg(to_jsonb(i) - 'booking_id' ORDER BY i.id) FROM relevant_invoices i), '[]'::jsonb),
    'claims', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.invoice_id, c.booking_id) FROM claims c), '[]'::jsonb),
    'extensions', coalesce((SELECT jsonb_agg(jsonb_build_object('booking_id', e.booking_id,
      'original_end_date', e.original_end_date, 'new_end_date', e.new_end_date, 'invoice_id', e.invoice_id, 'pending_invoice_id', e.pending_invoice_id)
      ORDER BY e.booking_id, e.original_end_date, e.id) FROM public.booking_extensions e
      WHERE e.organization_id = v_org AND e.booking_id IN (SELECT r.id FROM requested r)), '[]'::jsonb),
    'returns', coalesce((SELECT jsonb_agg(jsonb_build_object('booking_id', r.booking_id, 'forklift_id', r.forklift_id, 'inspected_at', r.inspected_at)
      ORDER BY r.booking_id, r.inspected_at, r.id) FROM public.return_inspections r
      WHERE r.organization_id = v_org AND r.booking_id IN (SELECT q.id FROM requested q)), '[]'::jsonb)
  ) INTO v_result;
  IF (SELECT count(DISTINCT id) FROM unnest(p_booking_ids) AS ids(id)) <> jsonb_array_length(v_result->'bookingIds') THEN
    RAISE EXCEPTION 'No se pudo verificar el historial completo de las reservas.' USING ERRCODE = '42501';
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_invoice_booking_billing_evidence_v2(uuid,uuid[],boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_booking_billing_evidence_v2(uuid,uuid[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_confirmed_recurring_invoice_coverage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_ids uuid[];
  v_booking record;
  v_id uuid;
  v_key bigint;
  v_conflict text;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    -- Notes/payment-state edits do not create new coverage. A cancelled CFDI
    -- reactivation does, even when only fiscal/cancellation state changes.
    IF TG_OP = 'UPDATE'
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id
       AND NEW.billing_period_start IS NOT DISTINCT FROM OLD.billing_period_start
       AND NEW.billing_period_end IS NOT DISTINCT FROM OLD.billing_period_end
       AND public.invoice_booking_period_is_occupied(NEW.status::text, NEW.cfdi_status::text, NEW.cfdi_uuid::text, NEW.cancellation_status::text) = public.invoice_booking_period_is_occupied(OLD.status::text, OLD.cfdi_status::text, OLD.cfdi_uuid::text, OLD.cancellation_status::text) THEN
      RETURN NEW;
    END IF;
    v_invoice := NEW;
    SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
    FROM (
      SELECT NEW.booking_id AS id WHERE NEW.booking_id IS NOT NULL
      UNION SELECT ib.booking_id FROM public.invoice_bookings ib WHERE ib.invoice_id = NEW.id
    ) links;
  ELSE
    IF TG_OP = 'UPDATE'
       AND NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id
       AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
      RETURN NEW;
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id;
    IF NOT FOUND OR (NEW.organization_id IS NOT NULL
      AND NEW.organization_id IS DISTINCT FROM v_invoice.organization_id) THEN
      RAISE EXCEPTION 'La asociación no pertenece a una factura accesible de la empresa.' USING ERRCODE = '23514';
    END IF;
    v_ids := ARRAY[NEW.booking_id];
  END IF;

  IF NOT public.invoice_booking_period_is_occupied(v_invoice.status::text, v_invoice.cfdi_status::text, v_invoice.cfdi_uuid::text, v_invoice.cancellation_status::text)
     OR COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = ANY(v_ids)
      AND b.organization_id = v_invoice.organization_id
      AND b.recurring_billing IS TRUE AND b.status = 'confirmed'
  ) THEN
    RETURN NEW;
  END IF;

  -- We already own invoice/pivot tuples. Never wait on an advisory holder
  -- which could itself be waiting for those tuples. Fail with retryable 55P03.
  FOREACH v_id IN ARRAY v_ids LOOP
    v_key := ('x' || substr(md5(v_id::text), 1, 15))::bit(60)::bigint;
    IF NOT pg_try_advisory_xact_lock(v_key) THEN
      RAISE EXCEPTION 'La reserva está siendo facturada. Reintenta guardar en unos segundos.' USING ERRCODE = '55P03';
    END IF;
  END LOOP;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Reintenta la cobertura recurrente con aislamiento READ COMMITTED.' USING ERRCODE = '40001';
  END IF;

  FOR v_booking IN
    SELECT b.id, b.booking_number, b.start_date, b.end_date
    FROM public.bookings b
    WHERE b.id = ANY(v_ids) AND b.organization_id = v_invoice.organization_id
      AND b.recurring_billing IS TRUE AND b.status = 'confirmed'
    ORDER BY b.id
  LOOP
    IF v_invoice.billing_period_start IS NULL OR v_invoice.billing_period_end IS NULL
       OR NOT isfinite(v_invoice.billing_period_start) OR NOT isfinite(v_invoice.billing_period_end)
       OR v_invoice.billing_period_start > v_invoice.billing_period_end
       OR v_booking.start_date IS NULL
       OR v_invoice.billing_period_start < v_booking.start_date
       OR (v_booking.end_date IS NOT NULL AND v_invoice.billing_period_end > v_booking.end_date) THEN
      RAISE EXCEPTION 'La reserva % requiere un período válido dentro de sus fechas.', v_booking.booking_number USING ERRCODE = '23514';
    END IF;

    SELECT i.invoice_number INTO v_conflict
    FROM public.invoices i
    WHERE i.id <> v_invoice.id AND i.organization_id = v_invoice.organization_id
      AND public.invoice_booking_period_is_occupied(i.status::text, i.cfdi_status::text, i.cfdi_uuid::text, i.cancellation_status::text)
      AND (i.booking_id = v_booking.id OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = i.id AND ib.booking_id = v_booking.id
          AND COALESCE(ib.organization_id, v_invoice.organization_id) = v_invoice.organization_id
      ))
      AND (i.billing_period_start IS NULL OR i.billing_period_end IS NULL
        OR NOT isfinite(i.billing_period_start) OR NOT isfinite(i.billing_period_end)
        OR i.billing_period_start > i.billing_period_end
        OR (i.billing_period_start <= v_invoice.billing_period_end
          AND i.billing_period_end >= v_invoice.billing_period_start))
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'La reserva % ya tiene cobertura en la factura %; el período se superpone o requiere revisión.', v_booking.booking_number, v_conflict USING ERRCODE = '23505';
    END IF;
    IF v_invoice.billing_period_start > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Monterrey')::date
       AND v_booking.start_date < v_invoice.billing_period_start
       AND NOT COALESCE((
         SELECT range_agg(daterange(i.billing_period_start, i.billing_period_end, '[]'))
           @> daterange(v_booking.start_date, v_invoice.billing_period_start, '[)')
         FROM public.invoices i
         WHERE i.id <> v_invoice.id AND i.organization_id = v_invoice.organization_id
           AND public.invoice_booking_period_is_occupied(i.status::text, i.cfdi_status::text, i.cfdi_uuid::text, i.cancellation_status::text)
           AND i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL
           AND isfinite(i.billing_period_start) AND isfinite(i.billing_period_end)
           AND i.billing_period_start <= i.billing_period_end
           AND (i.booking_id = v_booking.id OR EXISTS (
             SELECT 1 FROM public.invoice_bookings ib
             WHERE ib.invoice_id = i.id AND ib.booking_id = v_booking.id
               AND COALESCE(ib.organization_id, v_invoice.organization_id) = v_invoice.organization_id
           ))
       ), false) THEN
      RAISE EXCEPTION 'Antes de facturar un período futuro, factura todos los períodos anteriores pendientes de la reserva.' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_flow_recurring_bookings()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT jsonb_build_object(
    'id', b.id,
    'booking_number', b.booking_number,
    'customer_name', b.customer_name,
    'start_date', b.start_date,
    'end_date', b.end_date,
    'last_billed_date', CASE
      WHEN history.active_links = 0 THEN NULL
      WHEN history.max_period_end IS NOT NULL THEN history.max_period_end
      ELSE b.last_billed_date
    END,
    'billing_coverage', COALESCE(history.coverage, '[]'::jsonb),
    'monthly_rate', COALESCE(b.monthly_rate, f.monthly_rate),
    'currency', b.currency,
    'tipo_cambio', b.tipo_cambio,
    'customer_tax_rate', c.tax_rate
  )
  FROM public.bookings b
  LEFT JOIN public.forklifts f ON f.id = b.forklift_id
  LEFT JOIN public.customers c ON c.id = b.customer_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS active_links,
      max(i.billing_period_end) FILTER (
        WHERE i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL
          AND isfinite(i.billing_period_start) AND isfinite(i.billing_period_end)
          AND i.billing_period_start <= i.billing_period_end
      ) AS max_period_end,
      jsonb_agg(jsonb_build_object(
        'periodStart', i.billing_period_start,
        'periodEnd', i.billing_period_end
      ) ORDER BY i.billing_period_start, i.billing_period_end, i.id) AS coverage
    FROM public.invoices i
    WHERE i.organization_id = b.organization_id
      AND public.invoice_booking_period_is_occupied(i.status::text, i.cfdi_status::text, i.cfdi_uuid::text, i.cancellation_status::text)
      AND (i.booking_id = b.id OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = i.id AND ib.booking_id = b.id
          AND COALESCE(ib.organization_id, b.organization_id) = b.organization_id
      ))
  ) history ON true
  WHERE b.recurring_billing = true AND b.status = 'confirmed';
$function$;

CREATE OR REPLACE FUNCTION public.lock_confirmed_recurring_coverage_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE v_ids uuid[]; v_id uuid; v_key bigint;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.organization_id, NEW.booking_id, NEW.billing_period_start, NEW.billing_period_end,
             public.invoice_booking_period_is_occupied(NEW.status::text, NEW.cfdi_status::text, NEW.cfdi_uuid::text, NEW.cancellation_status::text))
        IS NOT DISTINCT FROM
         ROW(OLD.organization_id, OLD.booking_id, OLD.billing_period_start, OLD.billing_period_end,
             public.invoice_booking_period_is_occupied(OLD.status::text, OLD.cfdi_status::text, OLD.cfdi_uuid::text, OLD.cancellation_status::text)) THEN
        RETURN NEW;
      END IF;
      v_ids := ARRAY[OLD.booking_id, NEW.booking_id];
    ELSE
      v_ids := ARRAY[OLD.booking_id];
    END IF;
    SELECT v_ids || COALESCE(array_agg(ib.booking_id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.invoice_bookings ib WHERE ib.invoice_id = OLD.id;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.invoice_id, NEW.booking_id, NEW.organization_id)
         IS NOT DISTINCT FROM ROW(OLD.invoice_id, OLD.booking_id, OLD.organization_id) THEN
        RETURN NEW;
      END IF;
      v_ids := ARRAY[OLD.booking_id, NEW.booking_id];
    ELSE
      v_ids := ARRAY[OLD.booking_id];
    END IF;
  END IF;
  FOR v_id IN SELECT DISTINCT b.id FROM public.bookings b
    WHERE b.id = ANY(v_ids) AND b.recurring_billing IS TRUE AND b.status = 'confirmed'
    ORDER BY b.id
  LOOP
    v_key := ('x' || substr(md5(v_id::text), 1, 15))::bit(60)::bigint;
    IF NOT pg_try_advisory_xact_lock(v_key) THEN
      RAISE EXCEPTION 'La reserva está siendo facturada. Reintenta el cambio de cobertura.' USING ERRCODE = '55P03';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
