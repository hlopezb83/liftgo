-- FIX-1 (ronda 3): corrige regresión de la ronda 2 — la rama de pagos con REP
-- cancelado devolvía el monto convertido (idéntica al ELSE). Un pago cuyo REP
-- fue cancelado NO reduce ImpSaldoAnt.
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

  -- FIX-1 (ronda 3): el saldo anterior descuenta TODOS los pagos vigentes;
  -- un pago con REP CANCELADO contribuye 0 (su dinero vuelve a estar sin
  -- declarar y el re-timbrado parte del saldo completo previo a ese pago).
  SELECT
    COALESCE(SUM(
      CASE
        WHEN p.id = p_payment_id THEN 0
        WHEN p.rep_cfdi_status = 'cancelled' AND p.rep_cancelled_at IS NOT NULL THEN 0
        ELSE
          CASE
            WHEN upper(COALESCE(p.currency, v_inv_currency)) = v_inv_currency THEN p.amount
            WHEN upper(COALESCE(p.currency, v_inv_currency)) = 'MXN'
              THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice.tipo_cambio, 0)), 0)
            ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice.tipo_cambio, 0))
          END
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN p.id = p_payment_id THEN 0
        WHEN p.rep_cfdi_status = 'stamped' AND p.rep_cancelled_at IS NULL THEN 1
        ELSE 0
      END
    ), 0)
  INTO v_prior_paid, v_prior_emissions
  FROM public.payments p
  WHERE p.invoice_id = v_invoice.id;

  -- 2A-4: criterio canonico de NC (mismo que v_invoices_with_balance).
  SELECT COALESCE(SUM(cn.total), 0) INTO v_credited
    FROM public.credit_notes cn
   WHERE cn.invoice_id = v_invoice.id
     AND cn.cfdi_status = 'stamped'
     AND COALESCE(cn.status, '') <> 'cancelled'
     AND COALESCE(cn.cancellation_status, '') <> 'accepted';

  -- Re-timbrado de un REP cancelado: se conserva la parcialidad original.
  IF v_payment.rep_cancelled_at IS NOT NULL AND v_payment.installment_number IS NOT NULL THEN
    v_installment := v_payment.installment_number;
  ELSE
    v_installment := v_prior_emissions + 1;
  END IF;

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

-- FIX-2 (ronda 3): la ligadura pago↔lote es EXPLÍCITA.
CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_payment_date date DEFAULT today_mty(),
  p_payment_method text DEFAULT NULL::text,
  p_bank_account text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text,
  p_receipt_url text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_batch_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
BEGIN
  IF NOT (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval = 'pending' THEN
    RAISE EXCEPTION 'La factura requiere aprobación antes de pagar';
  END IF;
  IF v_approval = 'rejected' THEN
    RAISE EXCEPTION 'La factura fue rechazada y no puede pagarse';
  END IF;
  -- M-15: sin tolerancia de +0.01 en el rechazo de sobrepago.
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  IF p_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items
     WHERE batch_id = p_batch_id AND bill_id = p_bill_id
  ) THEN
    RAISE EXCEPTION 'El lote % no contiene la factura %', p_batch_id, p_bill_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, (select auth.uid()), p_batch_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.register_supplier_payment(uuid, numeric, date, text, text, text, text, text, uuid) TO authenticated;