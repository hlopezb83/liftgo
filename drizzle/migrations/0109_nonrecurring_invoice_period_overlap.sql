-- Guard original-period billing after extension invoicing.
-- DDL only: preserve existing locks, invoker/RLS behavior, RPC grants, pivot
-- writes and all period/range checks. No historical backfill or deployment.
-- New checks apply only to non-recurring bookings; cancelled invoices remain
-- excluded exactly as before. A self-edit with no other overlap remains valid.

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
    -- El periodo debe caber dentro del rango de TODAS las reservas ligadas.
    SELECT b.booking_number, b.start_date, b.end_date
      INTO v_bad_booking, v_bad_start, v_bad_end
    FROM unnest(p_booking_ids) AS nb(booking_id)
    JOIN public.bookings b ON b.id = nb.booking_id
    WHERE v_start < b.start_date OR v_end > b.end_date
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
