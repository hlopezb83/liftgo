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

  -- FIX-R3-01: flag local a la transacción para pasar el guard de OTs cerradas.
  PERFORM set_config('app.maintenance_soft_delete', 'on', true);

  -- E1: en OTs cerradas se CONSERVAN refacciones y mano de obra; borrarlas
  -- destruia el costo historico del servicio en los reportes por unidad.
  IF v_status <> 'completed' THEN
    DELETE FROM public.maintenance_parts WHERE maintenance_log_id = p_log_id;
    DELETE FROM public.maintenance_labor WHERE maintenance_log_id = p_log_id;
  END IF;

  UPDATE public.maintenance_logs
     SET deleted_at = now(),
         deleted_by = (select auth.uid()),
         work_status = CASE
           WHEN work_status IN ('pending', 'in_progress', 'scheduled') THEN 'cancelled'
           ELSE work_status
         END,
         updated_at = now()
   WHERE id = p_log_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_maintenance_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_maintenance_log(uuid) TO authenticated;