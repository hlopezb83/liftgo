
-- Update create_booking RPC to check for overlaps before inserting
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_contact text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_recurring_billing boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking_id uuid;
  v_old_status text;
BEGIN
  -- Check for overlapping bookings
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE forklift_id = p_forklift_id
      AND status != 'cancelled'
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya tiene una reserva en esas fechas';
  END IF;

  -- Capture old status
  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id;

  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed')
  RETURNING id INTO v_booking_id;

  UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, 'rented', 'Booked');

  RETURN v_booking_id;
END;
$$;
