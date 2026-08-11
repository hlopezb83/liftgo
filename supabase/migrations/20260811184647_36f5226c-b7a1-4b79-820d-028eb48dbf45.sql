-- FIX C-1 / C-2: guards de rol en RPCs SECURITY DEFINER expuestas sin autorización.
-- Los cuerpos se copian EXACTOS de la definición vigente en la base; solo se
-- añade el guard al inicio y se corrigen los GRANT (se retira anon).

-- C-1 -----------------------------------------------------------------------
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_id uuid;
  v_existing_number text;
  v_lock_key bigint;
  v_bid uuid;
  v_is_single boolean := array_length(p_booking_ids, 1) = 1;
BEGIN
  -- FIX C-1: solo admin/administrativo via JWT de usuario. service_role
  -- (cron generate-recurring-invoices) sigue permitido.
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text) TO service_role;

-- C-2 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_forklift_status(p_forklift_id uuid, p_new_status text, p_reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_current text; v_active_bookings int;
BEGIN
  -- FIX C-2: solo admin / administrativo / mechanic pueden cambiar el estado.
  IF NOT (public.has_role(auth.uid(),'admin')
       OR public.has_role(auth.uid(),'administrativo')
       OR public.has_role(auth.uid(),'mechanic')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_current FROM public.forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current = p_new_status THEN RETURN; END IF;
  IF p_new_status NOT IN ('available','rented','maintenance','retired','sold') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_new_status;
  END IF;
  SELECT count(*) INTO v_active_bookings FROM public.bookings WHERE forklift_id = p_forklift_id AND status = 'confirmed';
  IF p_new_status = 'rented' AND v_active_bookings = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa';
  END IF;
  IF v_current = 'rented' AND p_new_status IN ('maintenance','available','sold','retired') AND v_active_bookings > 0 THEN
    RAISE EXCEPTION 'El montacargas tiene una renta activa: cierra la renta antes de cambiar su estado';
  END IF;
  IF p_new_status IN ('maintenance','sold','retired') AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'La razón es obligatoria para este cambio de estado';
  END IF;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = p_new_status WHERE id = p_forklift_id;
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note) VALUES (p_forklift_id, v_current, p_new_status, p_reason);
END; $function$;

REVOKE ALL ON FUNCTION public.change_forklift_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_forklift_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_forklift_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_forklift_status(uuid, text, text) TO service_role;