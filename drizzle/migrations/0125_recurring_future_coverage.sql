-- Candidate: recurrent future periods must not overlap existing live coverage.
-- DDL only. No backfill, production application, grants or provider actions.
-- Existing locks, eligibility checks, active-document semantics and ACLs remain.
-- last_billed_date is a maximum historical end, NOT evidence of gap-free billing.
CREATE OR REPLACE FUNCTION public.create_recurring_invoice(p_booking_ids uuid[], p_customer_id uuid, p_customer_name text, p_line_items jsonb, p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric, p_total numeric, p_billing_period_start date, p_billing_period_end date, p_receptor_rfc text, p_receptor_razon_social text, p_receptor_regimen_fiscal text, p_receptor_domicilio_fiscal_cp text, p_uso_cfdi text, p_moneda text DEFAULT 'MXN'::text, p_tipo_cambio numeric DEFAULT 1)
 RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_is_service boolean := COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
  v_org uuid;
  v_orgs uuid[];
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_id uuid;
  v_existing_number text;
  v_lock_key bigint;
  v_bid uuid;
  v_is_single boolean := array_length(p_booking_ids, 1) = 1;
  v_moneda text := COALESCE(NULLIF(upper(btrim(p_moneda)), ''), 'MXN');
  v_tipo_cambio numeric;
  v_uso_cfdi text := NULLIF(btrim(p_uso_cfdi), '');
  v_bad text;
  v_missing integer;
