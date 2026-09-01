-- R8-10: la aprobación de facturas de proveedor debe fallar en seguro cuando
-- falta el tipo de cambio en moneda extranjera (regla canónica public.fx_is_missing).
CREATE OR REPLACE FUNCTION public.set_supplier_bill_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold NUMERIC(14,2);
  v_total_mxn NUMERIC(14,2);
  v_old_total_mxn NUMERIC(14,2);
  v_fx_missing boolean;
  v_old_fx_missing boolean;
  v_jwt_role text;
  v_has_payments boolean;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  IF v_jwt_role = 'service_role'
     OR v_jwt_role IS NULL
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings ORDER BY created_at ASC LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_fx_missing := public.fx_is_missing(NEW.currency, NEW.exchange_rate);

  -- Sin tipo de cambio válido no se inventa total en MXN.
  v_total_mxn := CASE
    WHEN v_fx_missing THEN NULL
    WHEN upper(COALESCE(NEW.currency, 'MXN')) = 'MXN' THEN COALESCE(NEW.total, 0)
    ELSE COALESCE(NEW.total, 0) * NEW.exchange_rate
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Una factura de proveedor no puede nacer en estado de aprobacion %. Registrala pendiente y usa approve_supplier_bill / reject_supplier_bill.', NEW.approval_status
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_fx_missing OR v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;

    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_notes := NULL;

    RETURN NEW;
  END IF;

  -- UPDATE: solo interesa si cambio el monto en MXN, la moneda o la validez del TC.
  v_old_fx_missing := public.fx_is_missing(OLD.currency, OLD.exchange_rate);
  v_old_total_mxn := CASE
    WHEN v_old_fx_missing THEN NULL
    WHEN upper(COALESCE(OLD.currency, 'MXN')) = 'MXN' THEN COALESCE(OLD.total, 0)
    ELSE COALESCE(OLD.total, 0) * OLD.exchange_rate
  END;

  IF v_total_mxn IS NOT DISTINCT FROM v_old_total_mxn
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND v_fx_missing IS NOT DISTINCT FROM v_old_fx_missing THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = NEW.id
  ) INTO v_has_payments;

  IF v_has_payments THEN
    RAISE EXCEPTION 'No se puede cambiar el monto, la moneda o el tipo de cambio: la factura ya tiene pagos registrados.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.approval_status = 'approved' THEN
    RAISE EXCEPTION 'No se puede cambiar el monto de una factura ya aprobada. Recházala y solicita reaprobación antes de editarla.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.approval_status IN ('pending', 'not_required') THEN
    IF v_fx_missing OR v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END $function$;