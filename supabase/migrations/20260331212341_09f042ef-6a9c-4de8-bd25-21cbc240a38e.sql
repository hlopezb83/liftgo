DROP FUNCTION IF EXISTS public.get_mrr_detail();

CREATE OR REPLACE FUNCTION public.get_mrr_detail()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'items', COALESCE(json_agg(
      json_build_object(
        'forklift_id', f.id,
        'forklift_name', f.name,
        'model', f.model,
        'manufacturer', f.manufacturer,
        'serial_number', f.serial_number,
        'monthly_rate', COALESCE(f.monthly_rate, 0),
        'daily_rate', COALESCE(f.daily_rate, 0),
        'weekly_rate', COALESCE(f.weekly_rate, 0),
        'customer_name', c.name,
        'customer_id', c.id,
        'booking_number', active_booking.booking_number,
        'start_date', active_booking.start_date,
        'end_date', active_booking.end_date
      )
    ), '[]'::json),
    'total_mrr', COALESCE(SUM(f.monthly_rate), 0)
  ) INTO result
  FROM forklifts f
  JOIN LATERAL (
    SELECT b.customer_id, b.booking_number, b.start_date, b.end_date
    FROM bookings b
    WHERE b.forklift_id = f.id
      AND b.status = 'confirmed'
      AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
    ORDER BY b.start_date DESC
    LIMIT 1
  ) active_booking ON true
  LEFT JOIN customers c ON c.id = active_booking.customer_id
  WHERE f.status = 'rented';

  RETURN result;
END;
$$;