BEGIN
  IF NOT v_is_service
     AND NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_booking_ids requerido';
  END IF;

  IF NOT v_is_service THEN
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_billing_period_start IS NULL OR p_billing_period_end IS NULL THEN
    RAISE EXCEPTION 'El periodo de facturación (inicio y fin) es obligatorio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT isfinite(p_billing_period_start) OR NOT isfinite(p_billing_period_end)
     OR p_billing_period_start > p_billing_period_end THEN
    RAISE EXCEPTION 'El fin del periodo (%) no puede ser anterior al inicio (%).',
      p_billing_period_end, p_billing_period_start USING ERRCODE = 'check_violation';
  END IF;

  -- Organización derivada de las reservas reales. Una mezcla A/B, una reserva
  -- inexistente o una reserva ajena producen el mismo error genérico y nada se
  -- escribe.
  SELECT array_agg(DISTINCT b.organization_id) INTO v_orgs
    FROM public.bookings b
   WHERE b.id = ANY(p_booking_ids)
     AND (v_org IS NULL OR b.organization_id = v_org);

  SELECT count(*) INTO v_missing
    FROM unnest(p_booking_ids) AS nb(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.bookings b
      WHERE b.id = nb.id
        AND (v_org IS NULL OR b.organization_id = v_org)
   );
  IF v_missing > 0 OR v_orgs IS NULL OR array_length(v_orgs, 1) <> 1 THEN
    RAISE EXCEPTION 'Alguna reserva del periodo recurrente no existe.' USING ERRCODE = 'check_violation';
  END IF;
  v_org := v_orgs[1];

  -- Keep the existing scope check before taking locks. All cooperating invoice
  -- writers take these advisory locks in UUID order, before any booking rows.
  FOR v_bid IN SELECT unnest(p_booking_ids) ORDER BY 1 LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  -- A booking writer need not use advisory locks. Lock the actual rows as well,
  -- in stable order, before reading eligibility; keep them through invoice and
  -- last_billed_date writes. At READ COMMITTED a waiter sees the committed row;
  -- stronger isolation may abort for serialization rather than use stale data.
  PERFORM b.id
    FROM public.bookings b
   WHERE b.id = ANY(p_booking_ids) AND b.organization_id = v_org
   ORDER BY b.id
   FOR UPDATE;

  -- The pre-lock scope snapshot is not authoritative: a booking may have been
  -- deleted or moved while waiting. Reject the whole request before any writes.
  IF EXISTS (
    SELECT 1 FROM unnest(p_booking_ids) AS nb(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.bookings b
        WHERE b.id = nb.id AND b.organization_id = v_org
     )
  ) THEN
    RAISE EXCEPTION 'Alguna reserva del periodo recurrente no existe.' USING ERRCODE = 'check_violation';
  END IF;
  -- Contexto transaccional para el generador de folios (sólo dura esta transacción).
  PERFORM set_config('app.organization_id', v_org::text, true);

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE p_customer_id IS NOT NULL
     AND b.customer_id IS DISTINCT FROM p_customer_id
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % pertenece a otro cliente; no puede incluirse en esta factura recurrente.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE b.status IN ('cancelled', 'completed')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % está cancelada o completada; no es facturable.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE COALESCE(b.recurring_billing, false) = false
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % no tiene facturación recurrente activa.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE p_billing_period_start < b.start_date
      OR (b.end_date IS NOT NULL AND p_billing_period_end > b.end_date)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'El periodo % – % queda fuera del rango de la reserva %.',
      p_billing_period_start, p_billing_period_end, v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_uso_cfdi IS NULL THEN
    RAISE EXCEPTION 'El cliente no tiene uso de CFDI capturado; captúralo antes de generar la factura recurrente.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSIF public.fx_is_missing(v_moneda, p_tipo_cambio) THEN
    RAISE EXCEPTION 'Tipo de cambio inválido para facturar en % (se requiere un valor mayor a 0 y distinto de 1)', v_moneda
      USING ERRCODE = 'check_violation';
  ELSE
    v_tipo_cambio := p_tipo_cambio;
  END IF;

  -- A stale preview or direct caller cannot turn partial/unknown historical
  -- coverage into a new full-month charge. Exact same-period requests retain
  -- the idempotency/group-collision behavior below. Check under booking locks.
  IF EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.organization_id = v_org
      AND public.quote_charge_invoice_active(i)
      AND (i.booking_id = ANY(p_booking_ids) OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = i.id AND ib.booking_id = ANY(p_booking_ids)
          AND COALESCE(ib.organization_id, v_org) = v_org
      ))
      AND (
        i.billing_period_start IS NULL OR i.billing_period_end IS NULL
        OR NOT isfinite(i.billing_period_start) OR NOT isfinite(i.billing_period_end)
        OR i.billing_period_start > i.billing_period_end
        OR (i.billing_period_start <= p_billing_period_end
          AND i.billing_period_end >= p_billing_period_start
          AND (i.billing_period_start <> p_billing_period_start
            OR i.billing_period_end <> p_billing_period_end))
      )
  ) THEN
    RAISE EXCEPTION 'La reserva tiene cobertura superpuesta o sin fechas válidas. Actualiza la vista previa y revisa la factura anterior.'
      USING ERRCODE = '23505';
  END IF;

  -- The advisory locks serialize cooperating recurring runs. An invoice for
  -- only one member of the requested group is a stale selection, not proof
  -- that every booking has been billed. Include legacy direct links too.
  SELECT i.id, i.invoice_number
    INTO v_existing_id, v_existing_number
  FROM public.invoices i
  WHERE i.organization_id = v_org
    AND i.billing_period_start = p_billing_period_start
    AND i.billing_period_end = p_billing_period_end
    AND public.quote_charge_invoice_active(i)
    AND (
      i.booking_id = ANY(p_booking_ids)
      OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = i.id
          AND ib.booking_id = ANY(p_booking_ids)
          AND COALESCE(ib.organization_id, v_org) = v_org
      )
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_booking_ids) AS requested(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = v_existing_id
          AND ib.booking_id = requested.id
          AND COALESCE(ib.organization_id, v_org) = v_org
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = v_existing_id
          AND i.organization_id = v_org
          AND i.booking_id = requested.id
      )
    ) THEN
      RAISE EXCEPTION 'El grupo de reservas cambió: una parte del periodo ya tiene factura. Actualiza la vista previa antes de continuar.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.bookings b SET last_billed_date = (
      SELECT max(i.billing_period_end) FROM public.invoices i
      WHERE i.organization_id = v_org AND public.quote_charge_invoice_active(i)
        AND i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL
        AND isfinite(i.billing_period_start) AND isfinite(i.billing_period_end)
        AND i.billing_period_start <= i.billing_period_end
        AND (i.booking_id = b.id OR EXISTS (
          SELECT 1 FROM public.invoice_bookings ib
          WHERE ib.invoice_id = i.id AND ib.booking_id = b.id
            AND COALESCE(ib.organization_id, v_org) = v_org
        ))
    ) WHERE b.id = ANY(p_booking_ids) AND b.organization_id = v_org;
    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- New FUTURE coverage must extend a fully covered prefix of the contract.
  -- Historical/current periods remain independently selectable. range_agg
  -- verifies the union of real inclusive coverage, never MAX(end) or cache.
  IF p_billing_period_start > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Monterrey')::date
     AND EXISTS (
       SELECT 1 FROM public.bookings b
       WHERE b.id = ANY(p_booking_ids) AND b.organization_id = v_org
         AND b.start_date < p_billing_period_start
         AND NOT COALESCE((
           SELECT range_agg(daterange(i.billing_period_start, i.billing_period_end, '[]'))
             @> daterange(b.start_date, p_billing_period_start, '[)')
           FROM public.invoices i
           WHERE i.organization_id = v_org AND public.quote_charge_invoice_active(i)
             AND i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL
             AND isfinite(i.billing_period_start) AND isfinite(i.billing_period_end)
             AND i.billing_period_start <= i.billing_period_end
             AND (i.booking_id = b.id OR EXISTS (
               SELECT 1 FROM public.invoice_bookings ib
               WHERE ib.invoice_id = i.id AND ib.booking_id = b.id
                 AND COALESCE(ib.organization_id, v_org) = v_org
             ))
         ), false)
     ) THEN
    RAISE EXCEPTION 'Antes de facturar un período futuro, factura todos los períodos anteriores pendientes de la reserva.'
      USING ERRCODE = '23514';
  END IF;

  SELECT public.next_draft_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'FAC-AUTO-' || extract(epoch FROM now())::bigint::text;
  END IF;

  -- A unique violation after the locks is a real collision (for example, an
  -- independent manual writer). Never reinterpret it as group success.
  INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, line_items,
      subtotal, tax_rate, tax_amount, total, status, due_date,
      billing_period_start, billing_period_end,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, uso_cfdi,
      forma_pago, metodo_pago, moneda, tipo_cambio, organization_id
  ) VALUES (
      v_invoice_number,
      CASE WHEN v_is_single THEN p_booking_ids[1] ELSE NULL END,
      p_customer_id, p_customer_name, p_line_items,
      p_subtotal, p_tax_rate, p_tax_amount, p_total, 'draft', p_billing_period_end,
      p_billing_period_start, p_billing_period_end,
      p_receptor_rfc, p_receptor_razon_social, p_receptor_regimen_fiscal,
      p_receptor_domicilio_fiscal_cp, v_uso_cfdi,
      '99', 'PPD', v_moneda, v_tipo_cambio, v_org
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_bookings (invoice_id, booking_id, organization_id)
  SELECT v_invoice_id, unnest(p_booking_ids), v_org;

  UPDATE public.bookings b SET last_billed_date = (
      SELECT max(i.billing_period_end) FROM public.invoices i
      WHERE i.organization_id = v_org AND public.quote_charge_invoice_active(i)
        AND i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL
        AND isfinite(i.billing_period_start) AND isfinite(i.billing_period_end)
        AND i.billing_period_start <= i.billing_period_end
        AND (i.booking_id = b.id OR EXISTS (
          SELECT 1 FROM public.invoice_bookings ib
          WHERE ib.invoice_id = i.id AND ib.booking_id = b.id
            AND COALESCE(ib.organization_id, v_org) = v_org
        ))
    ) WHERE b.id = ANY(p_booking_ids) AND b.organization_id = v_org;

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$function$;

--> statement-breakpoint
-- Protect confirmed recurring coverage through direct/manual writes as well.
-- The completed-booking trigger keeps its actual-return rules unchanged.
-- Invoker code must inline the 0107 active-document predicate: its helper is
-- intentionally private (EXECUTE revoked), and granting access/DEFINER would
-- change this migration's permission model. Keep all CASE branches equivalent.
CREATE FUNCTION public.guard_confirmed_recurring_invoice_coverage()
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
       AND (CASE
         WHEN NEW.cfdi_status = 'stamping' THEN true
         WHEN NEW.cfdi_status = 'stamped' OR NEW.cfdi_uuid IS NOT NULL
           THEN NEW.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE NEW.status IS DISTINCT FROM 'cancelled'
           AND NEW.cfdi_status IS DISTINCT FROM 'cancelled'
       END) = (CASE
         WHEN OLD.cfdi_status = 'stamping' THEN true
         WHEN OLD.cfdi_status = 'stamped' OR OLD.cfdi_uuid IS NOT NULL
           THEN OLD.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE OLD.status IS DISTINCT FROM 'cancelled'
           AND OLD.cfdi_status IS DISTINCT FROM 'cancelled'
       END) THEN
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

  IF NOT (CASE
         WHEN v_invoice.cfdi_status = 'stamping' THEN true
         WHEN v_invoice.cfdi_status = 'stamped' OR v_invoice.cfdi_uuid IS NOT NULL
           THEN v_invoice.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE v_invoice.status IS DISTINCT FROM 'cancelled'
           AND v_invoice.cfdi_status IS DISTINCT FROM 'cancelled'
       END)
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
      AND (CASE
         WHEN i.cfdi_status = 'stamping' THEN true
         WHEN i.cfdi_status = 'stamped' OR i.cfdi_uuid IS NOT NULL
           THEN i.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE i.status IS DISTINCT FROM 'cancelled'
           AND i.cfdi_status IS DISTINCT FROM 'cancelled'
       END)
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
           AND (CASE
         WHEN i.cfdi_status = 'stamping' THEN true
         WHEN i.cfdi_status = 'stamped' OR i.cfdi_uuid IS NOT NULL
           THEN i.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE i.status IS DISTINCT FROM 'cancelled'
           AND i.cfdi_status IS DISTINCT FROM 'cancelled'
       END)
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
REVOKE ALL ON FUNCTION public.guard_confirmed_recurring_invoice_coverage() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_confirmed_recurring_invoice_coverage
AFTER INSERT OR UPDATE OF organization_id, booking_id, billing_period_start, billing_period_end, status, cfdi_status, cfdi_uuid, cancellation_status
ON public.invoices FOR EACH ROW
EXECUTE FUNCTION public.guard_confirmed_recurring_invoice_coverage();

CREATE TRIGGER trg_confirmed_recurring_invoice_booking_coverage
AFTER INSERT OR UPDATE OF organization_id, invoice_id, booking_id
ON public.invoice_bookings FOR EACH ROW
EXECUTE FUNCTION public.guard_confirmed_recurring_invoice_coverage();

--> statement-breakpoint
-- Explicit coverage enables gap-aware projections. Keep the existing public
-- contract, invoker/RLS semantics, caller ACLs, rates and fiscal fields.
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
      AND (CASE
         WHEN i.cfdi_status = 'stamping' THEN true
         WHEN i.cfdi_status = 'stamped' OR i.cfdi_uuid IS NOT NULL
           THEN i.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE i.status IS DISTINCT FROM 'cancelled'
           AND i.cfdi_status IS DISTINCT FROM 'cancelled'
       END)
      AND (i.booking_id = b.id OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = i.id AND ib.booking_id = b.id
          AND COALESCE(ib.organization_id, b.organization_id) = b.organization_id
      ))
  ) history ON true
  WHERE b.recurring_billing = true AND b.status = 'confirmed';
