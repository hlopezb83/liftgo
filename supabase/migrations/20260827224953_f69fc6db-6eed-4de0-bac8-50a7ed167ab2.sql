-- 1. Columnas de origen en la bitácora
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS is_e2e boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_source_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_source_check CHECK (source IN ('user', 'system', 'e2e'));

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_not_e2e
  ON public.audit_logs (created_at DESC) WHERE is_e2e = false;

-- 2. Backfill (la tabla es append-only: bandera de mantenimiento)
DO $backfill$
BEGIN
  PERFORM set_config('app.audit_maintenance', 'on', true);

  UPDATE public.audit_logs
     SET is_e2e = true, source = 'e2e'
   WHERE coalesce(new_data->>'is_e2e', old_data->>'is_e2e') = 'true'
      OR coalesce(new_data->>'e2e_scope', old_data->>'e2e_scope') IS NOT NULL;

  UPDATE public.audit_logs
     SET source = 'system'
   WHERE user_id IS NULL AND is_e2e = false AND source <> 'system';

  PERFORM set_config('app.audit_maintenance', 'off', true);
END
$backfill$;

-- 3. Trigger de auditoría: marca origen y cierra el hueco en tablas sin is_e2e
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_changed text[]; v_key text;
  v_user_id uuid; v_email text; v_is_e2e_actor boolean := false;
  v_e2e_flag_changed boolean := false;
  v_jwt_role text;
  v_privileged_e2e_session boolean := false;
  v_e2e_session boolean := false;
  v_is_e2e boolean := false;
  v_source text;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
      v_is_e2e_actor := public.is_e2e_actor_email(v_email);
    EXCEPTION WHEN OTHERS THEN v_is_e2e_actor := false; END;
  END IF;

  v_privileged_e2e_session := v_is_e2e_actor
    OR v_jwt_role = 'service_role'
    OR (current_setting('app.e2e_seed', true) = 'on'
        AND v_user_id IS NOT NULL
        AND public.has_role(v_user_id, 'admin'::public.app_role));

  -- Sesión de pruebas: el actor es E2E o el sembrado E2E está activo.
  v_e2e_session := v_is_e2e_actor OR current_setting('app.e2e_seed', true) = 'on';

  -- Registro de prueba: sesión de pruebas o payload con marca E2E.
  v_is_e2e := v_e2e_session
    OR (TG_OP <> 'DELETE' AND (to_jsonb(NEW) ? 'is_e2e')
        AND (((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) OR (to_jsonb(NEW)->>'e2e_scope') IS NOT NULL))
    OR (TG_OP <> 'INSERT' AND (to_jsonb(OLD) ? 'is_e2e')
        AND (((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE) OR (to_jsonb(OLD)->>'e2e_scope') IS NOT NULL));

  v_source := CASE
    WHEN v_is_e2e THEN 'e2e'
    WHEN current_setting('app.audit_source', true) = 'system' THEN 'system'
    WHEN v_user_id IS NULL THEN 'system'
    ELSE 'user'
  END;

  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) ? 'is_e2e') THEN
    v_e2e_flag_changed :=
      ((to_jsonb(NEW)->>'is_e2e') IS DISTINCT FROM (to_jsonb(OLD)->>'is_e2e'))
      OR ((to_jsonb(NEW)->>'e2e_scope') IS DISTINCT FROM (to_jsonb(OLD)->>'e2e_scope'));
  END IF;

  IF v_is_e2e_actor THEN
    IF v_e2e_flag_changed THEN
      v_old := to_jsonb(OLD) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      v_new := to_jsonb(NEW) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id, is_e2e, source)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, ARRAY['is_e2e','e2e_scope'], v_user_id, true, 'e2e');
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (to_jsonb(NEW) ? 'is_e2e')
       AND (((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) OR (to_jsonb(NEW)->>'e2e_scope') IS NOT NULL)
       AND v_privileged_e2e_session THEN
      RETURN NEW;
    END IF;
    v_new := to_jsonb(NEW) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, is_e2e, source)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_new, v_user_id, v_is_e2e, v_source);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT v_e2e_flag_changed
       AND (to_jsonb(NEW) ? 'is_e2e')
       AND (((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) OR ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE)
            OR (to_jsonb(NEW)->>'e2e_scope') IS NOT NULL OR (to_jsonb(OLD)->>'e2e_scope') IS NOT NULL)
       AND v_privileged_e2e_session THEN
      RETURN NEW;
    END IF;
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_changed := ARRAY[]::text[];
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key NOT IN ('updated_at', 'created_at') AND (v_old->v_key IS DISTINCT FROM v_new->v_key) THEN
        v_changed := v_changed || v_key;
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) > 0 THEN
      v_old := v_old - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      v_new := v_new - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id, is_e2e, source)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, v_changed, v_user_id, v_is_e2e, v_source);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF (to_jsonb(OLD) ? 'is_e2e') AND ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE) THEN RETURN OLD; END IF;
    v_old := to_jsonb(OLD) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id, is_e2e, source)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_old, v_user_id, v_is_e2e, v_source);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 4. Purga de registros de prueba (solo admin, solo filas marcadas)
CREATE OR REPLACE FUNCTION public.purge_e2e_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: purge_e2e_audit_logs requires admin role';
  END IF;

  PERFORM set_config('app.audit_maintenance', 'on', true);
  DELETE FROM public.audit_logs WHERE is_e2e = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.audit_maintenance', 'off', true);

  RETURN v_n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_e2e_audit_logs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_e2e_audit_logs() TO authenticated;
