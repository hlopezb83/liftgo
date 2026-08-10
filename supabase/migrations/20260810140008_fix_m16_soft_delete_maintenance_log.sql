-- FIX-08 (Media · M16): archivar una OT no reponía stock de refacciones ni
-- eliminaba mano de obra. Reemplaza de nuevo soft_delete_maintenance_log
-- (incluye la cancelación de OT abierta del FIX-02/H8).
CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.maintenance_logs WHERE id = p_log_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;

  -- M16: devolver refacciones al inventario. El trigger
  -- trg_maintenance_parts_adjust_stock (rama DELETE) repone stock_quantity y
  -- trg_maintenance_parts_recalc_cost recalcula maintenance_logs.cost.
  DELETE FROM public.maintenance_parts WHERE maintenance_log_id = p_log_id;
  -- M16: la mano de obra de una OT archivada no debe quedar costeada.
  DELETE FROM public.maintenance_labor WHERE maintenance_log_id = p_log_id;

  -- H8: cancelar la OT si estaba abierta (libera la unidad vía trigger de sync).
  UPDATE public.maintenance_logs
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         work_status = CASE
           WHEN work_status IN ('pending', 'in_progress', 'scheduled') THEN 'cancelled'
           ELSE work_status
         END,
         updated_at = now()
   WHERE id = p_log_id;
END;
$$;
