-- P1/P3 (regresión v7.422.0): guardado de factura + reservas 100% transaccional
-- con candados advisory (misma clave/orden que create_recurring_invoice) y
-- validación de periodo en servidor. No toca datos ni debilita reglas previas.

-- 1) Candados advisory por reserva: MISMA convención de clave que
--    create_recurring_invoice (md5 → 60 bits) y orden ascendente, para que el
--    motor recurrente y el guardado manual se serialicen entre sí sin deadlocks.
CREATE OR REPLACE FUNCTION public.lock_bookings_for_billing(p_booking_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_bid uuid;
  v_lock_key bigint;
BEGIN
  FOR v_bid IN
    SELECT DISTINCT nb.booking_id
    FROM unnest(COALESCE(p_booking_ids, '{}'::uuid[])) AS nb(booking_id)
    ORDER BY 1
  LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_bookings_for_billing(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_bookings_for_billing(uuid[]) TO authenticated, service_role;

-- 2) sync_invoice_bookings endurecido:
--    a) adquiere los candados ANTES del chequeo de duplicados (dos transacciones
--       concurrentes ya no pueden pasar ambas el SELECT);
--    b) exige periodo completo y start <= end cuando hay reservas;
--    c) valida que el periodo quede dentro del rango de TODAS las reservas.
--    La regla de duplicados (pivote + booking_id legado, excluye facturas
--    canceladas) se conserva idéntica.
CREATE OR REPLACE FUNCTION public.sync_invoice_bookings(p_invoice_id uuid, p_booking_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
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

  SELECT i.billing_period_start, i.billing_period_end
    INTO v_start, v_end
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

  -- Idempotencia reserva + período: otra factura NO cancelada que cubra la
  -- misma reserva (vía pivote o vía booking_id legado) con el MISMO período.
  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    SELECT b.booking_number, i.invoice_number
      INTO v_dup_booking, v_dup_invoice
    FROM unnest(p_booking_ids) AS nb(booking_id)
    JOIN public.invoices i
      ON i.id <> p_invoice_id
     AND i.status <> 'cancelled'
     AND i.billing_period_start = v_start
     AND i.billing_period_end = v_end
     AND (
       i.booking_id = nb.booking_id
       OR EXISTS (
         SELECT 1 FROM public.invoice_bookings ib
         WHERE ib.invoice_id = i.id AND ib.booking_id = nb.booking_id
       )
     )
    JOIN public.bookings b ON b.id = nb.booking_id
    LIMIT 1;
    IF v_dup_booking IS NOT NULL THEN
      RAISE EXCEPTION 'La reserva % ya está facturada en % para el período % – %. Ajusta el período o cancela la factura anterior.',
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

-- 3) Guardado transaccional de la factura + sus reservas en UNA transacción.
--    SECURITY INVOKER: aplican las mismas RLS, triggers y guards que el flujo
--    actual (incluido trg_guard_invoice_sale_assignment, versionado optimista
--    con stale_write y enforce_invoice_booking_period). Un fallo en el sync
--    revierte también el INSERT/UPDATE de la factura: cero facturas huérfanas.
CREATE OR REPLACE FUNCTION public.save_invoice_with_bookings(
  p_invoice jsonb,
  p_booking_ids uuid[] DEFAULT '{}'::uuid[],
  p_invoice_id uuid DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS SETOF public.invoices
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_updated integer := 0;
  v_current_version integer;
BEGIN
  -- Candados ANTES de tocar la factura (mismo orden que create_recurring_invoice
  -- y que sync_invoice_bookings; re-adquirirlos ahí es no-op en la misma tx).
  PERFORM public.lock_bookings_for_billing(p_booking_ids);

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, quote_id,
      line_items, subtotal, tax_rate, tax_amount, total,
      due_date, issued_at, billing_period_start, billing_period_end, notes,
      serie, folio, forma_pago, metodo_pago, uso_cfdi, moneda, tipo_cambio,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, global_periodicity, global_months, global_year
    ) VALUES (
      public.next_draft_invoice_number(),
      NULLIF(p_invoice->>'booking_id', '')::uuid,
      NULLIF(p_invoice->>'customer_id', '')::uuid,
      p_invoice->>'customer_name',
      NULLIF(p_invoice->>'quote_id', '')::uuid,
      COALESCE(p_invoice->'line_items', '[]'::jsonb),
      COALESCE((p_invoice->>'subtotal')::numeric, 0),
      COALESCE((p_invoice->>'tax_rate')::numeric, 0),
      COALESCE((p_invoice->>'tax_amount')::numeric, 0),
      COALESCE((p_invoice->>'total')::numeric, 0),
      NULLIF(p_invoice->>'due_date', '')::date,
      COALESCE(NULLIF(p_invoice->>'issued_at', '')::date, public.today_mty()),
      NULLIF(p_invoice->>'billing_period_start', '')::date,
      NULLIF(p_invoice->>'billing_period_end', '')::date,
      p_invoice->>'notes',
      p_invoice->>'serie',
      p_invoice->>'folio',
      p_invoice->>'forma_pago',
      p_invoice->>'metodo_pago',
      p_invoice->>'uso_cfdi',
      p_invoice->>'moneda',
      (p_invoice->>'tipo_cambio')::numeric,
      p_invoice->>'receptor_rfc',
      p_invoice->>'receptor_razon_social',
      p_invoice->>'receptor_regimen_fiscal',
      p_invoice->>'receptor_domicilio_fiscal_cp',
      p_invoice->>'global_periodicity',
      p_invoice->>'global_months',
      (p_invoice->>'global_year')::integer
    )
    RETURNING id INTO v_id;
  ELSE
    v_id := p_invoice_id;
    UPDATE public.invoices SET
      booking_id = NULLIF(p_invoice->>'booking_id', '')::uuid,
      customer_id = NULLIF(p_invoice->>'customer_id', '')::uuid,
      customer_name = p_invoice->>'customer_name',
      quote_id = NULLIF(p_invoice->>'quote_id', '')::uuid,
      line_items = COALESCE(p_invoice->'line_items', '[]'::jsonb),
      subtotal = COALESCE((p_invoice->>'subtotal')::numeric, 0),
      tax_rate = COALESCE((p_invoice->>'tax_rate')::numeric, 0),
      tax_amount = COALESCE((p_invoice->>'tax_amount')::numeric, 0),
      total = COALESCE((p_invoice->>'total')::numeric, 0),
      due_date = NULLIF(p_invoice->>'due_date', '')::date,
      issued_at = COALESCE(NULLIF(p_invoice->>'issued_at', '')::date, issued_at),
      billing_period_start = NULLIF(p_invoice->>'billing_period_start', '')::date,
      billing_period_end = NULLIF(p_invoice->>'billing_period_end', '')::date,
      notes = p_invoice->>'notes',
      serie = p_invoice->>'serie',
      folio = p_invoice->>'folio',
      forma_pago = p_invoice->>'forma_pago',
      metodo_pago = p_invoice->>'metodo_pago',
      uso_cfdi = p_invoice->>'uso_cfdi',
      moneda = p_invoice->>'moneda',
      tipo_cambio = (p_invoice->>'tipo_cambio')::numeric,
      receptor_rfc = p_invoice->>'receptor_rfc',
      receptor_razon_social = p_invoice->>'receptor_razon_social',
      receptor_regimen_fiscal = p_invoice->>'receptor_regimen_fiscal',
      receptor_domicilio_fiscal_cp = p_invoice->>'receptor_domicilio_fiscal_cp',
      global_periodicity = p_invoice->>'global_periodicity',
      global_months = p_invoice->>'global_months',
      global_year = (p_invoice->>'global_year')::integer
    WHERE id = p_invoice_id
      AND (p_expected_version IS NULL OR version = p_expected_version);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      SELECT i.version INTO v_current_version FROM public.invoices i WHERE i.id = p_invoice_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Factura no encontrada o sin permisos para modificarla.'
          USING ERRCODE = 'P0002';
      END IF;
      IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
        -- Mismo mensaje canónico que el flujo anterior (detección "stale_write" en UI).
        RAISE EXCEPTION 'stale_write: otro usuario modificó esta factura; recarga y vuelve a intentar'
          USING ERRCODE = '55000';
      END IF;
      RAISE EXCEPTION 'No se pudo guardar la factura (sin permisos o bloqueada por otra regla).'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM public.sync_invoice_bookings(v_id, p_booking_ids);

  RETURN QUERY SELECT * FROM public.invoices i WHERE i.id = v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_invoice_with_bookings(jsonb, uuid[], uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_bookings(jsonb, uuid[], uuid, integer) TO authenticated, service_role;