-- DB4-01 (N4-1, ALTO): una bill no puede nacer aprobada/rechazada ni con aprobador precargado.
CREATE OR REPLACE FUNCTION public.set_supplier_bill_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_threshold NUMERIC(14,2);
  v_total_mxn NUMERIC(14,2);
  v_jwt_role text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  IF v_jwt_role = 'service_role'
     OR v_jwt_role IS NULL
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Una factura de proveedor no puede nacer en estado de aprobacion %. Registrala pendiente y usa approve_supplier_bill / reject_supplier_bill.', NEW.approval_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings ORDER BY created_at ASC LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_total_mxn := CASE
    WHEN NEW.currency = 'MXN' THEN COALESCE(NEW.total, 0)
    ELSE COALESCE(NEW.total, 0) * COALESCE(NEW.exchange_rate, 1)
  END;

  IF v_total_mxn > v_threshold THEN
    NEW.approval_status := 'pending';
  ELSE
    NEW.approval_status := 'not_required';
  END IF;

  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  NEW.approval_notes := NULL;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_supplier_bill_approval_status ON public.supplier_bills;
CREATE TRIGGER trg_set_supplier_bill_approval_status
  BEFORE INSERT ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_bill_approval_status();