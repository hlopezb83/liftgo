
CREATE OR REPLACE FUNCTION public.get_mrr_detail()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'forklift_id', f.id,
          'forklift_name', f.name,
          'model', f.model,
          'manufacturer', f.manufacturer,
          'serial_number', f.serial_number,
          'monthly_rate', COALESCE(f.monthly_rate, 0),
          'daily_rate', COALESCE(f.daily_rate, 0),
          'weekly_rate', COALESCE(f.weekly_rate, 0),
          'customer_name', c.name,
          'customer_id', b.customer_id,
          'booking_number', b.booking_number,
          'start_date', b.start_date,
          'end_date', b.end_date
        ) ORDER BY f.name
      )
      FROM forklifts f
      LEFT JOIN LATERAL (
        SELECT b2.customer_id, b2.booking_number, b2.start_date, b2.end_date
        FROM bookings b2
        WHERE b2.forklift_id = f.id
          AND b2.status = 'confirmed'
          AND CURRENT_DATE BETWEEN b2.start_date AND b2.end_date
        ORDER BY b2.start_date DESC
        LIMIT 1
      ) b ON true
      LEFT JOIN customers c ON c.id = b.customer_id
      WHERE f.status = 'rented'
    ), '[]'::jsonb),
    'total_mrr', COALESCE((
      SELECT SUM(COALESCE(monthly_rate, 0))
      FROM forklifts
      WHERE status = 'rented'
    ), 0)
  );
$$;
