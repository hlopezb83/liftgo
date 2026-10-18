-- N7/N8: canonical per-payment invoice-currency cents. Forward-only.
-- No GRANT/REVOKE, data rewrite, REP bypass or change of function ownership.
-- Requires existing canonical fx_convert_amount and the current org-scoped schema.

CREATE OR REPLACE FUNCTION public.enforce_payment_within_invoice_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv_total NUMERIC;
  inv_status TEXT;
  inv_metodo TEXT;
  inv_cfdi TEXT;
  inv_moneda TEXT;
  inv_tc NUMERIC;
  total_paid NUMERIC;
  new_amount NUMERIC;
  credited NUMERIC;
  payable NUMERIC;
  inv_org uuid;
  has_missing_fx boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_payment:' || NEW.invoice_id::text));
  SELECT total, status, moneda, tipo_cambio, metodo_pago, cfdi_status, organization_id
    INTO inv_total, inv_status, inv_moneda, inv_tc, inv_metodo, inv_cfdi, inv_org
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF inv_total IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found for payment', NEW.invoice_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF inv_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas canceladas'
      USING ERRCODE = 'check_violation';
  END IF;

  IF inv_status = 'draft' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas en borrador. Envia la factura primero.'
      USING ERRCODE = 'check_violation';
  END IF;

  inv_moneda := upper(COALESCE(inv_moneda, 'MXN'));

  -- Match the persisted source cents: the legacy rounding trigger sorts later.
  SELECT COALESCE(SUM(public.fx_convert_amount(p.amount, COALESCE(p.currency, inv_moneda, 'MXN'), inv_moneda, NULLIF(p.exchange_rate, 0), NULLIF(inv_tc, 0))), 0),
         COALESCE(bool_or(public.fx_convert_amount(p.amount, COALESCE(p.currency, inv_moneda, 'MXN'), inv_moneda, NULLIF(p.exchange_rate, 0), NULLIF(inv_tc, 0)) IS NULL), false)
    INTO total_paid, has_missing_fx
  FROM public.payments p
  WHERE p.invoice_id = NEW.invoice_id
    AND COALESCE(p.organization_id, inv_org) = inv_org
    AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

  new_amount := public.fx_convert_amount(round(NEW.amount, 2), COALESCE(NEW.currency, inv_moneda, 'MXN'),
    inv_moneda, NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0));
  IF new_amount IS NULL OR has_missing_fx THEN
    RAISE EXCEPTION 'No se puede verificar el sobrepago: falta un tipo de cambio valido para el pago o pagos existentes'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO credited
  FROM public.credit_notes
  WHERE invoice_id = NEW.invoice_id
    AND COALESCE(organization_id, inv_org) = inv_org
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  total_paid := total_paid + new_amount;
  payable := inv_total - credited;

  IF total_paid > payable THEN
    RAISE EXCEPTION
      'Sobrepago rechazado: la suma de pagos (%) excede el saldo facturable (%) despues de notas de credito',
      round(total_paid, 2), round(payable, 2)
      USING ERRCODE = 'check_violation',
            HINT = 'Reduce el monto del pago o cancela pagos previos antes de registrar uno nuevo.';
  END IF;

  IF upper(COALESCE(inv_metodo, '')) = 'PUE'
     AND COALESCE(inv_cfdi, '') = 'stamped'
     AND round(total_paid, 2) < round(payable, 2) - 0.01 THEN
    RAISE EXCEPTION
      'Pago parcial rechazado: la factura esta timbrada como PUE (pago en una sola exhibicion) y debe liquidarse completa (saldo facturable: %)',
      round(payable, 2)
      USING ERRCODE = 'check_violation',
            HINT = 'Registra el pago por el saldo total o retimbra la factura como PPD.';
  END IF;

  RETURN NEW;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sync_invoice_status(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_invoice_id uuid;
  v_invoice_org uuid;
  v_total numeric(14,2);
  v_status text;
  v_paid numeric(14,2);
  v_credited numeric(14,2);
  v_latest_date date;
  v_due date;
  v_target text;
  v_moneda text;
  v_tc numeric;
  v_missing_fx boolean;
BEGIN
  v_invoice_id := p_invoice_id;
  IF v_invoice_id IS NULL THEN
    RETURN;
  END IF;

  IF v_uid IS NOT NULL AND public.is_internal_member(v_uid) THEN
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT total, status, due_date, moneda, tipo_cambio, organization_id
    INTO v_total, v_status, v_due, v_moneda, v_tc, v_invoice_org
  FROM public.invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN;
  END IF;

  -- Llamada directa desde una sesión interna: sólo su propia organización.
  IF v_org IS NOT NULL AND v_invoice_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status IN ('cancelled', 'draft') THEN
    RETURN;
  END IF;

  v_moneda := upper(COALESCE(v_moneda, 'MXN'));

  -- Same per-payment conversion/rounding as v_invoices_with_balance.
  SELECT COALESCE(SUM(public.fx_convert_amount(p.amount, COALESCE(p.currency, v_moneda, 'MXN'), v_moneda, NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0))), 0), MAX(p.payment_date),
         COALESCE(bool_or(public.fx_convert_amount(p.amount, COALESCE(p.currency, v_moneda, 'MXN'), v_moneda, NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)) IS NULL), false)
    INTO v_paid, v_latest_date, v_missing_fx
  FROM public.payments p
  WHERE p.invoice_id = v_invoice_id
    AND COALESCE(p.organization_id, v_invoice_org) = v_invoice_org;

  -- Unknown money must not manufacture a paid status. Leave it unchanged so
  -- non-fiscal notes and repair/deletion of legacy bad-FX payments remain possible.
  IF v_missing_fx THEN RETURN; END IF;

  -- N-21 / R4-15: criterio canónico de NC (mismo que la vista y la UI).
  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM public.credit_notes
  WHERE invoice_id = v_invoice_id
    AND COALESCE(organization_id, v_invoice_org) = v_invoice_org
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  PERFORM set_config('app.payment_sync', 'on', true);

  IF v_paid >= v_total - v_credited - 0.005 AND v_paid > 0 THEN
    IF v_status <> 'paid' THEN
      UPDATE public.invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  -- R4-16: cubierta al 100% por NC timbrada(s) => 'paid'.
  ELSIF v_paid = 0 AND v_credited >= v_total - 0.005 THEN
    IF v_status <> 'paid' THEN
      UPDATE public.invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  ELSIF v_paid = 0 AND v_credited > 0 THEN
    IF v_status = 'paid' THEN
      -- R5-15: la factura deja de estar pagada (NC parcial sin pagos).
      v_target := CASE
        WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
        ELSE 'sent'
      END;
      UPDATE public.invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    ELSIF v_status <> 'partial' THEN
      -- R5-15: NC parcial sin pagos y no estaba 'paid' => 'partial'.
      UPDATE public.invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSIF (v_paid + v_credited) > 0 THEN
    IF v_status <> 'partial' THEN
      UPDATE public.invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSE
    v_target := CASE
      WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
      ELSE 'sent'
    END;
    IF v_status <> v_target THEN
      UPDATE public.invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  END IF;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_invoice_status_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
  v_invoice_currency text;
  v_paid numeric := 0;
  v_credited numeric := 0;
  v_remaining numeric := 0;
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    v_invoice_currency := upper(COALESCE(NEW.moneda, 'MXN'));

    IF EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.invoice_id = NEW.id
        AND COALESCE(p.organization_id, NEW.organization_id) = NEW.organization_id
        AND public.fx_convert_amount(p.amount, COALESCE(p.currency, v_invoice_currency, 'MXN'), v_invoice_currency, NULLIF(p.exchange_rate, 0), NULLIF(NEW.tipo_cambio, 0)) IS NULL
    ) THEN
      RAISE EXCEPTION 'No se puede marcar la factura como pagada: hay pagos sin tipo de cambio valido.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(SUM(public.fx_convert_amount(p.amount, COALESCE(p.currency, v_invoice_currency, 'MXN'), v_invoice_currency, NULLIF(p.exchange_rate, 0), NULLIF(NEW.tipo_cambio, 0))), 0)
      INTO v_paid FROM public.payments p
    WHERE p.invoice_id = NEW.id
      AND COALESCE(p.organization_id, NEW.organization_id) = NEW.organization_id;

    SELECT COALESCE(SUM(cn.total), 0)
    INTO v_credited
    FROM public.credit_notes cn
    WHERE cn.invoice_id = NEW.id
      AND COALESCE(cn.organization_id, NEW.organization_id) = NEW.organization_id
      AND cn.cfdi_status = 'stamped'
      AND cn.status <> 'cancelled'
      AND cn.cancellation_status IS DISTINCT FROM 'accepted';

    v_remaining := GREATEST(
      COALESCE(NEW.total, 0) - COALESCE(v_paid, 0) - COALESCE(v_credited, 0),
      0
    );

    IF v_remaining > 0.005 THEN
      RAISE EXCEPTION
        'No se puede marcar la factura como pagada: saldo pendiente % (total %, pagos %, notas de crédito %). Registra el pago restante.',
        round(v_remaining, 2), round(NEW.total, 2), round(v_paid, 2), round(v_credited, 2)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF current_setting('app.sat_flow', true) IS DISTINCT FROM 'on' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
      IF NEW.cancellation_reason IS NULL OR btrim(NEW.cancellation_reason) = '' THEN
        RAISE EXCEPTION
          'Cancelar una factura requiere un motivo (cancellation_reason). Las facturas timbradas se cancelan por el flujo SAT.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.enforce_credit_note_max()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_total numeric;
  v_already_credited numeric;
  v_rep_backed numeric;
  v_max_creditable numeric;
  v_inv_moneda text;
  v_inv_tc numeric;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT total, upper(COALESCE(moneda, 'MXN')), tipo_cambio
    INTO v_invoice_total, v_inv_moneda, v_inv_tc
    FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_invoice_total IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_already_credited
    FROM credit_notes
   WHERE invoice_id = NEW.invoice_id
     AND status <> 'cancelled'
     AND cancellation_status <> 'accepted'
     AND id <> NEW.id;

  -- Fail-closed: sin tipo de cambio no se puede calcular el tope.
  IF EXISTS (
    SELECT 1 FROM payments p
     WHERE p.invoice_id = NEW.invoice_id
       AND p.rep_cfdi_status = 'stamped'
       AND p.rep_cancelled_at IS NULL
       AND public.fx_convert_amount(p.amount, COALESCE(p.currency, v_inv_moneda, 'MXN'), v_inv_moneda, NULLIF(p.exchange_rate, 0), NULLIF(v_inv_tc, 0)) IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay pagos con REP timbrado sin tipo de cambio valido; captura el tipo de cambio antes de emitir la nota de credito.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Keep the existing live-REP cap; only its conversion becomes canonical.
  SELECT COALESCE(SUM(public.fx_convert_amount(p.amount, COALESCE(p.currency, v_inv_moneda, 'MXN'), v_inv_moneda, NULLIF(p.exchange_rate, 0), NULLIF(v_inv_tc, 0))), 0) INTO v_rep_backed
    FROM payments p
   WHERE p.invoice_id = NEW.invoice_id
     AND p.rep_cfdi_status = 'stamped'
     AND p.rep_cancelled_at IS NULL;

  v_rep_backed := round(COALESCE(v_rep_backed, 0), 2);
  v_max_creditable := round(v_invoice_total - v_rep_backed, 2);

  IF round(v_already_credited + NEW.total, 2) > v_invoice_total THEN
    RAISE EXCEPTION 'La suma de notas de credito (% + % = %) excede el total de la factura (%). Cancela o reduce alguna NC existente.',
      v_already_credited, NEW.total, v_already_credited + NEW.total, v_invoice_total USING ERRCODE = 'P0001';
  END IF;

  IF v_rep_backed > 0 AND round(v_already_credited + NEW.total, 2) > v_max_creditable THEN
    RAISE EXCEPTION 'La nota de credito (% + % = %) excede el maximo acreditable (%): el total de la factura es % y % ya estan declarados en complementos de pago (REP) timbrados. Cancela los REP ante el SAT antes de emitir esta NC.',
      v_already_credited, NEW.total, round(v_already_credited + NEW.total, 2), v_max_creditable,
      v_invoice_total, v_rep_backed USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.enforce_payment_matches_invoice_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv_currency text;
  inv_tc numeric;
  pay_currency text;
BEGIN
  SELECT upper(COALESCE(moneda, 'MXN')), tipo_cambio
    INTO inv_currency, inv_tc
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  IF inv_currency IS NULL THEN
    RETURN NEW;
  END IF;

  pay_currency := upper(COALESCE(NEW.currency, inv_currency, 'MXN'));

  IF pay_currency <> inv_currency THEN
    -- R5-01 / R6-16: cruce permitido solo si hay conversion disponible.
    IF public.fx_convert_amount(round(NEW.amount, 2), pay_currency, inv_currency, NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0)) IS NULL THEN
      RAISE EXCEPTION
        'Pago en % no coincide con la divisa de la factura (%) y no hay tipo de cambio para la conversión.',
        pay_currency, inv_currency
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE TRIGGER trg_enforce_payment_within_invoice_total
BEFORE INSERT OR UPDATE OF amount, invoice_id, currency, exchange_rate ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_within_invoice_total();
