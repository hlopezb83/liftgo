-- A4B-01: get_forklift_financials excluía mantenimientos archivados y E2E del ROI
CREATE OR REPLACE FUNCTION public.get_forklift_financials(p_forklift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_revenue numeric;
  v_maintenance_cost numeric;
  v_acquisition_cost numeric;
  v_days_rented integer;
  v_days_since_acquired integer;
  v_hourometer_history jsonb;
  v_anchor date;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'auditor'::app_role) OR
    has_role((select auth.uid()), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- FIX A1: antes filtraba sólo por invoices.booking_id, dejando fuera las
  -- facturas recurrentes ligadas por invoice_bookings.
  SELECT COALESCE(SUM(r.net_mxn_share), 0) INTO v_revenue
  FROM public.v_invoice_forklift_revenue r
  WHERE r.forklift_id = p_forklift_id
    AND r.status IN ('paid', 'partial', 'sent', 'overdue')
    AND r.is_e2e IS NOT TRUE;

  -- FIX A4B-01: excluir OTs archivadas (soft-delete) y datos E2E del costo.
  SELECT COALESCE(SUM(cost), 0) INTO v_maintenance_cost
  FROM maintenance_logs
  WHERE forklift_id = p_forklift_id
    AND deleted_at IS NULL
    AND is_e2e IS NOT TRUE;

  SELECT
    COALESCE(acquisition_cost, 0),
    COALESCE(acquisition_date, created_at::date)
  INTO v_acquisition_cost, v_anchor
  FROM forklifts WHERE id = p_forklift_id;

  v_days_since_acquired := GREATEST((public.today_mty() - v_anchor) + 1, 1);

  SELECT COUNT(DISTINCT d)::int
  INTO v_days_rented
  FROM bookings b
  CROSS JOIN LATERAL generate_series(
    b.start_date,
    LEAST(b.end_date, public.today_mty()),
    interval '1 day'
  ) AS d
  WHERE b.forklift_id = p_forklift_id
    AND b.status IN ('confirmed', 'completed')
    AND b.start_date <= public.today_mty();

  v_days_rented := COALESCE(v_days_rented, 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'delivery_id', d.id, 'delivery_number', d.delivery_number, 'type', d.type,
    'date', d.scheduled_date, 'hours_reading', d.hours_reading, 'booking_id', d.booking_id
  ) ORDER BY d.scheduled_date, d.type), '[]'::jsonb)
  INTO v_hourometer_history
  FROM deliveries d WHERE d.forklift_id = p_forklift_id AND d.hours_reading IS NOT NULL;

  result := jsonb_build_object(
    'revenue', v_revenue,
    'maintenance_cost', v_maintenance_cost,
    'acquisition_cost', v_acquisition_cost,
    'gross_margin', v_revenue - v_maintenance_cost,
    'roi_percent', CASE WHEN v_acquisition_cost > 0
      THEN ROUND(((v_revenue - v_maintenance_cost) / v_acquisition_cost) * 100, 1) ELSE 0 END,
    'days_rented', v_days_rented,
    'days_since_acquired', v_days_since_acquired,
    'utilization_percent', CASE WHEN v_days_since_acquired > 0
      THEN LEAST(100, ROUND((v_days_rented::numeric / v_days_since_acquired) * 100, 1)) ELSE 0 END,
    'hourometer_history', v_hourometer_history
  );
  RETURN result;
END;
$function$;

-- A4B-02: get_customer_profitability sumaba mantenimientos archivados / E2E
CREATE OR REPLACE FUNCTION public.get_customer_profitability(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_uid uuid := (select auth.uid());
  v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_is_staff := (
    public.has_role(v_uid, 'admin'::app_role) OR
    public.has_role(v_uid, 'administrativo'::app_role) OR
    public.has_role(v_uid, 'auditor'::app_role) OR
    public.has_role(v_uid, 'ventas'::app_role)
  );

  IF NOT v_is_staff THEN
    IF p_customer_id IS NULL
       OR p_customer_id IS DISTINCT FROM public.get_customer_id_for_user(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH revenue AS (
    SELECT COALESCE(SUM(
      COALESCE(CASE
        WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.subtotal
        WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN i.subtotal * i.tipo_cambio
      END, 0)
      - COALESCE((
          SELECT SUM(CASE
            WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN cn.subtotal
            WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN cn.subtotal * i.tipo_cambio
          END)
          FROM public.credit_notes cn
          WHERE cn.invoice_id = i.id
            AND cn.cancellation_status <> 'accepted'
            AND cn.status <> 'cancelled'
            AND cn.cfdi_status = 'stamped'
        ), 0)
    ), 0)::numeric AS r
    FROM public.invoices i
    WHERE i.customer_id = p_customer_id
      AND i.status <> 'cancelled'
      AND COALESCE(i.cancellation_status, '') <> 'accepted'
      AND i.is_e2e IS NOT TRUE
  ),
  customer_forklifts AS (
    SELECT DISTINCT b.forklift_id
    FROM public.bookings b
    WHERE b.customer_id = p_customer_id
      AND b.forklift_id IS NOT NULL
  ),
  maint AS (
    -- FIX A2: antes el JOIN con bookings multiplicaba el costo por cada
    -- reserva del mismo equipo.
    -- FIX A4B-02: excluir OTs archivadas (soft-delete) y datos E2E.
    SELECT COALESCE(SUM(ml.cost), 0)::numeric AS c
    FROM public.maintenance_logs ml
    WHERE ml.forklift_id IN (SELECT forklift_id FROM customer_forklifts)
      AND ml.deleted_at IS NULL
      AND ml.is_e2e IS NOT TRUE
  )
  SELECT jsonb_build_object(
    'revenue', revenue.r,
    'maintenance_cost', maint.c,
    'gross_margin', revenue.r - maint.c,
    'margin_percent', CASE WHEN revenue.r > 0 THEN ROUND(((revenue.r - maint.c) / revenue.r) * 100, 2) ELSE 0 END
  )
  INTO v_result
  FROM revenue, maint;

  RETURN v_result;
END;
$function$;

-- A4B-03: badge del sidebar contaba OTs archivadas / E2E como abiertas
CREATE OR REPLACE FUNCTION public.get_sidebar_badge_counts()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- M-3: solo staff interno puede ver los contadores del sidebar.
  IF NOT (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
    OR public.has_role((select auth.uid()), 'ventas'::app_role)
    OR public.has_role((select auth.uid()), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado para ver métricas internas' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT json_build_object(
      'maintenance_open', (SELECT COUNT(*) FROM maintenance_logs
                           WHERE work_status IS DISTINCT FROM 'completed'
                             AND work_status IS DISTINCT FROM 'cancelled'
                             AND deleted_at IS NULL
                             AND is_e2e IS NOT TRUE),
      'deliveries_today', (SELECT COUNT(*) FROM deliveries
                           WHERE scheduled_date = public.today_mty()
                             AND status = 'scheduled'),
      'returns_today',    (SELECT COUNT(*) FROM bookings
                           WHERE status = 'confirmed'
                             AND end_date = public.today_mty()),
      'intents_pending',  (SELECT COUNT(*) FROM customer_payment_intents
                           WHERE status::text = 'pending_review')
    )
  );
END
$function$;