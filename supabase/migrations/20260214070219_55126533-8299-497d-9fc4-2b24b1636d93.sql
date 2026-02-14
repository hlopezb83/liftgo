
-- RPC: create_booking (atomic: insert booking + update forklift status + insert status_log)
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
BEGIN
  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed')
  RETURNING id INTO v_booking_id;

  UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  SELECT p_forklift_id, f.status, 'rented', 'Booked'
  FROM forklifts f WHERE f.id = p_forklift_id;
  -- Note: the from_status above will capture the OLD status before the update since we already updated.
  -- Let's fix: we need to capture before update. Rewrite:
  -- Actually the UPDATE already ran, so from_status would be 'rented'. Let me restructure.

  RETURN v_booking_id;
END;
$$;

-- Drop and recreate with correct ordering
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, text, text, date, date, boolean);

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
  v_old_status text;
BEGIN
  -- Capture old status first
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

-- RPC: delete_forklift (atomic: delete related records + forklift)
CREATE OR REPLACE FUNCTION public.delete_forklift(p_forklift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM damage_records WHERE forklift_id = p_forklift_id;
  DELETE FROM return_inspections WHERE forklift_id = p_forklift_id;
  DELETE FROM deliveries WHERE forklift_id = p_forklift_id;
  DELETE FROM status_logs WHERE forklift_id = p_forklift_id;
  DELETE FROM maintenance_logs WHERE forklift_id = p_forklift_id;
  DELETE FROM bookings WHERE forklift_id = p_forklift_id;
  DELETE FROM forklifts WHERE id = p_forklift_id;
END;
$$;

-- RPC: complete_return_inspection (atomic: insert inspection + update booking + update forklift + log status)
CREATE OR REPLACE FUNCTION public.complete_return_inspection(
  p_booking_id uuid,
  p_forklift_id uuid,
  p_condition text DEFAULT 'good',
  p_damage_notes text DEFAULT NULL,
  p_damage_cost numeric DEFAULT 0,
  p_hours_used numeric DEFAULT NULL,
  p_fuel_level text DEFAULT NULL,
  p_inspected_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inspection_id uuid;
  v_old_status text;
BEGIN
  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id;

  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by)
  RETURNING id INTO v_inspection_id;

  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;

  UPDATE forklifts SET status = 'available', updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, 'available', 'Returned — condition: ' || p_condition);

  RETURN v_inspection_id;
END;
$$;