$function$;

--> statement-breakpoint
-- Serialize removal/cancellation of predecessor coverage with future creation.
-- Mutators already own an invoice/pivot row, so use nonblocking advisory locks.
CREATE FUNCTION public.lock_confirmed_recurring_coverage_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE v_ids uuid[]; v_id uuid; v_key bigint;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.organization_id, NEW.booking_id, NEW.billing_period_start, NEW.billing_period_end,
             (CASE
         WHEN NEW.cfdi_status = 'stamping' THEN true
         WHEN NEW.cfdi_status = 'stamped' OR NEW.cfdi_uuid IS NOT NULL
           THEN NEW.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE NEW.status IS DISTINCT FROM 'cancelled'
           AND NEW.cfdi_status IS DISTINCT FROM 'cancelled'
       END))
        IS NOT DISTINCT FROM
         ROW(OLD.organization_id, OLD.booking_id, OLD.billing_period_start, OLD.billing_period_end,
             (CASE
         WHEN OLD.cfdi_status = 'stamping' THEN true
         WHEN OLD.cfdi_status = 'stamped' OR OLD.cfdi_uuid IS NOT NULL
           THEN OLD.cancellation_status IS DISTINCT FROM 'accepted'
         ELSE OLD.status IS DISTINCT FROM 'cancelled'
           AND OLD.cfdi_status IS DISTINCT FROM 'cancelled'
       END)) THEN
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
REVOKE ALL ON FUNCTION public.lock_confirmed_recurring_coverage_change() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_lock_confirmed_recurring_invoice_change
BEFORE DELETE OR UPDATE OF organization_id, booking_id, billing_period_start, billing_period_end, status, cfdi_status, cfdi_uuid, cancellation_status
ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.lock_confirmed_recurring_coverage_change();
CREATE TRIGGER zz_lock_confirmed_recurring_invoice_booking_change
BEFORE DELETE OR UPDATE OF invoice_id, booking_id, organization_id
ON public.invoice_bookings FOR EACH ROW EXECUTE FUNCTION public.lock_confirmed_recurring_coverage_change();
