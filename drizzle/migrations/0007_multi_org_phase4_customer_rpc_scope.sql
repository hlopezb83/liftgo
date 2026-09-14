-- =====================================================================
-- Multi-organización · Fase 4.3 (RPC financieras por organización)
--
-- Las funciones usan SECURITY DEFINER y por tanto deben hacer su propio
-- scope. Un cliente compartido no puede sumar datos de otra organización.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_customer_profitability(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_uid uuid := auth.uid();
  v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_is_staff := (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'administrativo'::public.app_role)
    OR public.has_role(v_uid, 'auditor'::public.app_role)
    OR public.has_role(v_uid, 'ventas'::public.app_role)
  );

  IF NOT v_is_staff
     AND (
       p_customer_id IS NULL
       OR p_customer_id IS DISTINCT FROM public.get_customer_id_for_user(v_uid)
     ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  WITH revenue AS (
    SELECT COALESCE(SUM(
      COALESCE(public.fx_to_mxn(i.subtotal, i.moneda, i.tipo_cambio), 0)
      - COALESCE((
          SELECT SUM(public.fx_to_mxn(cn.subtotal, i.moneda, i.tipo_cambio))
          FROM public.credit_notes cn
          WHERE cn.invoice_id = i.id
            AND public.organization_scope_matches(cn.organization_id)
            AND cn.cancellation_status <> 'accepted'
            AND cn.status <> 'cancelled'
            AND cn.cfdi_status = 'stamped'
        ), 0)
    ), 0)::numeric AS r
    FROM public.invoices i
    WHERE i.customer_id = p_customer_id
      AND public.organization_scope_matches(i.organization_id)
      AND i.status <> 'cancelled'
      AND COALESCE(i.cancellation_status, '') <> 'accepted'
      AND i.is_e2e IS NOT TRUE
  ),
  customer_forklifts AS (
    SELECT DISTINCT b.forklift_id
    FROM public.bookings b
    WHERE b.customer_id = p_customer_id
      AND public.organization_scope_matches(b.organization_id)
      AND b.forklift_id IS NOT NULL
  ),
  maint AS (
    SELECT COALESCE(SUM(ml.cost), 0)::numeric AS c
    FROM public.maintenance_logs ml
    WHERE ml.forklift_id IN (SELECT forklift_id FROM customer_forklifts)
      AND public.organization_scope_matches(ml.organization_id)
      AND ml.deleted_at IS NULL
      AND ml.is_e2e IS NOT TRUE
  )
  SELECT jsonb_build_object(
    'revenue', revenue.r,
    'maintenance_cost', maint.c,
    'gross_margin', revenue.r - maint.c,
    'margin_percent',
      CASE WHEN revenue.r > 0
        THEN ROUND(((revenue.r - maint.c) / revenue.r) * 100, 2)
        ELSE 0
      END
  )
  INTO v_result
  FROM revenue, maint;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'administrativo'::public.app_role)
    OR public.has_role(v_uid, 'auditor'::public.app_role)
    OR public.has_role(v_uid, 'dispatcher'::public.app_role)
    OR public.has_role(v_uid, 'ventas'::public.app_role)
    OR (
      public.has_role(v_uid, 'customer'::public.app_role)
      AND p_customer_id = public.get_customer_id_for_user(v_uid)
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'booking_number', b.booking_number,
    'start_date', b.start_date,
    'end_date', b.end_date,
    'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM public.bookings b
  LEFT JOIN public.forklifts f
    ON f.id = b.forklift_id
   AND public.organization_scope_matches(f.organization_id)
  WHERE b.customer_id = p_customer_id
    AND public.organization_scope_matches(b.organization_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'issued_at', i.issued_at,
    'due_date', i.due_date,
    'total', i.total,
    'status', i.status,
    'currency', COALESCE(i.moneda, 'MXN'),
    'tipo_cambio', i.tipo_cambio,
    'fx_missing', public.fx_is_missing(i.moneda, i.tipo_cambio)
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM public.invoices i
  WHERE i.customer_id = p_customer_id
    AND public.organization_scope_matches(i.organization_id)
    AND i.status NOT IN ('draft', 'cancelled');

  WITH scoped AS (
    SELECT v.*,
           CASE WHEN upper(COALESCE(v.moneda, 'MXN')) = 'MXN'
                THEN 1::numeric ELSE v.tipo_cambio END AS rate
    FROM public.v_invoices_with_balance v
    JOIN public.invoices i ON i.id = v.id
    WHERE v.customer_id = p_customer_id
      AND public.organization_scope_matches(i.organization_id)
      AND v.status NOT IN ('draft', 'cancelled')
  ),
  usable AS (
    SELECT * FROM scoped WHERE NOT fx_missing
  )
  SELECT jsonb_build_object(
    'total_invoiced',
      COALESCE((SELECT SUM(ROUND(u.total * u.rate, 2)) FROM usable u), 0),
    'total_paid',
      COALESCE((SELECT SUM(ROUND(u.paid_amount * u.rate, 2)) FROM usable u), 0),
    'total_credited',
      COALESCE((SELECT SUM(ROUND(u.credited_amount * u.rate, 2)) FROM usable u), 0),
    'outstanding_revenue',
      COALESCE((
        SELECT SUM(ROUND(u.balance * u.rate, 2))
        FROM usable u
        WHERE u.status IN ('sent', 'partial', 'overdue')
          AND COALESCE(u.cancellation_status, '') <> 'accepted'
      ), 0),
    'fx_missing_count',
      COALESCE((
        SELECT count(*)
        FROM scoped s
        WHERE s.fx_missing OR COALESCE(s.payments_fx_missing, 0) > 0
      ), 0)
  )
  INTO v_totals;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals', v_totals
  );
END;
$$;
