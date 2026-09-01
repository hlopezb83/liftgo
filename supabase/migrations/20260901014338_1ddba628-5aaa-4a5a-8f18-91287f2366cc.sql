-- R7 lote 1: correcciones de auditoría R7 (CxP, KPIs, mantenimiento, vista de ocupación)

-- R7-11: la función referenciaba supplier_payments.supplier_bill_id (columna inexistente).
CREATE OR REPLACE FUNCTION public.set_supplier_bill_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold NUMERIC(14,2);
  v_total_mxn NUMERIC(14,2);
  v_old_total_mxn NUMERIC(14,2);
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

  v_total_mxn := CASE
    WHEN NEW.currency = 'MXN' THEN COALESCE(NEW.total, 0)
    ELSE COALESCE(NEW.total, 0) * COALESCE(NEW.exchange_rate, 1)
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Una factura de proveedor no puede nacer en estado de aprobacion %. Registrala pendiente y usa approve_supplier_bill / reject_supplier_bill.', NEW.approval_status
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;

    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_notes := NULL;

    RETURN NEW;
  END IF;

  -- UPDATE: solo interesa si cambio el monto en MXN.
  v_old_total_mxn := CASE
    WHEN OLD.currency = 'MXN' THEN COALESCE(OLD.total, 0)
    ELSE COALESCE(OLD.total, 0) * COALESCE(OLD.exchange_rate, 1)
  END;

  IF v_total_mxn IS NOT DISTINCT FROM v_old_total_mxn
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
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
    IF v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END $function$;

-- R7-02: el trigger liberaba el lock aunque la factura siguiera en otro lote vivo.
CREATE OR REPLACE FUNCTION public.release_bills_on_batch_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.supplier_bills b
     SET payment_in_progress_at = NULL
   WHERE b.id IN (
           SELECT i.bill_id FROM public.supplier_payment_batch_items i
            WHERE i.batch_id = OLD.id
         )
     AND b.payment_in_progress_at IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = b.id
         )
     AND NOT EXISTS (
           SELECT 1
             FROM public.supplier_payment_batch_items i2
             JOIN public.supplier_payment_batches b2 ON b2.id = i2.batch_id
            WHERE i2.bill_id = b.id
              AND i2.batch_id <> OLD.id
         );
  RETURN OLD;
END;
$fn$;

REVOKE ALL ON FUNCTION public.release_bills_on_batch_delete() FROM PUBLIC, anon, authenticated;

-- R7-12: fuente única de verdad de "qué bloqueos son liberables".
CREATE OR REPLACE FUNCTION public.releasable_payment_locks(p_older_than_hours integer DEFAULT 24)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT b.id
    FROM public.supplier_bills b
   WHERE b.payment_in_progress_at IS NOT NULL
     AND b.payment_in_progress_at < now() - make_interval(hours => GREATEST(COALESCE(p_older_than_hours, 24), 1))
     AND NOT EXISTS (
           SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = b.id
         )
     -- Lote "estancado": ningun lote que contenga la factura tiene pagos
     -- registrados para alguna de sus facturas.
     AND NOT EXISTS (
           SELECT 1
             FROM public.supplier_payment_batch_items i
             JOIN public.supplier_payment_batch_items i2 ON i2.batch_id = i.batch_id
             JOIN public.supplier_payments sp2 ON sp2.bill_id = i2.bill_id
            WHERE i.bill_id = b.id
         );
$fn$;

