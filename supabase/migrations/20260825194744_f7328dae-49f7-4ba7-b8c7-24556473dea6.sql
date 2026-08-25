-- ============================================================================
-- C-2: candado de facturas timbradas. Una factura con cfdi_uuid cuya
-- cancelación NO fue aceptada es inmutable en sus campos fiscales.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lock_stamped_invoice_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.cfdi_uuid IS NOT NULL
     AND OLD.cancellation_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'La factura está timbrada (CFDI %); cancela el CFDI antes de modificar líneas, montos o fecha de emisión.', OLD.cfdi_uuid
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lock_stamped_invoice_edits ON public.invoices;
CREATE TRIGGER trg_lock_stamped_invoice_edits
  BEFORE UPDATE OF line_items, subtotal, tax_amount, tax_rate, total, issued_at
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.lock_stamped_invoice_edits();

-- ============================================================================
-- H-7: una CxP pagada con supplier_payments (SUM(amount) > 0) no puede salir
-- de 'paid'. Complementa validate_transition sin excepción de rol.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lock_paid_supplier_bill_with_payments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_paid numeric;
BEGIN
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

DROP TRIGGER IF EXISTS trg_lock_paid_supplier_bill ON public.supplier_bills;
CREATE TRIGGER trg_lock_paid_supplier_bill
  BEFORE UPDATE ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.lock_paid_supplier_bill_with_payments();