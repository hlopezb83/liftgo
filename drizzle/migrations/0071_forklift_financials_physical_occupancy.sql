-- Días Rentado mide ocupación física, no el periodo previsto o facturado.
-- Una entrega completada habilita el conteo; devolución/inspección lo detiene.
-- Historias anteriores sin completed_at conservan scheduled_date únicamente
-- para movimientos ya completados. Un cierre sin evento de retorno conserva
-- end_date como límite histórico. No cambia reservas, facturas ni otras RPC.
-- CREATE OR REPLACE conserva el ACL existente; INVOKER mantiene RLS por empresa.
CREATE OR REPLACE FUNCTION public.get_forklift_financials(p_forklift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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
  v_today date := public.today_mty();
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'auditor'::app_role) OR
    has_role((select auth.uid()), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(SUM(r.net_mxn_share), 0) INTO v_revenue
  FROM public.v_invoice_forklift_revenue r
  WHERE r.forklift_id = p_forklift_id
    AND r.status IN ('paid', 'partial', 'sent', 'overdue')
    AND r.is_e2e IS NOT TRUE;

  SELECT COALESCE(SUM(cost), 0) INTO v_maintenance_cost
  FROM maintenance_logs
  WHERE forklift_id = p_forklift_id
    AND deleted_at IS NULL
    AND is_e2e IS NOT TRUE;

  SELECT COALESCE(acquisition_cost, 0),
    COALESCE(acquisition_date, (created_at AT TIME ZONE 'America/Monterrey')::date)
  INTO v_acquisition_cost, v_anchor
  FROM forklifts WHERE id = p_forklift_id;

  v_days_since_acquired := GREATEST((v_today - v_anchor) + 1, 1);

  WITH occupancy AS (
    SELECT outbound.delivered_on,
      LEAST(v_today, COALESCE(inbound.returned_on,
        CASE WHEN b.return_status = 'returned' OR b.status = 'completed'
          THEN b.end_date ELSE v_today END)) AS returned_on
    FROM public.bookings b
    CROSS JOIN LATERAL (
      SELECT min(COALESCE((d.completed_at AT TIME ZONE 'America/Monterrey')::date,
        d.scheduled_date)) AS delivered_on
      FROM public.deliveries d
      WHERE d.booking_id = b.id AND d.forklift_id = b.forklift_id
        AND d.organization_id = b.organization_id
        AND d.type = 'delivery' AND d.status = 'completed'
    ) outbound
    CROSS JOIN LATERAL (
      SELECT min(events.returned_on) AS returned_on
      FROM (
        SELECT (ri.inspected_at AT TIME ZONE 'America/Monterrey')::date AS returned_on
        FROM public.return_inspections ri
        WHERE ri.booking_id = b.id AND ri.forklift_id = b.forklift_id
          AND ri.organization_id = b.organization_id
        UNION ALL
        SELECT COALESCE((d.completed_at AT TIME ZONE 'America/Monterrey')::date,
          d.scheduled_date)
        FROM public.deliveries d
        WHERE d.booking_id = b.id AND d.forklift_id = b.forklift_id
          AND d.organization_id = b.organization_id
          AND d.type = 'pickup' AND d.status = 'completed'
      ) events
    ) inbound
    WHERE b.forklift_id = p_forklift_id
      AND b.status IN ('confirmed', 'completed')
      AND b.is_e2e IS NOT TRUE
      AND outbound.delivered_on <= v_today
  )
  -- Enteros sobre fechas evitan depender de la zona horaria de la sesión.
  -- DISTINCT cuenta una fecha una sola vez aun con reservas superpuestas.
  SELECT COUNT(DISTINCT (o.delivered_on + days.day_offset))::int
  INTO v_days_rented
  FROM occupancy o
  CROSS JOIN LATERAL generate_series(0, o.returned_on - o.delivered_on) AS days(day_offset);

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