REVOKE ALL ON FUNCTION public.releasable_payment_locks(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.releasable_payment_locks(integer) TO authenticated;

-- R7-09: el barrido solo liberaba locks cuyo lote ya no existía; un wizard
-- abandonado deja el lote vivo. Ahora usa el mismo predicado de "liberable".
CREATE OR REPLACE FUNCTION public.release_stale_payment_locks(p_older_than_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := (select auth.uid());
  v_count integer := 0;
BEGIN
  IF NOT (
    public.has_role(v_user, 'admin'::app_role)
    OR public.has_role(v_user, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado para liberar bloqueos de pago' USING ERRCODE = '42501';
  END IF;

  IF p_older_than_hours IS NULL OR p_older_than_hours < 1 THEN
    RAISE EXCEPTION 'La antigüedad mínima debe ser de al menos 1 hora'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_bills b
     SET payment_in_progress_at = NULL
   WHERE b.id IN (SELECT id FROM public.releasable_payment_locks(p_older_than_hours));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.release_stale_payment_locks(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_stale_payment_locks(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_releasable_payment_locks(p_older_than_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := (select auth.uid());
  v_count integer := 0;
BEGIN
  IF NOT (
    public.has_role(v_user, 'admin'::app_role)
    OR public.has_role(v_user, 'administrativo'::app_role)
  ) THEN
    RETURN 0;
  END IF;
  SELECT count(*) INTO v_count FROM public.releasable_payment_locks(p_older_than_hours);
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.count_releasable_payment_locks(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_releasable_payment_locks(integer) TO authenticated;

-- R7-06: idempotencia del cron de mantenimiento.
ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS policy_id uuid REFERENCES public.maintenance_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS policy_month text;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_logs_policy_month_uniq
  ON public.maintenance_logs (policy_id, policy_month)
  WHERE policy_id IS NOT NULL AND policy_month IS NOT NULL;

-- R7-18 + seguridad: fechas ancladas a Monterrey y security_invoker restaurado.
CREATE OR REPLACE VIEW public.v_booking_occupancy AS
 SELECT id AS booking_id,
    forklift_id,
    status,
    is_e2e,
    GREATEST(start_date, COALESCE(( SELECT (min(d.completed_at) AT TIME ZONE 'America/Monterrey')::date AS min
           FROM deliveries d
          WHERE ((d.booking_id = b.id) AND (d.type = 'delivery'::text) AND (d.status = 'completed'::text) AND (d.completed_at IS NOT NULL))), start_date)) AS occ_start,
    LEAST(today_mty(), COALESCE(( SELECT (max(ri.inspected_at) AT TIME ZONE 'America/Monterrey')::date AS max
           FROM return_inspections ri
          WHERE (ri.booking_id = b.id)),
        CASE
            WHEN (b.return_status = 'returned'::text) THEN LEAST(end_date, today_mty())
            WHEN (status = 'completed'::text) THEN end_date
            ELSE today_mty()
        END)) AS occ_end
   FROM bookings b
  WHERE (status = ANY (ARRAY['confirmed'::text, 'completed'::text]));

ALTER VIEW public.v_booking_occupancy SET (security_invoker = on);

-- R7-15: un tipo de cambio negativo se sumaba al MRR y además se contaba como excluido.
CREATE OR REPLACE FUNCTION public.get_financial_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mrr NUMERIC := 0; v_mrr_prev NUMERIC := 0;
  v_dso NUMERIC := 0; v_dso_prev NUMERIC := 0;
  v_overdue_total NUMERIC := 0; v_overdue_total_prev NUMERIC := 0;
  v_expiring jsonb;
  v_overdue_fx_missing INT := 0;
  v_mrr_fx_missing INT := 0;
  v_mrr_prev_fx_missing INT := 0;
  v_today DATE := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_last_prev_month DATE := (date_trunc('month', v_today) - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- FIX A4: la renta mensual se sumaba en crudo aunque la reserva
  -- estuviera pactada en dólares. Se convierte a MXN.
  SELECT COALESCE(SUM(
           COALESCE(b.monthly_rate, f.monthly_rate, 0)
           * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
                  THEN 1 ELSE (CASE WHEN COALESCE(b.tipo_cambio, 0) > 0 THEN b.tipo_cambio ELSE NULL END) END
         ), 0)
    INTO v_mrr
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_today
     AND (b.end_date IS NULL OR b.end_date >= v_today)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE;

  SELECT COALESCE(SUM(
           COALESCE(b.monthly_rate, f.monthly_rate, 0)
           * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
                  THEN 1 ELSE (CASE WHEN COALESCE(b.tipo_cambio, 0) > 0 THEN b.tipo_cambio ELSE NULL END) END
         ), 0)
    INTO v_mrr_prev
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_last_prev_month
     AND (b.end_date IS NULL OR b.end_date >= v_last_prev_month)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE;

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL AND i.paid_at >= (v_today - INTERVAL '90 days')
    AND i.is_e2e IS NOT TRUE;

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso_prev FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
    AND i.paid_at >= (v_last_prev_month - INTERVAL '90 days') AND i.paid_at <= v_last_prev_month
    AND i.is_e2e IS NOT TRUE;

  -- R13-2 / N-15
  SELECT COALESCE(SUM(v.balance_mxn), 0) INTO v_overdue_total
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue') AND v.due_date < v_today
    AND v.fx_missing IS NOT TRUE
    AND v.is_e2e IS NOT TRUE;

  SELECT COUNT(*) INTO v_overdue_fx_missing
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue') AND v.due_date < v_today
    AND v.fx_missing IS TRUE
    AND v.is_e2e IS NOT TRUE;

  SELECT COALESCE(SUM(v.balance_mxn), 0) INTO v_overdue_total_prev
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue', 'paid')
    AND v.issued_at <= v_last_prev_month
    AND v.due_date < v_last_prev_month
    AND (v.paid_at IS NULL OR v.paid_at > v_last_prev_month)
    AND v.fx_missing IS NOT TRUE
    AND v.is_e2e IS NOT TRUE;

  -- FIX R6-20: excluir clientes E2E y unidades borradas, sin perder los
  -- contratos que no tienen unidad/cliente asignado (LEFT JOIN).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'contract_number', c.contract_number, 'customer_name', cu.name,
    'forklift_name', f.name, 'end_date', c.end_date, 'days_remaining', (c.end_date - v_today)
  ) ORDER BY c.end_date), '[]'::jsonb) INTO v_expiring
  FROM contracts c LEFT JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN v_today AND (v_today + INTERVAL '30 days')
    AND (cu.id IS NULL OR cu.is_e2e IS NOT TRUE)
    AND (f.id IS NULL OR f.deleted_at IS NULL);

  SELECT COUNT(*) INTO v_mrr_fx_missing
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_today
     AND (b.end_date IS NULL OR b.end_date >= v_today)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
     AND upper(COALESCE(b.currency, 'MXN')) <> 'MXN'
     AND COALESCE(b.tipo_cambio, 0) <= 0;

  SELECT COUNT(*) INTO v_mrr_prev_fx_missing
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_last_prev_month
     AND (b.end_date IS NULL OR b.end_date >= v_last_prev_month)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
     AND upper(COALESCE(b.currency, 'MXN')) <> 'MXN'
     AND COALESCE(b.tipo_cambio, 0) <= 0;

  RETURN jsonb_build_object(
    'mrr_fx_missing_count', v_mrr_fx_missing,
    'mrr_prev_fx_missing_count', v_mrr_prev_fx_missing,
    'mrr', v_mrr, 'mrr_prev', v_mrr_prev,
    'dso', ROUND(v_dso, 1), 'dso_prev', ROUND(v_dso_prev, 1),
    'overdue_total', v_overdue_total, 'overdue_total_prev', v_overdue_total_prev,
    'overdue_fx_missing_count', v_overdue_fx_missing,
    'expiring_contracts', v_expiring
  );
END;
$function$;