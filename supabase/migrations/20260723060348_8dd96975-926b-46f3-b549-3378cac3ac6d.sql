
-- R10 Bloque 12.3: bloquear mutaciones a refacciones/MO en OTs cerradas
CREATE OR REPLACE FUNCTION public.reject_mutations_on_closed_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_status text;
BEGIN
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  IF v_log_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT status INTO v_status FROM maintenance_logs WHERE id = v_log_id;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'No se pueden modificar refacciones ni mano de obra de una orden %.', v_status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_parts_lock_closed ON public.maintenance_parts;
CREATE TRIGGER trg_maintenance_parts_lock_closed
BEFORE INSERT OR UPDATE OR DELETE ON public.maintenance_parts
FOR EACH ROW EXECUTE FUNCTION public.reject_mutations_on_closed_maintenance();

DROP TRIGGER IF EXISTS trg_maintenance_labor_lock_closed ON public.maintenance_labor;
CREATE TRIGGER trg_maintenance_labor_lock_closed
BEFORE INSERT OR UPDATE OR DELETE ON public.maintenance_labor
FOR EACH ROW EXECUTE FUNCTION public.reject_mutations_on_closed_maintenance();

-- R10 Bloque 9.3: complete_return_inspection idempotencia + rango temporal
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
  v_new_status text;
  v_customer_id uuid;
  v_is_damaged_condition boolean;
  v_booking_start date;
  v_existing_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
       OR has_role(auth.uid(), 'administrativo'::app_role)
       OR has_role(auth.uid(), 'dispatcher'::app_role)
       OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_is_damaged_condition := p_condition IN ('damaged', 'needs_repair');

  IF v_is_damaged_condition
     AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotencia: si ya existe inspección para esta reserva, devolverla.
  SELECT id INTO v_existing_id FROM return_inspections WHERE booking_id = p_booking_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Validación temporal: inspected_at debe ser >= start_date y no más de 30 días en el futuro
  SELECT start_date INTO v_booking_start FROM bookings WHERE id = p_booking_id;
  IF v_booking_start IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001';
  END IF;
  IF p_inspected_at::date < v_booking_start THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser anterior al inicio de la reserva (%).', v_booking_start
      USING ERRCODE = 'P0001';
  END IF;
  IF p_inspected_at > (now() + interval '30 days') THEN
    RAISE EXCEPTION 'La fecha de inspección no puede estar más de 30 días en el futuro.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id;
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;

  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at)
  RETURNING id INTO v_inspection_id;

  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;

  IF v_is_damaged_condition THEN
    INSERT INTO damage_records (inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status)
    VALUES (v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
            COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
            COALESCE(p_damage_cost, 0), 'reported');
    v_new_status := 'maintenance';
  ELSE
    v_new_status := 'available';
  END IF;

  UPDATE forklifts SET status = v_new_status, updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, v_new_status, 'Returned — condition: ' || p_condition);

  RETURN v_inspection_id;
END;
$$;
