
-- Update create_booking RPC to auto-assign booking_number
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
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_booking_number text;
BEGIN
  -- Check forklift is available
  IF NOT EXISTS (
    SELECT 1 FROM forklifts WHERE id = p_forklift_id AND status = 'available'
  ) THEN
    RAISE EXCEPTION 'El montacargas no está disponible';
  END IF;

  -- Generate booking number
  v_booking_number := next_booking_number();

  -- Create booking
  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number)
  RETURNING id INTO v_booking_id;

  -- Update forklift status
  UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;

  -- Log status change
  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');

  RETURN v_booking_id;
END;
$$;
