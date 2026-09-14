-- =====================================================================
-- Multi-organización · Fase 6.3 (umbral de aprobación CxP)
--
-- El umbral de aprobación de facturas de proveedor pertenece a cada
-- organización. El trigger toma el umbral de la misma organización de la
-- factura en vez de la primera fila global de company_settings.
-- =====================================================================

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

  -- R10-02: `current_user` es fiable aquí porque esta función NO es SECURITY
  -- DEFINER: PostgREST hace SET ROLE service_role para el rol de servicio.
  IF v_jwt_role = 'service_role'
     OR current_user = 'service_role'
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT cs.cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings cs
   WHERE cs.organization_id = NEW.organization_id
   LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_fx_missing := public.fx_is_missing(NEW.currency, NEW.exchange_rate);

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

  v_old_fx_missing := public.fx_is_missing(OLD.currency, OLD.exchange_rate);
  v_old_total_mxn := CASE
    WHEN v_old_fx_missing THEN NULL
    WHEN upper(COALESCE(OLD.currency, 'MXN')) = 'MXN' THEN COALESCE(OLD.total, 0)
    ELSE COALESCE(OLD.total, 0) * OLD.exchange_rate
  END;

  -- R9-01: cuando el TC falta, AMBOS total_mxn son NULL y la comparación
  -- `IS NOT DISTINCT FROM` los daba por equivalentes: un cambio real de
  -- NEW.total pasaba de largo (sin guard de pagos y sin recálculo). Se compara
  -- explícitamente el total en la moneda del documento.
  IF v_total_mxn IS NOT DISTINCT FROM v_old_total_mxn
     AND NEW.total IS NOT DISTINCT FROM OLD.total
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

  -- R9-08 / R10-01 (sin cambios): rechazada siempre vuelve a 'pending'.
  IF OLD.approval_status IN ('pending', 'not_required', 'rejected') THEN
    IF v_fx_missing OR v_total_mxn > v_threshold OR OLD.approval_status = 'rejected' THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END $function$
;

DO $phase6_supplier_approval_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.set_supplier_bill_approval_status()'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT ILIKE
     '%WHERE cs.organization_id = NEW.organization_id%' THEN
    RAISE EXCEPTION
      'El umbral de aprobación CxP debe filtrarse por NEW.organization_id';
  END IF;

  IF v_definition ILIKE
     '%FROM public.company_settings ORDER BY created_at ASC LIMIT 1%' THEN
    RAISE EXCEPTION
      'El trigger CxP conserva una lectura global de company_settings';
  END IF;
END;
$phase6_supplier_approval_assertions$;
