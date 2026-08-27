-- FIX R5-03: get_financial_kpis excluia datos E2E solo parcialmente.
-- Se agregan filtros is_e2e / deleted_at en MRR, MRR_prev, DSO, DSO_prev
-- y en los agregados de vencidos sobre v_invoices_with_balance.
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
  v_today DATE := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_last_prev_month DATE := (date_trunc('month', v_today) - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)), 0)
    INTO v_mrr
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_today
     AND (b.end_date IS NULL OR b.end_date >= v_today)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE;

  SELECT COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)), 0)
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

  -- R13-2: usar balance_mxn (convertido a MXN) en lugar de balance crudo.
  -- FIX N-15: excluir documentos sin tipo de cambio (fx_missing) y contarlos.
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'contract_number', c.contract_number, 'customer_name', cu.name,
    'forklift_name', f.name, 'end_date', c.end_date, 'days_remaining', (c.end_date - v_today)
  ) ORDER BY c.end_date), '[]'::jsonb) INTO v_expiring
  FROM contracts c LEFT JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN v_today AND (v_today + INTERVAL '30 days');

  RETURN jsonb_build_object(
    'mrr', v_mrr, 'mrr_prev', v_mrr_prev,
    'dso', ROUND(v_dso, 1), 'dso_prev', ROUND(v_dso_prev, 1),
    'overdue_total', v_overdue_total, 'overdue_total_prev', v_overdue_total_prev,
    'overdue_fx_missing_count', v_overdue_fx_missing,
    'expiring_contracts', v_expiring
  );
END;
$function$;