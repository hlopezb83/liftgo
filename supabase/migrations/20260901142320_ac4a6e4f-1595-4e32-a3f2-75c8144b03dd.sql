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

  -- R9-08: una factura RECHAZADA cuyo monto/moneda/TC se corrige vuelve al
  -- circuito normal de aprobación (nunca se auto-aprueba). Antes quedaba
  -- congelada en 'rejected' y desaparecía de los KPIs/antigüedad de CxP aun
  -- teniendo saldo.
  IF OLD.approval_status IN ('pending', 'not_required', 'rejected') THEN
    IF v_fx_missing OR v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    IF OLD.approval_status = 'rejected' THEN
      NEW.rejected_by := NULL;
      NEW.rejected_at := NULL;
      NEW.approval_notes := NULL;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.request_bill_reapproval(p_bill_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
  v_threshold NUMERIC(14,2);
  v_total NUMERIC(14,2);
  v_currency TEXT;
  v_rate NUMERIC;
  v_total_mxn NUMERIC(14,2);
  v_fx_missing boolean;
  v_new_status public.supplier_bill_approval_status;
BEGIN
  IF NOT (public.has_role((select auth.uid()),'admin'::app_role)
          OR public.has_role((select auth.uid()),'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No tienes permisos para solicitar reaprobación';
  END IF;

  SELECT approval_status, bill_number, total, currency, exchange_rate
    INTO v_status, v_number, v_total, v_currency, v_rate
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'Solo facturas rechazadas pueden re-solicitar aprobación';
  END IF;

  SELECT cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings ORDER BY created_at ASC LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_fx_missing := public.fx_is_missing(v_currency, v_rate);
  v_total_mxn := CASE
    WHEN v_fx_missing THEN NULL
    WHEN upper(COALESCE(v_currency, 'MXN')) = 'MXN' THEN COALESCE(v_total, 0)
    ELSE COALESCE(v_total, 0) * v_rate
  END;

  -- R9-08: la reaprobación aplica la misma decisión que el alta/edición:
  -- pendiente si supera el umbral o falta TC (fail-closed), si no, no requerida.
  IF v_fx_missing OR v_total_mxn > v_threshold THEN
    v_new_status := 'pending';
  ELSE
    v_new_status := 'not_required';
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = v_new_status,
        approved_by = NULL,
        approved_at = NULL,
        rejected_by = NULL,
        rejected_at = NULL,
        approval_notes = NULL,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, (select auth.uid()), 'reapproval_requested', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.reapproval_requested','supplier_bill', p_bill_id,
    'Reaprobación solicitada',
    'Factura ' || COALESCE(v_number,'') || ' enviada nuevamente a aprobación',
    (select auth.uid()));
END $function$;