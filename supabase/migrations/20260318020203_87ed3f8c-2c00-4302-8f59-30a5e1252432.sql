
-- RPC: get_financial_kpis — returns MRR, DSO, overdue total, expiring contracts
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
  -- MRR: sum of monthly_rate for rented forklifts
  SELECT COALESCE(SUM(monthly_rate), 0) INTO v_mrr
  FROM forklifts WHERE status = 'rented';

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

-- RPC: get_forklift_financials — returns revenue, costs, ROI for a specific forklift
CREATE OR REPLACE FUNCTION public.get_forklift_financials(p_forklift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_revenue numeric;
  v_maintenance_cost numeric;
  v_acquisition_cost numeric;
  v_days_rented integer;
  v_days_since_acquired integer;
  v_hourometer_history jsonb;
BEGIN
  -- Revenue: sum of paid invoice totals linked through bookings
  SELECT COALESCE(SUM(i.total), 0) INTO v_revenue
  FROM invoices i
  JOIN bookings b ON b.id = i.booking_id
  WHERE b.forklift_id = p_forklift_id
    AND i.status IN ('paid', 'partial', 'sent', 'overdue');

  -- Maintenance costs
  SELECT COALESCE(SUM(cost), 0) INTO v_maintenance_cost
  FROM maintenance_logs
  WHERE forklift_id = p_forklift_id;

  -- Acquisition cost
  SELECT COALESCE(acquisition_cost, 0), 
         GREATEST((CURRENT_DATE - created_at::date), 1)
  INTO v_acquisition_cost, v_days_since_acquired
  FROM forklifts WHERE id = p_forklift_id;

  -- Days rented (sum of booking durations)
  SELECT COALESCE(SUM(
    LEAST(end_date, CURRENT_DATE) - start_date
  ), 0) INTO v_days_rented
  FROM bookings
  WHERE forklift_id = p_forklift_id
    AND status IN ('confirmed', 'completed');

  -- Hourometer history from deliveries
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'delivery_id', d.id,
    'delivery_number', d.delivery_number,
    'type', d.type,
    'date', d.scheduled_date,
    'hours_reading', d.hours_reading,
    'booking_id', d.booking_id
  ) ORDER BY d.scheduled_date, d.type), '[]'::jsonb)
  INTO v_hourometer_history
  FROM deliveries d
  WHERE d.forklift_id = p_forklift_id
    AND d.hours_reading IS NOT NULL;

  result := jsonb_build_object(
    'revenue', v_revenue,
    'maintenance_cost', v_maintenance_cost,
    'acquisition_cost', v_acquisition_cost,
    'gross_margin', v_revenue - v_maintenance_cost,
    'roi_percent', CASE WHEN v_acquisition_cost > 0
      THEN ROUND(((v_revenue - v_maintenance_cost) / v_acquisition_cost) * 100, 1)
      ELSE 0 END,
    'days_rented', v_days_rented,
    'days_since_acquired', v_days_since_acquired,
    'utilization_percent', CASE WHEN v_days_since_acquired > 0
      THEN ROUND((v_days_rented::numeric / v_days_since_acquired) * 100, 1)
      ELSE 0 END,
    'hourometer_history', v_hourometer_history
  );

  RETURN result;
END;
$$;
