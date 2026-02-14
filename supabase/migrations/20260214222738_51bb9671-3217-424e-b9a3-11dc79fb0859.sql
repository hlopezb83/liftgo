CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_forklift_id uuid;
  v_old_status text;
  v_other_active int;
BEGIN
  SELECT forklift_id INTO v_forklift_id
  FROM bookings WHERE id = p_booking_id;

  UPDATE bookings SET status = 'cancelled', updated_at = now()
  WHERE id = p_booking_id;

  SELECT count(*) INTO v_other_active
  FROM bookings
  WHERE forklift_id = v_forklift_id
    AND id != p_booking_id
    AND status = 'confirmed';

  IF v_other_active = 0 THEN
    SELECT status INTO v_old_status FROM forklifts WHERE id = v_forklift_id;
    UPDATE forklifts SET status = 'available', updated_at = now()
    WHERE id = v_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_forklift_id, v_old_status, 'available', 'Booking cancelled');
  END IF;
END;
$$;