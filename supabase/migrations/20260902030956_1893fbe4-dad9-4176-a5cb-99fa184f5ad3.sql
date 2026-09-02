-- FIX-3 (ronda 2): al registrar un pago, ligarlo al lote vigente que contiene
-- la factura (si existe). Sin esto, cancel_supplier_payment_batch no puede
-- distinguir pagos DEL lote de abonos previos ajenos.
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(), p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
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
  v_batch_id UUID;
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

  SELECT i.batch_id INTO v_batch_id
    FROM public.supplier_payment_batch_items i
    JOIN public.supplier_payment_batches b ON b.id = i.batch_id
   WHERE i.bill_id = p_bill_id
   ORDER BY b.created_at DESC
   LIMIT 1;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, (select auth.uid()), v_batch_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;