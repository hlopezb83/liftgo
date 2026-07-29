-- DB2-08: credit_notes con validación aritmética y de signo.
CREATE OR REPLACE FUNCTION public.validate_credit_note_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.subtotal   := round(COALESCE(NEW.subtotal, 0), 2);
  NEW.tax_amount := round(COALESCE(NEW.tax_amount, 0), 2);
  NEW.total      := round(COALESCE(NEW.total, 0), 2);

  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.subtotal <= 0 OR NEW.total <= 0 OR NEW.tax_amount < 0 THEN
    RAISE EXCEPTION 'Los montos de la nota de credito deben ser positivos (subtotal=%, tax_amount=%, total=%)',
      NEW.subtotal, NEW.tax_amount, NEW.total USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.subtotal + NEW.tax_amount <> NEW.total THEN
    RAISE EXCEPTION 'La nota de credito no cuadra: subtotal (%) + tax_amount (%) <> total (%)',
      NEW.subtotal, NEW.tax_amount, NEW.total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_credit_note_totals ON public.credit_notes;
CREATE TRIGGER trg_validate_credit_note_totals
  BEFORE INSERT OR UPDATE OF subtotal, tax_amount, total, status ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_credit_note_totals();

-- DB2-09: pagos a proveedores exigen aprobación.
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

-- DB2-10: entregas, "no pasado" también en UPDATE.
DROP TRIGGER IF EXISTS trg_delivery_not_in_past ON public.deliveries;
CREATE TRIGGER trg_delivery_not_in_past
  BEFORE INSERT OR UPDATE OF scheduled_date ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_not_in_past();

-- DB2-11: rescate de cotizaciones vencidas exige nueva vigencia.
CREATE OR REPLACE FUNCTION public.guard_quote_expired_rescue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'expired' AND NEW.status = 'draft' THEN
    IF NEW.valid_until IS NULL OR NEW.valid_until < current_date THEN
      RAISE EXCEPTION 'Para rescatar una cotizacion vencida debes fijar una nueva vigencia (valid_until futura) en el mismo movimiento.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'sent'
     AND NEW.valid_until IS NOT NULL AND NEW.valid_until < current_date THEN
    RAISE EXCEPTION 'No se puede enviar una cotizacion con vigencia vencida (valid_until=%). Actualiza precios y vigencia.', NEW.valid_until
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_quote_expired_rescue ON public.quotes;
CREATE TRIGGER trg_guard_quote_expired_rescue
  BEFORE UPDATE OF status, valid_until ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_expired_rescue();

CREATE OR REPLACE FUNCTION public.guard_quote_valid_until()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
    IF OLD.status = 'expired' AND NEW.status = 'draft'
       AND NEW.valid_until IS NOT NULL AND NEW.valid_until >= current_date THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'No se puede modificar valid_until de una cotizacion en estado %. Crea una version nueva o regresala a draft.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;