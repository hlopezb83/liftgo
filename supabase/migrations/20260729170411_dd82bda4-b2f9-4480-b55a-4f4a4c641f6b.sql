-- DB2-18
CREATE OR REPLACE FUNCTION public.guard_quote_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    RAISE EXCEPTION 'No se puede borrar una cotizacion aceptada. Rechazala o crea una version nueva.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede borrar una cotizacion con reservas ligadas (trazabilidad comercial).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_quote_delete ON public.quotes;
CREATE TRIGGER trg_guard_quote_delete
  BEFORE DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_delete();

-- DB2-20
CREATE OR REPLACE FUNCTION public.sync_invoice_status_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_total numeric(14,2);
  v_status text;
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_latest_date date;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total, status INTO v_total, v_status
  FROM invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_paid, v_latest_date
  FROM payments WHERE invoice_id = v_invoice_id;

  v_balance := round(v_total - v_paid, 2);

  IF v_status IN ('cancelled', 'draft') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.payment_sync', 'on', true);

  IF v_balance <= 0 AND v_status <> 'paid' THEN
    UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, CURRENT_DATE)
      WHERE id = v_invoice_id;
  ELSIF v_balance > 0 AND v_paid > 0 AND v_status <> 'partial' THEN
    UPDATE invoices SET status = 'partial', paid_at = NULL
      WHERE id = v_invoice_id;
  ELSIF v_paid = 0 AND v_status <> 'sent' THEN
    UPDATE invoices SET status = 'sent', paid_at = NULL
      WHERE id = v_invoice_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- DB2-21a
CREATE OR REPLACE FUNCTION public.guard_profiles_last_active_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_admins int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = OLD.user_id AND role = 'admin'::public.app_role
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.is_active IS TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.user_roles WHERE role = 'admin'::public.app_role FOR UPDATE;

  SELECT count(*) INTO v_active_admins
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
   WHERE ur.role = 'admin'::public.app_role
     AND p.is_active IS TRUE;

  IF v_active_admins <= 1 THEN
    RAISE EXCEPTION 'LAST_ACTIVE_ADMIN_CANNOT_BE_DEACTIVATED'
      USING HINT = 'Debe quedar al menos un administrador activo en el sistema.',
            ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_last_active_admin ON public.profiles;
CREATE TRIGGER trg_profiles_last_active_admin
  BEFORE UPDATE OF is_active OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_last_active_admin();

-- DB2-21b
CREATE OR REPLACE FUNCTION public.is_e2e_actor_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_email IS NOT NULL AND p_email ILIKE 'e2e-%@liftgo.test';
$$;

COMMENT ON FUNCTION public.is_e2e_actor_email(text) IS
  'Actor e2e legítimo = correo e2e-* en el dominio exacto @liftgo.test (DB2-21b).';

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_changed text[]; v_key text;
  v_user_id uuid; v_email text; v_is_e2e_actor boolean := false;
  v_e2e_flag_changed boolean := false;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;

  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
      v_is_e2e_actor := public.is_e2e_actor_email(v_email);
    EXCEPTION WHEN OTHERS THEN v_is_e2e_actor := false; END;
  END IF;

  IF v_is_e2e_actor THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') AND ((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) THEN RETURN NEW; END IF;
    v_new := to_jsonb(NEW) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_new, v_user_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') THEN
      v_e2e_flag_changed :=
        ((to_jsonb(NEW)->>'is_e2e') IS DISTINCT FROM (to_jsonb(OLD)->>'is_e2e'))
        OR ((to_jsonb(NEW)->>'e2e_scope') IS DISTINCT FROM (to_jsonb(OLD)->>'e2e_scope'));
    END IF;
    IF NOT v_e2e_flag_changed
       AND (to_jsonb(NEW) ? 'is_e2e')
       AND (((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) OR ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE)) THEN
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

CREATE OR REPLACE FUNCTION public.guard_is_e2e_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text; v_jwt_role text;
BEGIN
  IF NEW.is_e2e IS NOT DISTINCT FROM OLD.is_e2e AND NEW.e2e_scope IS NOT DISTINCT FROM OLD.e2e_scope THEN RETURN NEW; END IF;
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' THEN RETURN NEW; END IF;
  BEGIN SELECT email INTO v_email FROM auth.users WHERE id = auth.uid(); EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  IF public.is_e2e_actor_email(v_email) THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Solo actores e2e o el service_role pueden modificar is_e2e/e2e_scope'
    USING ERRCODE = 'check_violation';
END; $$;