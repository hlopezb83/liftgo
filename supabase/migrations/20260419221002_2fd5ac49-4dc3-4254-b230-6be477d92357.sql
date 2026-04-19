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
BEGIN
  SELECT COALESCE(SUM(i.total), 0) INTO v_revenue
  FROM invoices i
  JOIN bookings b ON b.id = i.booking_id
  WHERE b.forklift_id = p_forklift_id
    AND i.status IN ('paid', 'partial', 'sent', 'overdue');

  SELECT COALESCE(SUM(cost), 0) INTO v_maintenance_cost
  FROM maintenance_logs
  WHERE forklift_id = p_forklift_id;

  SELECT COALESCE(acquisition_cost, 0),
         GREATEST((CURRENT_DATE - created_at::date), 1)
  INTO v_acquisition_cost, v_days_since_acquired
  FROM forklifts WHERE id = p_forklift_id;

  SELECT COALESCE(SUM(
    LEAST(end_date, CURRENT_DATE) - start_date
  ), 0) INTO v_days_rented
  FROM bookings
  WHERE forklift_id = p_forklift_id
    AND status IN ('confirmed', 'completed');

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
      THEN LEAST(100, ROUND((v_days_rented::numeric / v_days_since_acquired) * 100, 1))
      ELSE 0 END,
    'hourometer_history', v_hourometer_history
  );

  RETURN result;
END;
$function$;