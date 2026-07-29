-- DB4-05 (N1-r4, MEDIO): re-emision acumulativa de damage_restore_forklift_status (DB3-14a).
CREATE OR REPLACE FUNCTION public.damage_restore_forklift_status(p_forklift_id uuid, p_previous text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.maintenance_logs
    WHERE forklift_id = p_forklift_id
      AND deleted_at IS NULL
      AND work_status IN ('pending', 'in_progress')
  ) THEN
    RETURN 'maintenance';
  END IF;

  IF p_previous = 'rented'
     AND EXISTS (SELECT 1 FROM public.bookings
                  WHERE forklift_id = p_forklift_id AND status = 'confirmed') THEN
    RETURN 'rented';
  END IF;
  RETURN 'available';
END; $$;