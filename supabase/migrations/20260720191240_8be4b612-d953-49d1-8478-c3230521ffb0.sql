-- EC-A3: red de seguridad última contra duplicados en facturación recurrente.
-- Complementa el pg_advisory_xact_lock del RPC create_recurring_invoice con un
-- índice único parcial a nivel storage, que atrapa cualquier duplicado aunque
-- el lock cooperativo no aplique (nodos distintos, bypass del RPC, jobs manuales).

-- 1) Fail-fast si existiera drift previo (defensivo; validado 0 filas en pre-check).
DO $$
DECLARE v_dupes int;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT 1 FROM public.invoices
    WHERE booking_id IS NOT NULL
      AND billing_period_start IS NOT NULL
      AND billing_period_end IS NOT NULL
      AND status <> 'cancelled'
    GROUP BY booking_id, billing_period_start, billing_period_end
    HAVING COUNT(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'EC-A3 migration abort: % duplicate (booking_id, period) group(s) exist in public.invoices; reconcile before applying unique index', v_dupes;
  END IF;
END $$;

-- 2) Índice único parcial: 1 factura no-cancelada por (booking, periodo).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_booking_period_uniq
  ON public.invoices (booking_id, billing_period_start, billing_period_end)
  WHERE booking_id IS NOT NULL
    AND billing_period_start IS NOT NULL
    AND billing_period_end IS NOT NULL
    AND status <> 'cancelled';

COMMENT ON INDEX public.invoices_booking_period_uniq IS
  'EC-A3: previene duplicados de facturación recurrente por (booking, periodo) además del pg_advisory_xact_lock en create_recurring_invoice.';

-- 3) Reforzar el RPC: capturar 23505 y devolver already_existed=true en vez de propagar.
CREATE OR REPLACE FUNCTION public.create_recurring_invoice(
  p_booking_ids uuid[],
  p_customer_id uuid,
  p_customer_name text,
  p_line_items jsonb,
  p_subtotal numeric,
  p_tax_rate numeric,
  p_tax_amount numeric,
  p_total numeric,
  p_billing_period_start date,
  p_billing_period_end date,
  p_receptor_rfc text,
  p_receptor_razon_social text,
  p_receptor_regimen_fiscal text,
  p_receptor_domicilio_fiscal_cp text,
  p_uso_cfdi text
) RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_id uuid;
  v_existing_number text;
  v_lock_key bigint;
  v_bid uuid;
  v_is_single boolean := array_length(p_booking_ids, 1) = 1;
BEGIN
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_booking_ids requerido';
  END IF;

  FOR v_bid IN
    SELECT unnest(p_booking_ids) ORDER BY 1
  LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  SELECT i.id, i.invoice_number
    INTO v_existing_id, v_existing_number
  FROM public.invoice_bookings ib
  JOIN public.invoices i ON i.id = ib.invoice_id
  WHERE ib.booking_id = ANY(p_booking_ids)
    AND i.billing_period_start = p_billing_period_start
    AND i.billing_period_end = p_billing_period_end
    AND i.status <> 'cancelled'
    AND (i.cfdi_status IS NULL OR i.cfdi_status <> 'cancelled')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.bookings
       SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids);
    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT public.next_draft_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'FAC-AUTO-' || extract(epoch FROM now())::bigint::text;
  END IF;

  BEGIN
    INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, line_items,
      subtotal, tax_rate, tax_amount, total, status, due_date,
      billing_period_start, billing_period_end,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, uso_cfdi,
      forma_pago, metodo_pago, moneda, tipo_cambio
    ) VALUES (
      v_invoice_number,
      CASE WHEN v_is_single THEN p_booking_ids[1] ELSE NULL END,
      p_customer_id, p_customer_name, p_line_items,
      p_subtotal, p_tax_rate, p_tax_amount, p_total, 'draft', p_billing_period_end,
      p_billing_period_start, p_billing_period_end,
      p_receptor_rfc, p_receptor_razon_social, p_receptor_regimen_fiscal,
      p_receptor_domicilio_fiscal_cp, COALESCE(p_uso_cfdi, 'G03'),
      '99', 'PPD', 'MXN', 1
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_bookings (invoice_id, booking_id)
    SELECT v_invoice_id, unnest(p_booking_ids);
  EXCEPTION WHEN unique_violation THEN
    -- Otra transacción ganó la carrera contra el índice único parcial
    -- (invoices_booking_period_uniq). Recuperamos la factura ganadora y
    -- devolvemos already_existed=true; el caller marca el periodo como cubierto.
    SELECT i.id, i.invoice_number
      INTO v_existing_id, v_existing_number
    FROM public.invoice_bookings ib
    JOIN public.invoices i ON i.id = ib.invoice_id
    WHERE ib.booking_id = ANY(p_booking_ids)
      AND i.billing_period_start = p_billing_period_start
      AND i.billing_period_end = p_billing_period_end
      AND i.status <> 'cancelled'
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      -- fallback: buscar por booking_id directo si el pivot aún no se escribió
      SELECT i.id, i.invoice_number
        INTO v_existing_id, v_existing_number
      FROM public.invoices i
      WHERE i.booking_id = ANY(p_booking_ids)
        AND i.billing_period_start = p_billing_period_start
        AND i.billing_period_end = p_billing_period_end
        AND i.status <> 'cancelled'
      LIMIT 1;
    END IF;

    IF v_existing_id IS NULL THEN
      RAISE;
    END IF;

    UPDATE public.bookings
       SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids);

    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END;

  UPDATE public.bookings
     SET last_billed_date = p_billing_period_end
   WHERE id = ANY(p_booking_ids);

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text) TO authenticated;