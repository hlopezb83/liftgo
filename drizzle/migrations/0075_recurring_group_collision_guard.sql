-- Fail closed when a recurring invoice group partially overlaps an already billed period.
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
  IF p_billing_period_start > p_billing_period_end THEN
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

  FOR v_bid IN SELECT unnest(p_booking_ids) ORDER BY 1 LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  -- The advisory locks serialize cooperating recurring runs. An invoice for
  -- only one member of the requested group is a stale selection, not proof
  -- that every booking has been billed. Include legacy direct links too.
  SELECT i.id, i.invoice_number
    INTO v_existing_id, v_existing_number
  FROM public.invoices i
  WHERE i.organization_id = v_org
    AND i.billing_period_start = p_billing_period_start
    AND i.billing_period_end = p_billing_period_end
    AND i.status <> 'cancelled'
    AND (i.cfdi_status IS NULL OR i.cfdi_status <> 'cancelled')
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
    UPDATE public.bookings SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids) AND organization_id = v_org;
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

  UPDATE public.bookings SET last_billed_date = p_billing_period_end
   WHERE id = ANY(p_booking_ids) AND organization_id = v_org;

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$function$;
