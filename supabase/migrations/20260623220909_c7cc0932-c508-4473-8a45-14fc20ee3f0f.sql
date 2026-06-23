CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text,
  p_customer_contact text DEFAULT NULL::text,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_recurring_billing boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid;
  v_booking_number text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'ventas'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM forklifts WHERE id = p_forklift_id AND status = 'available') THEN
    RAISE EXCEPTION 'El montacargas no está disponible';
  END IF;

  -- Serialize folio assignment to avoid race condition on parallel inserts
  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));

  v_booking_number := next_booking_number();

  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number)
  RETURNING id INTO v_booking_id;

  UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');

  RETURN v_booking_id;
END;
$function$;