-- P2: el archivado de maintenance_logs debe pasar SIEMPRE por
-- public.soft_delete_maintenance_log(), que es la única ruta que ejecuta los
-- efectos colaterales canónicos (regla de OT cerrada + limpieza de
-- maintenance_parts / maintenance_labor de OT abiertas, con su devolución de
-- inventario y recálculo de costo por triggers).

CREATE OR REPLACE FUNCTION public.guard_maintenance_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sólo la transición no archivado -> archivado. Desarchivar y las ediciones
  -- ordinarias quedan intactas.
  IF NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- Ruta canónica: bandera transaccional puesta por soft_delete_maintenance_log.
  IF coalesce(current_setting('app.maintenance_archive_rpc', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Sembrado E2E (misma convención que los guards previos).
  IF coalesce(current_setting('app.e2e_seed', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'El archivado de mantenimientos solo procede por soft_delete_maintenance_log'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_maintenance_archive() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_maintenance_archive ON public.maintenance_logs;
CREATE TRIGGER trg_guard_maintenance_archive
BEFORE UPDATE OF deleted_at ON public.maintenance_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_archive();

-- Mismo cuerpo/semántica de negocio que la versión actual; sólo se marca la
-- transacción como ruta canónica de archivado.
CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- E1: NUNCA borrar refacciones/mano de obra de una OT cerrada: son el
  -- historial de costos que alimenta rentabilidad y reportes. Solo se limpian
  -- los hijos de ordenes abiertas (borrador/en proceso), donde no hay costo real.
  IF v_status <> 'completed' THEN
    DELETE FROM public.maintenance_parts WHERE maintenance_log_id = p_log_id;
    DELETE FROM public.maintenance_labor WHERE maintenance_log_id = p_log_id;
  END IF;

  PERFORM set_config('app.maintenance_archive_rpc', 'on', true);

  UPDATE public.maintenance_logs
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = p_log_id AND deleted_at IS NULL;

  PERFORM set_config('app.maintenance_archive_rpc', 'off', true);
END;
$$;