CREATE OR REPLACE FUNCTION public.complete_return_inspection(
  p_booking_id uuid,
  p_forklift_id uuid,
  p_condition text DEFAULT 'good',
  p_damage_notes text DEFAULT NULL,
  p_damage_cost numeric DEFAULT 0,
  p_hours_used numeric DEFAULT NULL,
  p_fuel_level text DEFAULT NULL,
  p_inspected_by text DEFAULT NULL,
  p_inspected_at timestamptz DEFAULT now()
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

  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at)
  RETURNING id INTO v_inspection_id;

  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;

  UPDATE forklifts SET status = 'available', updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, 'available', 'Returned — condition: ' || p_condition);

  RETURN v_inspection_id;
END;
$$;