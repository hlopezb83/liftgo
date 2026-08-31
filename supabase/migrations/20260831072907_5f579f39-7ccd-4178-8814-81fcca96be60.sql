-- A1-5: REP cross-currency. Los pagos se convierten a la moneda de la factura
-- con el mismo CASE canonico de v_invoices_with_balance antes de calcular
-- parcialidad, saldo anterior y el monto del documento relacionado.
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
  v_inv_currency text;
  v_pay_currency text;
  v_rate numeric;
  v_amount_dr numeric;
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

  v_inv_currency := upper(COALESCE(v_invoice.moneda, 'MXN'));
  v_pay_currency := upper(COALESCE(v_payment.currency, v_invoice.moneda, 'MXN'));
  v_rate := COALESCE(NULLIF(v_payment.exchange_rate, 0), NULLIF(v_invoice.tipo_cambio, 0));

  IF v_pay_currency <> v_inv_currency AND COALESCE(v_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'Pago en % sin tipo de cambio para convertir a % (factura %)',
      v_pay_currency, v_inv_currency, v_invoice.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A1-5: monto del pago expresado en la moneda de la factura (MonedaDR).
  v_amount_dr := round(
    CASE
      WHEN v_pay_currency = v_inv_currency THEN v_payment.amount
      WHEN v_pay_currency = 'MXN' THEN v_payment.amount / v_rate
      ELSE v_payment.amount * v_rate
    END::numeric, 2);

  -- A1-5: los pagos previos tambien se convierten antes de acumularse.
  SELECT
    COALESCE(SUM(
      CASE
        WHEN p.rep_cfdi_status = 'stamped' AND p.id <> p_payment_id THEN
          CASE
            WHEN upper(COALESCE(p.currency, v_inv_currency)) = v_inv_currency THEN p.amount
            WHEN upper(COALESCE(p.currency, v_inv_currency)) = 'MXN'
              THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice.tipo_cambio, 0)), 0)
            ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice.tipo_cambio, 0))
          END
        ELSE 0
      END
    ), 0),
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
    round((v_invoice.total - COALESCE(v_prior_paid, 0) - v_credited)::numeric, 2), 0
  );

  IF v_amount_dr <= 0 OR v_amount_dr > v_prior_balance + 0.01 THEN
    RAISE EXCEPTION 'Monto inválido para complemento: pago=% %, saldo previo=% %',
      v_amount_dr, v_inv_currency, v_prior_balance, v_inv_currency;
  END IF;

  UPDATE public.payments SET
    installment_number = v_installment,
    prior_balance = v_prior_balance
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'installment_number', v_installment,
    'prior_balance', v_prior_balance,
    'credited_amount', v_credited,
    -- A1-5: monto ya convertido a la moneda de la factura (MonedaDR).
    'amount_in_invoice_currency', v_amount_dr,
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