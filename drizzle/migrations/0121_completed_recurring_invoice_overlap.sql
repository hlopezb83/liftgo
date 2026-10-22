-- Guard newly claimed coverage for completed recurring bookings only.
-- No historical data rewrite; confirmed recurring billing keeps its semantics.
-- Existing conflicting history remains readable and ordinary notes edits retain
-- identical links. A change of coverage must be conflict-free.
-- Uses invoker visibility and the same ordered booking advisory locks as save RPC.

CREATE OR REPLACE FUNCTION public.sync_invoice_bookings(p_invoice_id uuid, p_booking_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_start date;
  v_end date;
  v_dup_booking text;
  v_dup_invoice text;
  v_bad_booking text;
  v_bad_start date;
  v_bad_end date;
  v_expected integer := COALESCE(array_length(p_booking_ids, 1), 0);
  v_inserted integer := 0;
BEGIN
  -- Candados por reserva (orden ascendente, misma clave que create_recurring_invoice).
  PERFORM public.lock_bookings_for_billing(p_booking_ids);

  SELECT i.billing_period_start, i.billing_period_end, i.organization_id
    INTO v_start, v_end, v_org
  FROM public.invoices i
  WHERE i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada o sin permisos para modificarla.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_expected > 0 THEN
    IF v_start IS NULL OR v_end IS NULL THEN
      RAISE EXCEPTION 'La factura con reservas requiere el periodo de facturación completo (inicio y fin).'
        USING ERRCODE = '23514';
    END IF;
    IF v_start > v_end THEN
      RAISE EXCEPTION 'El fin del periodo de facturación (%) no puede ser anterior al inicio (%).', v_end, v_start
        USING ERRCODE = '23514';
    END IF;
    -- Preserve contractual bounds except completed recurring rentals: their
    -- new coverage is bounded by the actual-return trigger, including late days.
    -- Never extend the operational booking.end_date.
    SELECT b.booking_number, b.start_date, b.end_date
      INTO v_bad_booking, v_bad_start, v_bad_end
    FROM unnest(p_booking_ids) AS nb(booking_id)
    JOIN public.bookings b ON b.id = nb.booking_id
    WHERE v_start < b.start_date OR (v_end > b.end_date
      AND NOT (b.recurring_billing IS TRUE AND b.status = 'completed'))
    LIMIT 1;
    IF v_bad_booking IS NOT NULL THEN
      RAISE EXCEPTION 'El periodo % – % queda fuera del rango de la reserva % (% – %). Ajusta el periodo al rango de la reserva.',
        v_start, v_end, v_bad_booking, v_bad_start, v_bad_end
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Non-recurring dates are inclusive: original periods and extensions must
  -- not overlap. Unknown/invalid historical coverage fails closed; no data is
  -- rewritten. Historical overlapping drafts require reconciliation before
  -- any save, including notes-only edits. Recurring exact-period semantics
  -- remain unchanged to match create_recurring_invoice.
  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    SELECT b.booking_number, i.invoice_number
      INTO v_dup_booking, v_dup_invoice
    FROM unnest(p_booking_ids) AS nb(booking_id)
    JOIN public.bookings b ON b.id = nb.booking_id AND b.organization_id = v_org
    JOIN public.invoices i
      ON i.id <> p_invoice_id
     AND i.status <> 'cancelled'
     AND i.organization_id = v_org
     AND (
       (b.recurring_billing IS TRUE
        AND i.billing_period_start = v_start AND i.billing_period_end = v_end)
       OR (b.recurring_billing IS NOT TRUE AND (
         i.billing_period_start IS NULL OR i.billing_period_end IS NULL
         OR i.billing_period_start > i.billing_period_end
         OR (i.billing_period_start <= v_end AND i.billing_period_end >= v_start)
       ))
     )
     AND (
       i.booking_id = nb.booking_id
       OR EXISTS (
         SELECT 1 FROM public.invoice_bookings ib
         WHERE ib.invoice_id = i.id AND ib.booking_id = nb.booking_id
       )
     )
    LIMIT 1;
    IF v_dup_booking IS NOT NULL THEN
      RAISE EXCEPTION 'La reserva % ya tiene la factura % con cobertura coincidente, superpuesta o sin fechas válidas para el período % – %. Revisa las fechas y ajusta el período o concilia la factura anterior antes de guardar.',
        v_dup_booking, v_dup_invoice, v_start, v_end
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Unchanged coverage must not delete/reinsert historical associations. All existing
  -- locks, tenant/range checks and duplicate checks above still run first.
  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = ANY(p_booking_ids)
             AND b.organization_id = v_org AND b.recurring_billing IS TRUE AND b.status = 'completed')
     AND v_expected = (SELECT count(DISTINCT id) FROM unnest(p_booking_ids) AS nb(id))
     AND v_expected = (SELECT count(*) FROM public.invoice_bookings WHERE invoice_id = p_invoice_id)
     AND NOT EXISTS (
       SELECT 1 FROM unnest(p_booking_ids) WITH ORDINALITY AS nb(booking_id, ord)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.invoice_bookings ib
         WHERE ib.invoice_id = p_invoice_id AND ib.booking_id = nb.booking_id
           AND ib.organization_id = v_org
       )
     ) THEN
    -- Ordering is not coverage. UPDATE even unchanged indexes so existing
    -- deferred quote-charge validators still run without claiming new links.
    UPDATE public.invoice_bookings ib SET line_index = (nb.ord - 1)::integer
    FROM unnest(p_booking_ids) WITH ORDINALITY AS nb(booking_id, ord)
    WHERE ib.invoice_id = p_invoice_id AND ib.booking_id = nb.booking_id;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_expected THEN
      RAISE EXCEPTION 'No se pudieron sincronizar todas las reservas con los permisos actuales.' USING ERRCODE = '42501';
    END IF;
    RETURN v_inserted;
  END IF;

  DELETE FROM public.invoice_bookings WHERE invoice_id = p_invoice_id;

  IF v_expected > 0 THEN
    INSERT INTO public.invoice_bookings (invoice_id, booking_id, line_index)
    SELECT p_invoice_id, nb.booking_id, (nb.ord - 1)::integer
    FROM unnest(p_booking_ids) WITH ORDINALITY AS nb(booking_id, ord);
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_expected THEN
      RAISE EXCEPTION 'Sincronizar reservas: se esperaban % filas, se insertaron %.',
        v_expected, v_inserted
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN v_inserted;
END;
$function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_completed_recurring_invoice_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_ids uuid[];
  v_booking record;
  v_conflict text;
  v_id uuid;
  v_key bigint;
  v_returns integer;
  v_returned_at timestamptz;
  v_returned_on date;
  v_return_unit_matches boolean;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    -- Status changes that do not reactivate a cancelled claim are not new coverage.
    IF TG_OP = 'UPDATE'
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id
       AND NEW.billing_period_start IS NOT DISTINCT FROM OLD.billing_period_start
       AND NEW.billing_period_end IS NOT DISTINCT FROM OLD.billing_period_end
       AND NOT (OLD.status = 'cancelled' AND NEW.status <> 'cancelled') THEN
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
    IF NOT FOUND OR NEW.organization_id IS DISTINCT FROM v_invoice.organization_id THEN
      RAISE EXCEPTION 'La asociación no pertenece a una factura accesible de la empresa.' USING ERRCODE = '23514';
    END IF;
    v_ids := ARRAY[NEW.booking_id];
  END IF;

  IF v_invoice.status = 'cancelled' OR COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = ANY(v_ids)
      AND b.organization_id = v_invoice.organization_id
      AND b.recurring_billing IS TRUE AND b.status = 'completed'
  ) THEN
    RETURN NEW;
  END IF;
  -- A row trigger already owns an invoice/pivot tuple. Never wait for an
  -- advisory lock held by a save RPC that could be waiting for that tuple.
  -- Identical key/order to lock_bookings_for_billing; its owner can reenter.
  FOREACH v_id IN ARRAY v_ids LOOP
    v_key := ('x' || substr(md5(v_id::text), 1, 15))::bit(60)::bigint;
    IF NOT pg_try_advisory_xact_lock(v_key) THEN
      RAISE EXCEPTION 'La reserva está siendo facturada. Reintenta guardar en unos segundos.' USING ERRCODE = '55P03';
    END IF;
  END LOOP;

  FOR v_booking IN
    SELECT b.id, b.booking_number, b.start_date, b.end_date, b.forklift_id
    FROM public.bookings b
    WHERE b.id = ANY(v_ids) AND b.organization_id = v_invoice.organization_id
      AND b.recurring_billing IS TRUE AND b.status = 'completed'
    ORDER BY b.id
  LOOP
    -- An advisory-lock waiter at stronger snapshot isolation can retain an old
    -- invoice snapshot. Refuse this new-coverage operation instead of guessing.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Reintenta la cobertura recurrente con aislamiento READ COMMITTED.' USING ERRCODE = '40001';
    END IF;
    IF v_invoice.billing_period_start IS NULL OR v_invoice.billing_period_end IS NULL
       OR v_invoice.billing_period_start > v_invoice.billing_period_end
       OR v_booking.start_date IS NULL OR v_booking.end_date IS NULL
       OR v_invoice.billing_period_start < v_booking.start_date THEN
      RAISE EXCEPTION 'La reserva % requiere un período válido dentro de sus fechas.', v_booking.booking_number USING ERRCODE = '23514';
    END IF;

    -- Only authoritative, tenant/unit-matched actual returns bound new rental
    -- coverage. No fallback to updated_at, today, or the contractual end date.
    SELECT count(*), min(ri.inspected_at), bool_and(ri.forklift_id = v_booking.forklift_id)
      INTO v_returns, v_returned_at, v_return_unit_matches
    FROM public.return_inspections ri
    WHERE ri.booking_id = v_booking.id
      AND ri.organization_id = v_invoice.organization_id;
    IF v_returns <> 1 OR v_return_unit_matches IS NOT TRUE
       OR v_returned_at IS NULL OR NOT isfinite(v_returned_at)
       OR v_returned_at > CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'La reserva % requiere una devolución única y válida para facturar períodos pendientes.', v_booking.booking_number USING ERRCODE = '23514';
    END IF;
    v_returned_on := (v_returned_at AT TIME ZONE 'America/Monterrey')::date;
    IF v_returned_on < v_booking.start_date
       OR v_returned_on > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Monterrey')::date
       OR v_invoice.billing_period_end > v_returned_on THEN
      RAISE EXCEPTION 'El período de la reserva % excede la devolución efectiva o su fecha de devolución no es válida.', v_booking.booking_number USING ERRCODE = '23514';
    END IF;

    -- Late recovery must not silently charge days already represented by a
    -- manual/legacy extra or a grouped document that cannot be attributed.
    -- Apply only to new coverage after contractual end, including this invoice.
    IF v_invoice.billing_period_end > v_booking.end_date AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.organization_id = v_invoice.organization_id AND i.status <> 'cancelled'
        AND (i.booking_id = v_booking.id OR EXISTS (
          SELECT 1 FROM public.invoice_bookings ib WHERE ib.invoice_id = i.id AND ib.booking_id = v_booking.id
        ))
        AND (
          CASE WHEN jsonb_typeof(i.line_items) IS DISTINCT FROM 'array' THEN true
          ELSE jsonb_array_length(i.line_items) = 0 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(i.line_items) item
            WHERE item->>'line_kind' IS DISTINCT FROM 'rental'
          ) END
          OR EXISTS (
            SELECT 1 FROM (
              SELECT i.booking_id AS id
              UNION SELECT ib.booking_id FROM public.invoice_bookings ib WHERE ib.invoice_id = i.id
            ) links WHERE links.id IS NOT NULL AND links.id <> v_booking.id
          )
        )
    ) THEN
      RAISE EXCEPTION 'La renta posterior al contrato requiere revisión: hay conceptos o reservas sin atribución inequívoca. Usa una factura de sólo renta para una reserva.' USING ERRCODE = '23514';
    END IF;

    SELECT i.invoice_number INTO v_conflict
    FROM public.invoices i
    WHERE i.id <> v_invoice.id AND i.organization_id = v_invoice.organization_id
      AND i.status <> 'cancelled'
      AND (i.booking_id = v_booking.id OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib WHERE ib.invoice_id = i.id AND ib.booking_id = v_booking.id
      ))
      AND (i.billing_period_start IS NULL OR i.billing_period_end IS NULL
        OR i.billing_period_start > i.billing_period_end
        OR (i.billing_period_start <= v_invoice.billing_period_end AND i.billing_period_end >= v_invoice.billing_period_start))
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'La reserva % ya tiene cobertura en la factura %; el período se superpone.', v_booking.booking_number, v_conflict USING ERRCODE = '23505';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
-- Trigger-only function: no new callable RPC or expansion of grants.
REVOKE ALL ON FUNCTION public.guard_completed_recurring_invoice_overlap() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER trg_completed_recurring_invoice_overlap
AFTER INSERT OR UPDATE OF organization_id, booking_id, billing_period_start, billing_period_end, status
ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_completed_recurring_invoice_overlap();
--> statement-breakpoint
CREATE TRIGGER trg_completed_recurring_invoice_booking_overlap
AFTER INSERT OR UPDATE OF organization_id, invoice_id, booking_id
ON public.invoice_bookings FOR EACH ROW EXECUTE FUNCTION public.guard_completed_recurring_invoice_overlap();
