-- FIX R-1: register_supplier_payment usa la fecha local MTY (today_mty())
-- en lugar de CURRENT_DATE (UTC), que cambia de día a las 18:00 CST.
CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT public.today_mty(),
  p_payment_method text DEFAULT NULL, p_bank_account text DEFAULT NULL,
  p_reference text DEFAULT NULL, p_receipt_url text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, (select auth.uid())
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- FIX R-2: el candado de facturas pagadas debe honrar el bypass de recalculo
-- (app.cxp_recalc) que activa recalc_supplier_bill; si no, al borrar uno de
-- varios pagos la factura queda atorada en 'paid'.
CREATE OR REPLACE FUNCTION public.lock_paid_supplier_bill_with_payments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_paid numeric;
BEGIN
  IF current_setting('app.cxp_recalc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'paid'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT COALESCE(SUM(sp.amount), 0) INTO v_paid
    FROM public.supplier_payments sp
    WHERE sp.bill_id = OLD.id;
    IF v_paid > 0 THEN
      RAISE EXCEPTION 'La cuenta tiene pagos registrados por %; elimina o reversa los pagos antes de cambiar su estado.', v_paid
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;