CREATE OR REPLACE FUNCTION public.get_financial_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrr NUMERIC := 0;
  v_mrr_prev NUMERIC := 0;
  v_dso NUMERIC := 0;
  v_dso_prev NUMERIC := 0;
  v_overdue_total NUMERIC := 0;
  v_overdue_total_prev NUMERIC := 0;
  v_expiring jsonb;
  v_today DATE := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_first_this_month DATE := date_trunc('month', v_today)::date;
  v_first_prev_month DATE := (date_trunc('month', v_today) - INTERVAL '1 month')::date;
  v_last_prev_month DATE := (date_trunc('month', v_today) - INTERVAL '1 day')::date;
BEGIN
  -- MRR actual: suma de monthly_rate de forklifts rentados con bookings activas
  SELECT COALESCE(SUM(f.monthly_rate), 0) INTO v_mrr
  FROM forklifts f
  WHERE f.status = 'rented'
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND b.status = 'active'
        AND b.recurring_billing = true
    );

  -- MRR mes anterior: usar bookings que estaban activas el último día del mes anterior
  SELECT COALESCE(SUM(f.monthly_rate), 0) INTO v_mrr_prev
  FROM forklifts f
  WHERE EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = f.id
      AND b.recurring_billing = true
      AND b.start_date <= v_last_prev_month
      AND (b.end_date IS NULL OR b.end_date >= v_last_prev_month)
  );

  -- DSO actual: promedio de días entre emisión y pago en últimos 90 días
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (i.paid_at - i.issued_at)) / 86400.0), 0) INTO v_dso
  FROM invoices i
  WHERE i.status = 'paid'
    AND i.paid_at IS NOT NULL
    AND i.paid_at >= (v_today - INTERVAL '90 days');

  -- DSO mes anterior: ventana de 90 días terminada al cierre del mes anterior
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (i.paid_at - i.issued_at)) / 86400.0), 0) INTO v_dso_prev
  FROM invoices i
  WHERE i.status = 'paid'
    AND i.paid_at IS NOT NULL
    AND i.paid_at >= (v_last_prev_month - INTERVAL '90 days')
    AND i.paid_at <= v_last_prev_month;

  -- Cartera vencida actual
  SELECT COALESCE(SUM(i.total), 0) INTO v_overdue_total
  FROM invoices i
  WHERE i.status IN ('sent', 'partial')
    AND i.due_date < v_today;

  -- Cartera vencida al cierre del mes anterior
  SELECT COALESCE(SUM(i.total), 0) INTO v_overdue_total_prev
  FROM invoices i
  WHERE i.status IN ('sent', 'partial', 'paid')
    AND i.issued_at <= v_last_prev_month
    AND i.due_date < v_last_prev_month
    AND (i.paid_at IS NULL OR i.paid_at > v_last_prev_month);

  -- Contratos por vencer en próximos 30 días
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'contract_number', c.contract_number,
    'customer_name', cu.name,
    'forklift_name', f.name,
    'end_date', c.end_date,
    'days_remaining', (c.end_date - v_today)
  ) ORDER BY c.end_date), '[]'::jsonb) INTO v_expiring
  FROM contracts c
  LEFT JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status = 'active'
    AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN v_today AND (v_today + INTERVAL '30 days');

  RETURN jsonb_build_object(
    'mrr', v_mrr,
    'mrr_prev', v_mrr_prev,
    'dso', ROUND(v_dso, 1),
    'dso_prev', ROUND(v_dso_prev, 1),
    'overdue_total', v_overdue_total,
    'overdue_total_prev', v_overdue_total_prev,
    'expiring_contracts', v_expiring
  );
END;
$$;