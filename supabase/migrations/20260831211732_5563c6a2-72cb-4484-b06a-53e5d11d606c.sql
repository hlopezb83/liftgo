CREATE OR REPLACE FUNCTION public.guard_quote_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jwt_role text;
BEGIN
  IF current_setting('app.e2e_teardown', true) = 'on'
     AND OLD.is_e2e IS TRUE
     AND OLD.e2e_scope IS NOT NULL THEN
    RETURN OLD;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' AND OLD.is_e2e IS TRUE THEN
    RETURN OLD;
  END IF;

  IF OLD.status = 'accepted' THEN
    RAISE EXCEPTION 'No se puede borrar una cotizacion aceptada. Cancelala primero (admin/administrativo) o crea una version nueva.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A3B-05: las reservas canceladas ya no bloquean el borrado (limbo).
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE quote_id = OLD.id
       AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'No se puede borrar una cotizacion con reservas vigentes (trazabilidad comercial).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END; $$;

REVOKE EXECUTE ON FUNCTION public.guard_quote_delete() FROM PUBLIC, anon, authenticated;