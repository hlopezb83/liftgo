-- Evidence fixture only; exact catalog definitions supplied by parent, plus repository helper definitions.
-- CURRENT CATALOG: fx_is_missing
CREATE OR REPLACE FUNCTION public.fx_is_missing(p_currency text, p_rate numeric)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT upper(COALESCE(p_currency, 'MXN')) <> 'MXN'
     AND (p_rate IS NULL OR p_rate <= 0 OR p_rate = 1);
$function$
 ;

-- CURRENT CATALOG: fx_convert_amount
CREATE OR REPLACE FUNCTION public.fx_convert_amount(p_amount numeric, p_from text, p_to text, p_from_rate numeric, p_to_rate numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL THEN NULL
    WHEN upper(COALESCE(p_from, 'MXN')) = upper(COALESCE(p_to, 'MXN')) THEN round(p_amount, 2)
    WHEN public.fx_is_missing(p_from, p_from_rate) OR public.fx_is_missing(p_to, p_to_rate) THEN NULL
    ELSE round(
      p_amount
      * CASE WHEN upper(COALESCE(p_from, 'MXN')) = 'MXN' THEN 1 ELSE p_from_rate END
      / CASE WHEN upper(COALESCE(p_to, 'MXN')) = 'MXN' THEN 1 ELSE p_to_rate END
    , 2)
  END;
$function$
 ;

-- CURRENT CATALOG: enforce_payment_matches_invoice_currency
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
  SELECT COALESCE(moneda, 'MXN'), tipo_cambio
    INTO inv_currency, inv_tc
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  IF inv_currency IS NULL THEN
    RETURN NEW;
  END IF;

  pay_currency := COALESCE(NEW.currency, 'MXN');

  IF pay_currency <> inv_currency THEN
    -- R5-01 / R6-16: cruce permitido solo si hay conversion disponible.
    IF COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0)) IS NULL THEN
      RAISE EXCEPTION
        'Pago en % no coincide con la divisa de la factura (%) y no hay tipo de cambio para la conversión.',
        pay_currency, inv_currency
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
 ;

-- CURRENT CATALOG: enforce_payment_within_invoice_total
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
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_payment:' || NEW.invoice_id::text));
  SELECT total, status, moneda, tipo_cambio, metodo_pago, cfdi_status
    INTO inv_total, inv_status, inv_moneda, inv_tc, inv_metodo, inv_cfdi
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

  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, inv_moneda)) = inv_moneda THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(inv_tc, 0)), 0)
        ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(inv_tc, 0))
      END), 0) INTO total_paid
  FROM public.payments p
  WHERE p.invoice_id = NEW.invoice_id
    AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

  new_amount := CASE
    WHEN upper(COALESCE(NEW.currency, inv_moneda)) = inv_moneda THEN NEW.amount
    WHEN upper(COALESCE(NEW.currency, 'MXN')) = 'MXN'
      THEN NEW.amount / NULLIF(COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0)), 0)
    ELSE NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0))
  END;
  IF new_amount IS NULL THEN
    RAISE EXCEPTION
      'No se puede verificar el sobrepago: falta tipo de cambio para convertir el pago (%) a la moneda de la factura (%)',
      upper(COALESCE(NEW.currency, 'MXN')), inv_moneda
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO credited
  FROM public.credit_notes
  WHERE invoice_id = NEW.invoice_id
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
$function$
 ;

-- CURRENT CATALOG: prevent_payment_mutation_when_rep_stamped
CREATE OR REPLACE FUNCTION public.prevent_payment_mutation_when_rep_stamped()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.rep_cfdi_status = 'stamped' AND (
    NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.payment_form_sat IS DISTINCT FROM OLD.payment_form_sat
    OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
    OR NEW.prior_balance IS DISTINCT FROM OLD.prior_balance
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar los campos fiscales de un pago con REP timbrado. Cancele el complemento primero.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$
 ;

-- SOURCE: supabase/migrations/20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql
CREATE OR REPLACE FUNCTION public.fx_to_mxn(p_amount numeric, p_currency text, p_rate numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL THEN NULL
    WHEN upper(COALESCE(p_currency, 'MXN')) = 'MXN' THEN round(p_amount, 2)
    WHEN public.fx_is_missing(p_currency, p_rate) THEN NULL
    ELSE round(p_amount * p_rate, 2)
  END;
$function$;

-- SOURCE: supabase/migrations/20260828003501_74cee74b-b737-4869-866b-ebba4e5a57ef.sql
CREATE OR REPLACE FUNCTION public.trg_payment_amount_mxn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_moneda text;
  v_tipo_cambio numeric;
  v_pay_currency text;
BEGIN
  SELECT i.moneda, i.tipo_cambio INTO v_moneda, v_tipo_cambio
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;
  v_moneda := upper(COALESCE(v_moneda, 'MXN'));
  v_pay_currency := upper(COALESCE(NEW.currency, v_moneda));

  IF v_pay_currency = 'MXN' THEN
    NEW.amount_mxn := ROUND(COALESCE(NEW.amount, 0), 2);
  ELSIF v_pay_currency <> v_moneda THEN
    -- R6-07: cruce permitido si hay tipo de cambio disponible (R5-01).
    IF COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(v_tipo_cambio, 0)) IS NULL THEN
      RAISE EXCEPTION
        'Pago en % no coincide con la moneda de la factura (%) y no hay tipo de cambio para convertirlo',
        v_pay_currency, v_moneda
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.amount_mxn := ROUND(
      NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(v_tipo_cambio, 0)),
      2
    );
  ELSE
    NEW.amount_mxn := ROUND(
      COALESCE(NEW.amount, 0) * COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(v_tipo_cambio, 0)),
      2
    );
  END IF;
  RETURN NEW;
