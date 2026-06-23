-- 1) Drop duplicate activity triggers
DROP TRIGGER IF EXISTS activity_bookings         ON public.bookings;
DROP TRIGGER IF EXISTS activity_invoices         ON public.invoices;
DROP TRIGGER IF EXISTS activity_maintenance_logs ON public.maintenance_logs;

-- 2) Reinforce audit_trigger_fn with actor-email-based E2E filter
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
  v_email text;
  v_is_e2e_actor boolean := false;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
      IF v_email IS NOT NULL AND (v_email ILIKE 'e2e-%@%' OR v_email ILIKE '%@liftgo.test') THEN
        v_is_e2e_actor := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_is_e2e_actor := false;
    END;
  END IF;

  IF v_is_e2e_actor THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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

-- 3) Reinforce log_activity with actor-email-based E2E filter
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_table text;
  v_title text;
  v_description text;
  v_uid uuid;
  v_email text;
  v_actor_name text;
  v_actor_role public.app_role;
  v_row jsonb;
  v_is_e2e boolean := false;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
      IF v_email IS NOT NULL AND (v_email ILIKE 'e2e-%@%' OR v_email ILIKE '%@liftgo.test') THEN
        RETURN COALESCE(NEW, OLD);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'Creación'
    WHEN 'UPDATE' THEN 'Actualización'
    WHEN 'DELETE' THEN 'Eliminación'
    ELSE TG_OP
  END;

  v_table := CASE TG_TABLE_NAME
    WHEN 'bookings' THEN 'Reserva'
    WHEN 'invoices' THEN 'Factura'
    WHEN 'forklifts' THEN 'Montacargas'
    WHEN 'maintenance_logs' THEN 'Mantenimiento'
    WHEN 'operating_expenses' THEN 'Gasto'
    WHEN 'prospects' THEN 'Prospectos'
    WHEN 'suppliers' THEN 'Proveedores'
    ELSE TG_TABLE_NAME
  END;

  v_title := v_action || ' de ' || v_table;

  v_description := CASE TG_OP
    WHEN 'INSERT' THEN 'Se creó un registro de ' || v_table
    WHEN 'UPDATE' THEN 'Se actualizó un registro de ' || v_table
    WHEN 'DELETE' THEN 'Se eliminó un registro de ' || v_table
    ELSE 'Operación en ' || v_table
  END;

  IF v_uid IS NOT NULL THEN
    SELECT p.full_name INTO v_actor_name
    FROM public.profiles p
    WHERE p.user_id = v_uid OR p.id = v_uid
    LIMIT 1;

    SELECT ur.role INTO v_actor_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
    ORDER BY CASE ur.role
      WHEN 'admin' THEN 1
      WHEN 'administrativo' THEN 2
      WHEN 'ventas' THEN 3
      WHEN 'dispatcher' THEN 4
      WHEN 'mechanic' THEN 5
      WHEN 'auditor' THEN 6
      ELSE 99
    END
    LIMIT 1;
  END IF;

  v_row := to_jsonb(COALESCE(NEW, OLD));
  IF v_row ? 'is_e2e' THEN
    v_is_e2e := COALESCE((v_row->>'is_e2e')::boolean, false);
  END IF;

  INSERT INTO public.activity_feed (
    event_type, entity_type, entity_id, title, description,
    actor_id, actor_name, actor_role, is_e2e
  )
  VALUES (
    TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id),
    v_title, v_description,
    v_uid,
    COALESCE(v_actor_name, CASE WHEN v_uid IS NULL THEN 'Sistema' ELSE NULL END),
    v_actor_role,
    v_is_e2e
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4) Cleanup contaminated rows
DELETE FROM public.activity_feed
WHERE actor_name ILIKE 'e2e-%' OR actor_name ILIKE '%@liftgo.test';

DELETE FROM public.audit_logs
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email ILIKE 'e2e-%@%' OR email ILIKE '%@liftgo.test'
);

-- Deduplicate residual rows from the duplicate triggers
DELETE FROM public.activity_feed a
USING public.activity_feed b
WHERE a.id > b.id
  AND a.entity_type = b.entity_type
  AND a.entity_id   = b.entity_id
  AND a.event_type  = b.event_type
  AND a.created_at  = b.created_at;