-- Restrict the mixed customer summary RPC for effective dispatchers.
-- Forward-only; preserve signature, SECURITY DEFINER, ACLs, portal resolution,
-- organization boundaries and the authorized financial calculations from 0044.
-- No grants, role mutations, schema rewrites or stored data changes.

CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals jsonb;
  v_uid uuid := (SELECT auth.uid());
  v_portal_customer uuid;
  v_org uuid;
  v_is_internal boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_portal_customer := public.current_portal_customer_id();
  IF v_portal_customer IS NOT NULL THEN
    SELECT a.organization_id INTO v_org
    FROM public.customer_portal_accounts a
    WHERE a.auth_user_id = v_uid
      AND a.status = 'active'
      AND a.customer_id = v_portal_customer;
  ELSE
    v_org := public.current_internal_organization_id();
    IF v_org IS NOT NULL AND public.is_internal_member(v_uid) THEN
      v_is_internal := true;
    ELSE
      v_org := NULL;
    END IF;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_is_internal THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::public.app_role)
      OR public.has_role(v_uid, 'administrativo'::public.app_role)
      OR public.has_role(v_uid, 'auditor'::public.app_role)
      OR public.has_role(v_uid, 'dispatcher'::public.app_role)
      OR public.has_role(v_uid, 'ventas'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF p_customer_id IS NULL OR p_customer_id IS DISTINCT FROM v_portal_customer THEN
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
   AND f.organization_id = v_org
  WHERE b.customer_id = p_customer_id
    AND b.organization_id = v_org;

  -- Match the effective role priority used by useUserRole: a dispatcher
  -- without a higher-priority financial role is operational-only. Portal
  -- identity is resolved above and must never be demoted by a residual role.
  -- Return before touching invoices/balances: SECURITY DEFINER bypasses their
  -- RLS, so hiding the frontend or relying on table SELECT policies is unsafe.
  IF v_is_internal
     AND public.has_role(v_uid, 'dispatcher'::public.app_role)
     AND NOT (
       public.has_role(v_uid, 'admin'::public.app_role)
       OR public.has_role(v_uid, 'administrativo'::public.app_role)
       OR public.has_role(v_uid, 'auditor'::public.app_role)
       OR public.has_role(v_uid, 'ventas'::public.app_role)
     ) THEN
    RETURN jsonb_build_object(
      'bookings', v_bookings,
      'invoices', '[]'::jsonb,
      'totals', jsonb_build_object(
        'total_invoiced', 0,
        'total_paid', 0,
        'total_credited', 0,
        'outstanding_revenue', 0,
        'fx_missing_count', 0
      )
    );
  END IF;

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
    AND i.organization_id = v_org
    AND i.status NOT IN ('draft', 'cancelled');

  WITH scoped AS (
    SELECT v.*,
           CASE WHEN upper(COALESCE(v.moneda, 'MXN')) = 'MXN'
                THEN 1::numeric ELSE v.tipo_cambio END AS rate
    FROM public.v_invoices_with_balance v
    JOIN public.invoices i ON i.id = v.id
    WHERE v.customer_id = p_customer_id
      AND i.organization_id = v_org
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
$function$;

COMMENT ON FUNCTION public.get_customer_summary(uuid) IS
  'Resumen de cliente acotado a organización y canal real. Dispatcher efectivo recibe sólo reservas operativas, sin consultar facturas/saldos; roles financieros y portal propio conservan el contrato.';