END;
$$;

-- SOURCE: supabase/migrations/20260828003501_74cee74b-b737-4869-866b-ebba4e5a57ef.sql
CREATE OR REPLACE FUNCTION public.sync_invoice_status_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_invoice_status(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- SOURCE: drizzle/migrations/0041_multi_org_supplier_damage_rpc_org_guard.sql
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

  -- R4-15: pagos convertidos a la moneda de la factura (ver FIX R4-03).
  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_moneda)) = v_moneda THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)), 0)
        ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0))
      END), 0), MAX(p.payment_date)
    INTO v_paid, v_latest_date
  FROM public.payments p
  WHERE p.invoice_id = v_invoice_id
    AND COALESCE(p.organization_id, v_invoice_org) = v_invoice_org;

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

-- SOURCE: supabase/migrations/20260723055526_12338475-a680-484b-b228-725025c63998.sql
CREATE OR REPLACE FUNCTION public.prevent_payment_delete_when_rep_stamped()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.rep_cfdi_status = 'stamped' THEN
    RAISE EXCEPTION 'No se puede eliminar un pago con REP timbrado. Cancele el complemento primero.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

-- SOURCE: supabase/migrations/20260729210413_2c933283-5d2b-402d-9f2e-c72814a48147.sql
CREATE OR REPLACE FUNCTION public.round_payment_amount()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.amount IS NOT NULL THEN
    NEW.amount := round(NEW.amount, 2);
  END IF;
  RETURN NEW;
END; $$;

-- SOURCE: supabase/migrations/20260825221855_f022c962-9282-439a-a4c8-4d4dc799d9f1.sql
CREATE OR REPLACE FUNCTION public.trg_payment_date_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_issued_at date;
BEGIN
  IF NEW.payment_date > public.today_mty() + 7 THEN
    RAISE EXCEPTION
      'payment_date % no puede estar más de 7 días en el futuro.',
      NEW.payment_date
      USING ERRCODE = 'raise_exception';
  END IF;
  SELECT i.issued_at INTO v_issued_at
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;
  IF v_issued_at IS NOT NULL AND NEW.payment_date < v_issued_at THEN
    RAISE EXCEPTION
      'payment_date % no puede ser anterior a la fecha de emisión de la factura (%).',
      NEW.payment_date, v_issued_at
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

-- SOURCE: supabase/migrations/20260731235443_7b2ca674-f6e0-4b98-95b9-1039fa28abfb.sql
CREATE OR REPLACE FUNCTION public.today_mty()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'America/Monterrey')::date $$;

-- SOURCE: drizzle/migrations/0016_multi_org_phase6_numbering_fiscal_scope.sql
CREATE OR REPLACE FUNCTION public.trg_guard_payment_fiscal_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.guard_fiscal_period_open(
    NEW.payment_date,
    'payments.payment_date',
    NEW.organization_id
  );
  RETURN NEW;
END;
$function$;

-- SOURCE: drizzle/migrations/0016_multi_org_phase6_numbering_fiscal_scope.sql
CREATE OR REPLACE FUNCTION public.guard_fiscal_period_open(
  _date date,
  _table_name text,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF _date IS NULL THEN
    RETURN;
  END IF;

  v_organization_id := COALESCE(
    p_organization_id,
    public.resolve_organization_context()
  );

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    WHERE fp.organization_id = v_organization_id
      AND fp.period = to_char(_date, 'YYYY-MM')
      AND fp.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'El periodo fiscal % está cerrado; no se pueden registrar fechas en % dentro de ese periodo.',
      to_char(_date, 'YYYY-MM'), _table_name
      USING ERRCODE = 'raise_exception';
  END IF;
END;
$function$;
