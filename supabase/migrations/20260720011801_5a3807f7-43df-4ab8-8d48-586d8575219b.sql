
CREATE OR REPLACE FUNCTION public.get_mrr_detail()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_today date := (now() AT TIME ZONE 'America/Monterrey')::date;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- BL-50: mismo criterio que get_financial_kpis.v_mrr
  --   * recurring_billing = true
  --   * status = 'confirmed'
  --   * vigente hoy (start_date <= hoy AND (end_date IS NULL OR end_date >= hoy))
  --   * tarifa pactada primero, maestra como fallback
  --   * excluir reservas sin customer_id
  WITH rows_cte AS (
    SELECT
      f.id AS forklift_id, f.name AS forklift_name, f.model, f.manufacturer, f.serial_number,
      COALESCE(f.monthly_rate, 0) AS forklift_monthly_rate,
      COALESCE(f.daily_rate, 0) AS daily_rate,
      COALESCE(f.weekly_rate, 0) AS weekly_rate,
      c.id AS customer_id, c.name AS customer_name,
      b.booking_number, b.start_date, b.end_date,
      COALESCE(b.monthly_rate, f.monthly_rate, 0) AS monthly_rate,
      CASE WHEN b.monthly_rate IS NOT NULL THEN 'booking' ELSE 'forklift' END AS rate_source
    FROM bookings b
    JOIN forklifts f ON f.id = b.forklift_id
    JOIN customers c ON c.id = b.customer_id
    WHERE b.recurring_billing = true
      AND b.status = 'confirmed'
      AND b.start_date <= v_today
      AND (b.end_date IS NULL OR b.end_date >= v_today)
      AND COALESCE(b.is_e2e, false) = false
      AND COALESCE(f.is_e2e, false) = false
  )
  SELECT json_build_object(
    'items', COALESCE(json_agg(json_build_object(
      'forklift_id', forklift_id, 'forklift_name', forklift_name, 'model', model,
      'manufacturer', manufacturer, 'serial_number', serial_number,
      'monthly_rate', monthly_rate,
      'forklift_monthly_rate', forklift_monthly_rate,
      'rate_source', rate_source,
      'daily_rate', daily_rate, 'weekly_rate', weekly_rate,
      'customer_name', customer_name, 'customer_id', customer_id,
      'booking_number', booking_number,
      'start_date', start_date, 'end_date', end_date
    ) ORDER BY customer_name, booking_number), '[]'::json),
    'total_mrr', COALESCE(SUM(monthly_rate), 0)
  ) INTO result
  FROM rows_cte;

  RETURN result;
END;
$function$;
