-- FIX-02 (Alta · H8): una OT o log archivado (deleted_at IS NOT NULL) seguía
-- bloqueando disponibilidad futura y el estado 'maintenance' de la unidad.
-- (a) get_available_forklifts ignora ahora logs/OTs archivados.
-- (b) soft_delete_maintenance_log cancela la OT si estaba abierta al archivar.

CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
RETURNS SETOF forklifts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
  SELECT f.*
  FROM forklifts f
  WHERE f.status IN ('available', 'rented')
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND b.status NOT IN ('completed', 'cancelled')
        AND b.start_date <= p_end_date
        AND b.end_date >= p_start_date
    )
    -- R10 B11.6: mantenimiento programado que traslapa la ventana solicitada
    -- (con buffer de 3 días alrededor del next_service_date).
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
        FROM maintenance_logs ml
        WHERE ml.next_service_date IS NOT NULL
          AND ml.deleted_at IS NULL          -- H8: ignorar logs archivados
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
        AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
    )
    -- R10 B11.5: OTs en curso bloquean nuevas reservas.
    AND NOT EXISTS (
      SELECT 1 FROM maintenance_logs ml
      WHERE ml.forklift_id = f.id AND ml.work_status = 'in_progress'
        AND ml.deleted_at IS NULL            -- H8: ignorar OTs archivadas
    )
  ORDER BY f.name;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  -- H8: una OT archivada no puede seguir "abierta" (bloquea disponibilidad y
  -- estado de la unidad para siempre). Se cancela en la misma transacción,
  -- lo que dispara trg_sync_forklift_on_maintenance y libera la unidad si no
  -- hay otros bloqueos.
  UPDATE maintenance_logs
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         work_status = CASE
           WHEN work_status IN ('pending', 'in_progress', 'scheduled') THEN 'cancelled'
           ELSE work_status
         END,
         updated_at = now()
   WHERE id = p_log_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;
END;
$$;

-- Backfill H8 (a): cancelar OTs abiertas que ya estaban archivadas.
UPDATE public.maintenance_logs
   SET work_status = 'cancelled', updated_at = now()
 WHERE deleted_at IS NOT NULL
   AND work_status IN ('pending', 'in_progress', 'scheduled');

-- Backfill H8 (b): liberar unidades atascadas en 'maintenance' sin bloqueo real
-- (sin OT abierta vigente, sin daño abierto y sin renta activa hoy).
UPDATE public.forklifts f
   SET status = 'available', updated_at = now()
 WHERE f.status = 'maintenance'
   AND f.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_logs ml
                    WHERE ml.forklift_id = f.id AND ml.deleted_at IS NULL
                      AND ml.work_status IN ('pending', 'in_progress'))
   AND NOT EXISTS (SELECT 1 FROM public.damage_records dr
                    WHERE dr.forklift_id = f.id AND dr.deleted_at IS NULL
                      AND dr.status IN ('reported', 'in_repair'))
   AND NOT EXISTS (SELECT 1 FROM public.bookings b
                    WHERE b.forklift_id = f.id AND b.status = 'confirmed'
                      AND public.today_mty() BETWEEN b.start_date AND b.end_date);
