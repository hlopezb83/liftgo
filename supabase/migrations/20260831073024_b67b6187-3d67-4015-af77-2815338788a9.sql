-- A6R2-5: reabrir una OT cerrada solo por la RPC dedicada (admin + motivo).
CREATE OR REPLACE FUNCTION public.guard_maintenance_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.work_status, '') NOT IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.work_status, '') = COALESCE(OLD.work_status, '') THEN
    RETURN NEW;
  END IF;

  -- Bandera transaccional que solo activa `reopen_work_order`.
  IF COALESCE(current_setting('app.maintenance_reopen_rpc', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;
  -- Convención de seeds E2E ya usada por los demás guards.
  IF COALESCE(current_setting('app.e2e_seed', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'La orden de trabajo ya está cerrada: usa la acción de reapertura para volver a abrirla.'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_maintenance_reopen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_maintenance_reopen ON public.maintenance_logs;
CREATE TRIGGER trg_guard_maintenance_reopen
BEFORE UPDATE OF work_status ON public.maintenance_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_reopen();

CREATE OR REPLACE FUNCTION public.reopen_work_order(p_log_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
BEGIN
  IF NOT has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede reabrir una orden de trabajo'
      USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Se requiere un motivo para reabrir la orden de trabajo'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT work_status INTO v_old
    FROM public.maintenance_logs WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de trabajo % no existe', p_log_id;
  END IF;
  IF COALESCE(v_old, '') NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'La orden de trabajo no está cerrada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.maintenance_reopen_rpc', 'on', true);
  UPDATE public.maintenance_logs
     SET work_status = 'in_progress'
   WHERE id = p_log_id;
  PERFORM set_config('app.maintenance_reopen_rpc', 'off', true);

  INSERT INTO public.status_logs (entity_type, entity_id, from_status, to_status, reason, changed_by)
  VALUES ('maintenance_log', p_log_id, v_old, 'in_progress', btrim(p_reason), (select auth.uid()));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reopen_work_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_work_order(uuid, text) TO authenticated;