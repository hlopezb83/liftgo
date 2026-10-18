CREATE OR REPLACE FUNCTION public.enforce_supplier_payment_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_total numeric(14,2);
  v_status public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_paid_after numeric(14,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('supplier_payment:' || NEW.bill_id::text));
  SELECT total, status, approval_status INTO v_bill_total, v_status, v_approval
    FROM public.supplier_bills WHERE id = NEW.bill_id FOR UPDATE;
  IF v_bill_total IS NULL THEN RAISE EXCEPTION 'Factura de proveedor no encontrada'; END IF;
  IF v_status IN ('cancelled','draft') THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en bills en estado %', v_status USING ERRCODE = 'check_violation';
  END IF;
  IF v_approval IN ('pending','rejected') THEN
    RAISE EXCEPTION 'No se pueden registrar pagos: la bill tiene aprobacion %. Completa el flujo de aprobacion primero.', v_approval
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_after FROM public.supplier_payments WHERE bill_id = NEW.bill_id;
  IF TG_OP = 'INSERT' THEN v_paid_after := v_paid_after + NEW.amount;
  ELSIF TG_OP = 'UPDATE' THEN v_paid_after := v_paid_after - OLD.amount + NEW.amount; END IF;
  IF round(v_paid_after, 2) > v_bill_total THEN
    RAISE EXCEPTION 'El pago excede el saldo pendiente de la bill (total: %, pagado tras esta operacion: %)', v_bill_total, v_paid_after
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_enforce_supplier_payment_balance
 BEFORE INSERT OR UPDATE OF amount, bill_id ON public.supplier_payments
 FOR EACH ROW EXECUTE FUNCTION public.enforce_supplier_payment_balance();
CREATE OR REPLACE FUNCTION public.trg_supplier_payment_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_supplier_bill(OLD.bill_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_supplier_bill(NEW.bill_id);
    IF TG_OP = 'UPDATE' AND OLD.bill_id <> NEW.bill_id THEN
      PERFORM public.recalc_supplier_bill(OLD.bill_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;
CREATE TRIGGER trg_sp_recalc_aiud
 AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
 FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_payment_recalc();
