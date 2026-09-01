-- R10-01: la reaprobación de una factura rechazada SIEMPRE vuelve a 'pending'.
CREATE OR REPLACE FUNCTION public.request_bill_reapproval(p_bill_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT (public.has_role((select auth.uid()),'admin'::app_role)
          OR public.has_role((select auth.uid()),'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No tienes permisos para solicitar reaprobación';
  END IF;

  SELECT approval_status, bill_number
    INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'Solo facturas rechazadas pueden re-solicitar aprobación';
  END IF;

  -- R10-01: un rechazo explícito NO se puede auto-limpiar. Sin importar el
  -- umbral ni el tipo de cambio, la factura regresa al circuito de aprobación
  -- ('pending'); nunca a 'not_required' ni a 'approved'. La evidencia del
  -- rechazo (rejected_by / rejected_at / approval_notes) se conserva para
  -- auditoría hasta que un aprobador resuelva el nuevo ciclo.
  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = 'pending',
        approved_by = NULL,
        approved_at = NULL,
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

-- R10-02: sin JWT ya NO hay bypass. Solo el rol de servicio real y la
-- convención interna app.cxp_rpc='on' se saltan el recálculo/guards.
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
  -- circuito normal de aprobación (nunca se auto-aprueba).
  -- R10-01: si venía rechazada, el destino mínimo es 'pending' aunque el
  -- monto quede por debajo del umbral: el rechazo lo levanta un aprobador.
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
END $function$;

-- R10-02: el guard de la columna de aprobación tampoco puede abrirse por
-- ausencia de JWT. El rol de servicio real sí trae claim 'service_role'.
CREATE OR REPLACE FUNCTION public.guard_supplier_bill_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role'
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La aprobacion de facturas de proveedor solo se modifica via approve_supplier_bill / reject_supplier_bill / request_bill_reapproval.'
    USING ERRCODE = 'check_violation';
END;
$function$;