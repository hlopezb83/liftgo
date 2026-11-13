-- Archived orders retain their existing consumption and costs for consultation.
-- Lock both parents before every child write, including moves between orders.
-- No historical rows, policies, stock triggers or archive/restore RPCs change.
CREATE OR REPLACE FUNCTION public.reject_mutations_on_closed_maintenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_log_id uuid; v_parent record;
BEGIN
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  IF v_log_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  FOR v_parent IN
    SELECT work_status, deleted_at FROM public.maintenance_logs
      WHERE id = v_log_id OR (TG_OP = 'UPDATE' AND id = OLD.maintenance_log_id)
      ORDER BY id FOR UPDATE
  LOOP
    IF v_parent.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'La orden está archivada. Restáurala antes de modificar refacciones o mano de obra.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.work_status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'No se pueden modificar refacciones ni mano de obra de una orden %.', v_parent.work_status
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_mutations_on_closed_maintenance() FROM PUBLIC, anon, authenticated;
