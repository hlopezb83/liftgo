CREATE OR REPLACE FUNCTION public.guard_supplier_payment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_bill_status public.supplier_bill_status;
BEGIN
  -- Procesos internos (service_role, tareas programadas) y sembrado E2E
  -- conservan el comportamiento actual: misma convención que
  -- public.validate_prospect_close().
  IF v_uid IS NULL OR coalesce(current_setting('app.e2e_seed', true), '') = 'on' THEN
    RETURN OLD;
  END IF;

  -- La UI ya expone "Eliminar pago" sólo a admin; aquí queda como regla real.
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar un pago a proveedor'
      USING ERRCODE = '42501';
  END IF;

  -- REP fiscal ya recibido del proveedor: el pago respalda un CFDI recibido.
  IF OLD.rep_status = 'received' THEN
    RAISE EXCEPTION 'No puedes eliminar este pago: ya se registró el REP fiscal recibido del proveedor'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.bill_id IS NOT NULL THEN
    SELECT sb.status INTO v_bill_status
      FROM public.supplier_bills sb
     WHERE sb.id = OLD.bill_id;

    IF v_bill_status = 'cancelled'::public.supplier_bill_status THEN
      RAISE EXCEPTION 'No puedes eliminar este pago: la factura de proveedor está cancelada'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_supplier_payment_delete ON public.supplier_payments;

CREATE TRIGGER trg_guard_supplier_payment_delete
BEFORE DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_payment_delete();