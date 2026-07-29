-- DB4-03 (N-R4-A, MEDIO): re-emision acumulativa de audit_trigger_fn.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_changed text[]; v_key text;
  v_user_id uuid; v_email text; v_is_e2e_actor boolean := false;
  v_e2e_flag_changed boolean := false;
  v_jwt_role text;
  v_privileged_e2e_session boolean := false;
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

  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) ? 'is_e2e') THEN
    v_e2e_flag_changed :=
      ((to_jsonb(NEW)->>'is_e2e') IS DISTINCT FROM (to_jsonb(OLD)->>'is_e2e'))
      OR ((to_jsonb(NEW)->>'e2e_scope') IS DISTINCT FROM (to_jsonb(OLD)->>'e2e_scope'));
  END IF;

  IF v_is_e2e_actor THEN
    IF v_e2e_flag_changed THEN
      v_old := to_jsonb(OLD) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      v_new := to_jsonb(NEW) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, ARRAY['is_e2e','e2e_scope'], v_user_id);
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
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_new, v_user_id);
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
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, v_changed, v_user_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF (to_jsonb(OLD) ? 'is_e2e') AND ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE) THEN RETURN OLD; END IF;
    v_old := to_jsonb(OLD) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_old, v_user_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $function$;