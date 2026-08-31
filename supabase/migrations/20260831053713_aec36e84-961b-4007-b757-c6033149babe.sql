-- A1-1: la factura recurrente ignoraba la moneda/TC de la reserva
CREATE OR REPLACE FUNCTION public.create_recurring_invoice(p_booking_ids uuid[], p_customer_id uuid, p_customer_name text, p_line_items jsonb, p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric, p_total numeric, p_billing_period_start date, p_billing_period_end date, p_receptor_rfc text, p_receptor_razon_social text, p_receptor_regimen_fiscal text, p_receptor_domicilio_fiscal_cp text, p_uso_cfdi text, p_moneda text DEFAULT 'MXN'::text, p_tipo_cambio numeric DEFAULT 1)
 RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
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
  v_moneda text := COALESCE(NULLIF(upper(btrim(p_moneda)), ''), 'MXN');
  v_tipo_cambio numeric;
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

  -- A1-1: MXN siempre 1; divisa exige TC > 0 (nada de 1:1 silencioso).
  IF v_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSE
    v_tipo_cambio := NULLIF(p_tipo_cambio, 0);
    IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
      RAISE EXCEPTION 'Tipo de cambio requerido para facturar en % (moneda distinta de MXN)', v_moneda
        USING ERRCODE = 'check_violation';
    END IF;
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
      '99', 'PPD', v_moneda, v_tipo_cambio
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

REVOKE ALL ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text, text, numeric) TO authenticated, service_role;

-- 2A-4: ImpSaldoAnt del REP no descontaba notas de credito timbradas
CREATE OR REPLACE FUNCTION public.prepare_payment_complement(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment payments%ROWTYPE;
  v_invoice invoices%ROWTYPE;
  v_prior_paid numeric := 0;
  v_prior_emissions integer := 0;
  v_installment integer;
  v_prior_balance numeric;
  v_credited numeric := 0;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id requerido';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % no existe', p_payment_id;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % no existe', v_payment.invoice_id;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN p.rep_cfdi_status = 'stamped' AND p.id <> p_payment_id THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(
      CASE
        WHEN p.id = p_payment_id THEN 0
        WHEN p.rep_cfdi_status = 'stamped' THEN 1
        WHEN p.rep_cfdi_status = 'cancelled' AND p.rep_cfdi_uuid IS NOT NULL THEN 1
        WHEN p.installment_number IS NOT NULL THEN 1
        ELSE 0
      END
    ), 0)
  INTO v_prior_paid, v_prior_emissions
  FROM public.payments p
  WHERE p.invoice_id = v_invoice.id;

  IF v_payment.rep_cfdi_uuid IS NOT NULL THEN
    v_prior_emissions := v_prior_emissions + 1;
  END IF;

  -- 2A-4: criterio canonico de NC (mismo que v_invoices_with_balance).
  SELECT COALESCE(SUM(cn.total), 0) INTO v_credited
    FROM public.credit_notes cn
   WHERE cn.invoice_id = v_invoice.id
     AND cn.cfdi_status = 'stamped'
     AND COALESCE(cn.status, '') <> 'cancelled'
     AND COALESCE(cn.cancellation_status, '') <> 'accepted';

  v_installment := v_prior_emissions + 1;
  v_prior_balance := GREATEST(
    round((v_invoice.total - v_prior_paid - v_credited)::numeric, 2), 0
  );

  IF v_payment.amount <= 0 OR v_payment.amount > v_prior_balance + 0.01 THEN
    RAISE EXCEPTION 'Monto inválido para complemento: pago=%, saldo previo=%',
      v_payment.amount, v_prior_balance;
  END IF;

  UPDATE public.payments SET
    installment_number = v_installment,
    prior_balance = v_prior_balance
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'installment_number', v_installment,
    'prior_balance', v_prior_balance,
    'credited_amount', v_credited,
    'invoice_id', v_invoice.id,
    'invoice_total', v_invoice.total,
    'invoice_currency', v_invoice.moneda,
    'invoice_exchange', v_invoice.tipo_cambio,
    'invoice_cfdi_uuid', v_invoice.cfdi_uuid,
    'invoice_tax_rate', v_invoice.tax_rate,
    'invoice_metodo_pago', v_invoice.metodo_pago,
    'invoice_cfdi_status', v_invoice.cfdi_status
  );
END;
$function$;

-- A6R2-1: el umbral de aprobacion solo se evaluaba al INSERT
CREATE OR REPLACE FUNCTION public.set_supplier_bill_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold NUMERIC(14,2);
  v_total_mxn NUMERIC(14,2);
  v_old_total_mxn NUMERIC(14,2);
  v_jwt_role text;
  v_has_payments boolean;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  IF v_jwt_role = 'service_role'
     OR v_jwt_role IS NULL
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings ORDER BY created_at ASC LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_total_mxn := CASE
    WHEN NEW.currency = 'MXN' THEN COALESCE(NEW.total, 0)
    ELSE COALESCE(NEW.total, 0) * COALESCE(NEW.exchange_rate, 1)
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Una factura de proveedor no puede nacer en estado de aprobacion %. Registrala pendiente y usa approve_supplier_bill / reject_supplier_bill.', NEW.approval_status
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;

    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_notes := NULL;

    RETURN NEW;
  END IF;

  -- UPDATE: solo interesa si cambio el monto en MXN.
  v_old_total_mxn := CASE
    WHEN OLD.currency = 'MXN' THEN COALESCE(OLD.total, 0)
    ELSE COALESCE(OLD.total, 0) * COALESCE(OLD.exchange_rate, 1)
  END;

  IF v_total_mxn IS NOT DISTINCT FROM v_old_total_mxn
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.supplier_payments sp WHERE sp.supplier_bill_id = NEW.id
  ) INTO v_has_payments;

  IF v_has_payments THEN
    RAISE EXCEPTION 'No se puede cambiar el monto, la moneda o el tipo de cambio: la factura ya tiene pagos registrados.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.approval_status = 'approved' THEN
    RAISE EXCEPTION 'No se puede cambiar el monto de una factura ya aprobada. Recházala y solicita reaprobación antes de editarla.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.approval_status IN ('pending', 'not_required') THEN
    IF v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS set_supplier_bill_approval_status_trg ON public.supplier_bills;
DROP TRIGGER IF EXISTS trg_set_supplier_bill_approval_status ON public.supplier_bills;

CREATE TRIGGER trg_set_supplier_bill_approval_status
BEFORE INSERT OR UPDATE OF total, currency, exchange_rate ON public.supplier_bills
FOR EACH ROW EXECUTE FUNCTION public.set_supplier_bill_approval_status();