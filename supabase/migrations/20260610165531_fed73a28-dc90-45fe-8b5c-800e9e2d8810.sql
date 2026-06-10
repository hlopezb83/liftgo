
-- Make audit_trigger_fn skip rows tagged as E2E (is_e2e = true).
-- Prevents test runs from polluting the production audit trail.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_key text;
  v_user_id uuid;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') AND ((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_user_id);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') AND (
      ((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE)
      OR ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE)
    ) THEN
      RETURN NEW;
    END IF;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := ARRAY[]::text[];
    FOR v_key IN SELECT jsonb_object_keys(v_new)
    LOOP
      IF v_key NOT IN ('updated_at', 'created_at') AND
         (v_old->v_key IS DISTINCT FROM v_new->v_key) THEN
        v_changed := v_changed || v_key;
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, v_changed, v_user_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF (to_jsonb(OLD) ? 'is_e2e') AND ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE) THEN
      RETURN OLD;
    END IF;
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_user_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

-- Purge existing E2E noise from the audit trail (760 records detected).
DELETE FROM public.audit_logs
WHERE (old_data->>'is_e2e' = 'true')
   OR (new_data->>'is_e2e' = 'true');
