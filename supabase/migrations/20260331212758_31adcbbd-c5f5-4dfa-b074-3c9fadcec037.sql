CREATE OR REPLACE FUNCTION public.get_financial_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_mrr numeric;
  v_dso numeric;
  v_overdue_total numeric;
  v_expiring_contracts jsonb;
BEGIN
  -- MRR: sum of monthly_rate for rented forklifts WITH active confirmed booking
  SELECT COALESCE(SUM(f.monthly_rate), 0) INTO v_mrr
  FROM forklifts f
  WHERE f.status = 'rented'
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND b.status = 'confirmed'
        AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
    );

  -- DSO: average days between issued_at and paid_at for paid invoices (last 12 months)
  SELECT COALESCE(AVG(paid_at - issued_at), 0) INTO v_dso
  FROM invoices
  WHERE status = 'paid' AND paid_at IS NOT NULL
    AND issued_at >= CURRENT_DATE - INTERVAL '12 months';

  -- Overdue total
  SELECT COALESCE(SUM(total), 0) INTO v_overdue_total
  FROM invoices
  WHERE status IN ('sent', 'overdue', 'partial')
    AND due_date < CURRENT_DATE;

  -- Expiring contracts (next 30 days)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'contract_number', c.contract_number,
    'customer_name', cust.name,
    'forklift_name', f.name,
    'end_date', c.end_date,
    'days_remaining', (c.end_date - CURRENT_DATE)
  ) ORDER BY c.end_date), '[]'::jsonb)
  INTO v_expiring_contracts
  FROM contracts c
  LEFT JOIN customers cust ON cust.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status IN ('active', 'signed', 'draft')
    AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';

  result := jsonb_build_object(
    'mrr', v_mrr,
    'dso', ROUND(v_dso),
    'overdue_total', v_overdue_total,
    'expiring_contracts', v_expiring_contracts
  );

  RETURN result;
END;
$$;