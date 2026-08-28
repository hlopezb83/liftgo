-- G-C2: la regla "solo admin/administrativo cierra un deal como Ganado" vivía
-- únicamente en el cliente (useProspectGuard). El rol `ventas` tiene FOR ALL
-- sobre public.prospects, así que podía marcar cerrado_ganado saltándose la UI.
CREATE OR REPLACE FUNCTION public.validate_prospect_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF NEW.stage = 'cerrado_ganado' AND (NEW.final_amount IS NULL OR NEW.final_amount <= 0) THEN
    RAISE EXCEPTION 'No se puede cerrar como ganado sin un monto final mayor a cero (final_amount=%)', NEW.final_amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- Guard de rol. Se omite cuando no hay sesión de usuario (service_role,
  -- tareas programadas) o durante el sembrado E2E, que corre con definer.
  IF NEW.stage = 'cerrado_ganado'
     AND (TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage)
     AND v_uid IS NOT NULL
     AND coalesce(current_setting('app.e2e_seed', true), '') <> 'on'
     AND NOT (
       public.has_role(v_uid, 'admin'::app_role)
       OR public.has_role(v_uid, 'administrativo'::app_role)
     )
  THEN
    RAISE EXCEPTION 'Solo un administrador o administrativo puede cerrar un prospecto como Ganado'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.stage = 'cerrado_perdido' AND (NEW.lost_reason IS NULL OR length(trim(NEW.lost_reason)) = 0) THEN
    RAISE EXCEPTION 'Razón de pérdida requerida al marcar como Cerrado Perdido';
  END IF;
  IF NEW.stage IN ('cerrado_ganado','cerrado_perdido') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  IF NEW.stage NOT IN ('cerrado_ganado','cerrado_perdido') THEN
    NEW.closed_at := NULL;
    NEW.lost_reason := NULL;
    NEW.final_amount := NULL;
  END IF;
  RETURN NEW;
END; $$;