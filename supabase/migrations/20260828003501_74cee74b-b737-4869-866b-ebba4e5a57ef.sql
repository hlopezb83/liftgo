CREATE OR REPLACE FUNCTION public.sync_invoice_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
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

  SELECT total, status, due_date, moneda, tipo_cambio
    INTO v_total, v_status, v_due, v_moneda, v_tc
  FROM invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN;
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
  FROM payments p WHERE p.invoice_id = v_invoice_id;

  -- N-21 / R4-15: criterio canonico de NC (mismo que la vista y la UI).
  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM credit_notes
  WHERE invoice_id = v_invoice_id
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  PERFORM set_config('app.payment_sync', 'on', true);

  IF v_paid >= v_total - v_credited - 0.005 AND v_paid > 0 THEN
    IF v_status <> 'paid' THEN
      UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  -- R4-16: cubierta al 100% por NC timbrada(s) => 'paid'.
  ELSIF v_paid = 0 AND v_credited >= v_total - 0.005 THEN
    IF v_status <> 'paid' THEN
      UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  ELSIF v_paid = 0 AND v_credited > 0 THEN
    IF v_status = 'paid' THEN
      -- R5-15: la factura deja de estar pagada (NC parcial sin pagos).
      v_target := CASE
        WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
        ELSE 'sent'
      END;
      UPDATE invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    ELSIF v_status <> 'partial' THEN
      -- R5-15: NC parcial sin pagos y no estaba 'paid' => 'partial'.
      UPDATE invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSIF (v_paid + v_credited) > 0 THEN
    IF v_status <> 'partial' THEN
      UPDATE invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSE
    v_target := CASE
      WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
      ELSE 'sent'
    END;
    IF v_status <> v_target THEN
      UPDATE invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_invoice_status(uuid) FROM PUBLIC, anon;

-- R6-01: el trigger de payments ahora solo resuelve el invoice_id afectado
-- (NEW/OLD) y delega en el helper.
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

-- R6-01: idem para credit_notes (antes llamaba a la funcion trigger de
-- payments directamente -> trigger_protocol_violated).
CREATE OR REPLACE FUNCTION public.sync_invoice_status_from_credit_notes()
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

DROP TRIGGER IF EXISTS trg_sync_invoice_from_credit_notes ON public.credit_notes;
CREATE TRIGGER trg_sync_invoice_from_credit_notes
AFTER INSERT OR DELETE OR UPDATE OF status, total, cfdi_status, cancellation_status ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_status_from_credit_notes();

-- FIX R6-07
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

-- FIX R6-16
DROP TRIGGER IF EXISTS trg_payments_currency_matches_invoice ON public.payments;

CREATE OR REPLACE FUNCTION public.enforce_payment_matches_invoice_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE TRIGGER trg_payments_currency_matches_invoice
BEFORE INSERT OR UPDATE OF currency, invoice_id, exchange_rate, amount ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payment_matches_invoice_currency();