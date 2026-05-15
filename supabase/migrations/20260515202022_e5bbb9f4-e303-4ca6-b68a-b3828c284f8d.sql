-- Add role guards to SECURITY DEFINER RPCs and tighten EXECUTE grants

CREATE OR REPLACE FUNCTION public.create_booking(p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false)
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

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift_id uuid;
  v_old_status text;
  v_other_active int;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'ventas'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id INTO v_forklift_id FROM bookings WHERE id = p_booking_id;
  UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;
  SELECT count(*) INTO v_other_active FROM bookings
   WHERE forklift_id = v_forklift_id AND id != p_booking_id AND status = 'confirmed';
  IF v_other_active = 0 THEN
    SELECT status INTO v_old_status FROM forklifts WHERE id = v_forklift_id;
    UPDATE forklifts SET status = 'available', updated_at = now() WHERE id = v_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_forklift_id, v_old_status, 'available', 'Booking cancelled');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inspection_id uuid;
  v_old_status text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inspection_id uuid;
  v_old_status text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_forklift(p_forklift_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  DELETE FROM damage_records WHERE forklift_id = p_forklift_id;
  DELETE FROM return_inspections WHERE forklift_id = p_forklift_id;
  DELETE FROM deliveries WHERE forklift_id = p_forklift_id;
  DELETE FROM status_logs WHERE forklift_id = p_forklift_id;
  DELETE FROM maintenance_logs WHERE forklift_id = p_forklift_id;
  DELETE FROM bookings WHERE forklift_id = p_forklift_id;
  DELETE FROM forklifts WHERE id = p_forklift_id;
END;
$function$;

-- Change default self-registration role: assign 'customer' (zero privilege) instead of 'dispatcher'.
-- Staff must be elevated explicitly via invite-user edge function.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$function$;