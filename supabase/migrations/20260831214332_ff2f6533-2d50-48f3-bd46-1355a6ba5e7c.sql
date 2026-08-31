-- =====================================================================
-- R5 · Lote 3 (integridad)
-- A5: archivar una OT abierta ya no borra refacciones / mano de obra.
-- A6: restauracion de OTs y daños archivados (solo admin).
-- A7: criterio unico de "reserva devuelta".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Criterio canonico de devolucion.
--    Antes varias funciones buscaban `deliveries.type = 'return'`, un tipo
--    que la aplicacion nunca genera (usa 'delivery' / 'pickup'), por lo que
--    el predicado jamas reconocia una devolucion. La señal real la fija
--    `complete_return_inspection`: return_status = 'returned' + inspeccion.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_is_returned(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM public.bookings b
            WHERE b.id = p_booking_id AND b.return_status = 'returned'
         )
      OR EXISTS (
           SELECT 1 FROM public.return_inspections ri
            WHERE ri.booking_id = p_booking_id
         );
$function$;

REVOKE EXECUTE ON FUNCTION public.booking_is_returned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_is_returned(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_open_rental(p_forklift_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'ventas'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.deliveries d
      ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
    WHERE b.forklift_id = p_forklift_id
      AND b.status = 'confirmed'
      AND NOT public.booking_is_returned(b.id)
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) Archivar una OT abierta conserva refacciones y mano de obra.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role)
          OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  SELECT work_status INTO v_status
    FROM public.maintenance_logs
   WHERE id = p_log_id AND deleted_at IS NULL;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;

  -- E1: una OT cerrada (posiblemente ya facturada) solo la archiva un admin.
  IF v_status = 'completed' AND NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'La orden de trabajo esta cerrada: solo un administrador puede archivarla';
  END IF;

  -- R5-A5: el archivado NUNCA borra hijos. Antes las OTs abiertas perdian
  -- fisicamente refacciones y mano de obra, y al restaurarlas ya no existian.
  PERFORM set_config('app.maintenance_archive_rpc', 'on', true);

  UPDATE public.maintenance_logs
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = p_log_id AND deleted_at IS NULL;

  PERFORM set_config('app.maintenance_archive_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.maintenance_archive_rpc', 'off', true);
  RAISE;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) Restaurar una OT archivada (solo admin).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_maintenance_log(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift uuid;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar mantenimientos'
      USING ERRCODE = '42501';
  END IF;

  SELECT forklift_id INTO v_forklift
    FROM public.maintenance_logs
   WHERE id = p_log_id AND deleted_at IS NOT NULL
   FOR UPDATE;

  IF v_forklift IS NULL THEN
    RAISE EXCEPTION 'Registro no encontrado o no esta archivado';
  END IF;

  UPDATE public.maintenance_logs
     SET deleted_at = NULL,
         updated_at = now()
   WHERE id = p_log_id;

  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
  VALUES (v_forklift, 'ot:archived', 'ot:active',
          'Orden de trabajo ' || p_log_id::text || ' restaurada desde archivados',
          (select auth.uid()));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.restore_maintenance_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_maintenance_log(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Restaurar un daño archivado (solo admin).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_damage_record(p_damage_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift uuid;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar daños'
      USING ERRCODE = '42501';
  END IF;

  SELECT forklift_id INTO v_forklift
    FROM public.damage_records
   WHERE id = p_damage_id AND deleted_at IS NOT NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o no esta archivado';
  END IF;

  UPDATE public.damage_records
     SET deleted_at = NULL,
         deleted_by = NULL
   WHERE id = p_damage_id;

  IF v_forklift IS NOT NULL THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'damage:archived', 'damage:active',
            'Daño ' || p_damage_id::text || ' restaurado desde archivados',
            (select auth.uid()));
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.restore_damage_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_damage_record(uuid) TO authenticated, service_role;