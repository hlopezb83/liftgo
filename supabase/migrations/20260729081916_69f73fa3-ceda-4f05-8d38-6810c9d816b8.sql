-- Ajuste DB-03: permitir regresión desde 'paid' cuando se reversa un pago
CREATE OR REPLACE FUNCTION public.validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['sent','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['sent','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['sent','partial','overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','accepted','rejected','expired']
      WHEN 'sent'     THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'  THEN ARRAY['draft']
      ELSE ARRAY[]::text[] END
    WHEN 'bookings' THEN CASE OLD.status::text
      WHEN 'confirmed' THEN ARRAY['completed','cancelled']
      WHEN 'completed' THEN ARRAY['confirmed']
      ELSE ARRAY[]::text[] END
    WHEN 'supplier_bills' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['pending','cancelled']
      WHEN 'pending'  THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['pending','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['pending','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['pending','partial','overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'forklifts' THEN CASE OLD.status::text
      WHEN 'available'      THEN ARRAY['rented','maintenance','out_of_service','retired','sold']
      WHEN 'rented'         THEN ARRAY['available','maintenance','out_of_service','retired','sold']
      WHEN 'maintenance'    THEN ARRAY['available','rented','out_of_service','retired','sold']
      WHEN 'out_of_service' THEN ARRAY['available','maintenance','retired','sold']
      WHEN 'retired'        THEN ARRAY['available']
      ELSE ARRAY[]::text[] END
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- DB-05 anti-sobrepago proveedores
CREATE OR REPLACE FUNCTION public.enforce_supplier_payment_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_total numeric(14,2);
  v_status public.supplier_bill_status;
  v_paid_after numeric(14,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('supplier_payment:' || NEW.bill_id::text));
  SELECT total, status INTO v_bill_total, v_status FROM public.supplier_bills WHERE id = NEW.bill_id FOR UPDATE;
  IF v_bill_total IS NULL THEN RAISE EXCEPTION 'Factura de proveedor no encontrada'; END IF;
  IF v_status IN ('cancelled','draft') THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en bills en estado %', v_status USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_after FROM public.supplier_payments WHERE bill_id = NEW.bill_id;
  IF TG_OP = 'INSERT' THEN v_paid_after := v_paid_after + NEW.amount;
  ELSIF TG_OP = 'UPDATE' THEN v_paid_after := v_paid_after - OLD.amount + NEW.amount; END IF;
  IF round(v_paid_after, 2) > v_bill_total THEN
    RAISE EXCEPTION 'El pago excede el saldo pendiente de la bill (total: %, pagado tras esta operacion: %)', v_bill_total, v_paid_after
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_supplier_payment_balance ON public.supplier_payments;
CREATE TRIGGER trg_enforce_supplier_payment_balance
  BEFORE INSERT OR UPDATE OF amount, bill_id ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_supplier_payment_balance();

-- DB-06 tolerancia estricta
CREATE OR REPLACE FUNCTION public.enforce_payment_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_invoice_total numeric(14,2);
  v_paid_after numeric(14,2);
  v_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_payment:' || NEW.invoice_id::text));
  SELECT total, status INTO v_invoice_total, v_status FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_invoice_total IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'No se pueden registrar pagos en facturas canceladas'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_after FROM payments WHERE invoice_id = NEW.invoice_id;
  IF TG_OP = 'INSERT' THEN v_paid_after := v_paid_after + NEW.amount;
  ELSIF TG_OP = 'UPDATE' THEN v_paid_after := v_paid_after - OLD.amount + NEW.amount; END IF;
  IF round(v_paid_after, 2) > v_invoice_total THEN
    RAISE EXCEPTION 'El pago excede el saldo pendiente (total: %, pagado tras esta operacion: %)', v_invoice_total, v_paid_after;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_credit_note_max()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice_total numeric;
  v_already_credited numeric;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT total INTO v_invoice_total FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_invoice_total IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  SELECT COALESCE(SUM(total), 0) INTO v_already_credited FROM credit_notes
   WHERE invoice_id = NEW.invoice_id AND status <> 'cancelled' AND cancellation_status <> 'accepted' AND id <> NEW.id;
  IF round(v_already_credited + NEW.total, 2) > v_invoice_total THEN
    RAISE EXCEPTION 'La suma de notas de credito (% + % = %) excede el total de la factura (%). Cancela o reduce alguna NC existente.',
      v_already_credited, NEW.total, v_already_credited + NEW.total, v_invoice_total USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

-- DB-07 total no menor a pagado + acreditado
CREATE OR REPLACE FUNCTION public.enforce_invoice_total_covers_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paid numeric;
  v_credited numeric;
BEGIN
  IF NEW.total IS NOT DISTINCT FROM OLD.total THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.payments WHERE invoice_id = OLD.id;
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM public.credit_notes
   WHERE invoice_id = OLD.id AND cancellation_status <> 'accepted' AND status <> 'cancelled' AND cfdi_status = 'stamped';
  IF round(NEW.total, 2) < round(v_paid + v_credited, 2) THEN
    RAISE EXCEPTION 'El nuevo total (%) no puede ser menor a lo ya pagado + acreditado (%). Reversa pagos o NC primero.',
      NEW.total, v_paid + v_credited USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_invoice_total_covers_paid ON public.invoices;
CREATE TRIGGER trg_invoice_total_covers_paid BEFORE UPDATE OF total ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_total_covers_paid();

-- DB-08 consistencia supplier_bills
CREATE OR REPLACE FUNCTION public.enforce_supplier_bill_status_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_paid numeric(14,2);
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.supplier_payments WHERE bill_id = OLD.id;
  IF NEW.status = 'paid' AND round(v_paid, 2) < NEW.total THEN
    RAISE EXCEPTION 'No se puede marcar la bill como paid: pagado (%) < total (%).', v_paid, NEW.total USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('draft','cancelled') AND v_paid > 0 THEN
    RAISE EXCEPTION 'No se puede pasar a % una bill con pagos registrados (%). Elimina o reversa los pagos primero.', NEW.status, v_paid
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_supplier_bill_status_consistency ON public.supplier_bills;
CREATE TRIGGER trg_supplier_bill_status_consistency BEFORE UPDATE OF status ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.enforce_supplier_bill_status_consistency();

-- DB-10 single-role (antes que el guard de ultimo admin)
DELETE FROM public.user_roles ur
USING (
  SELECT id, row_number() OVER (
    PARTITION BY user_id ORDER BY CASE role
      WHEN 'admin' THEN 1 WHEN 'administrativo' THEN 2 WHEN 'dispatcher' THEN 3
      WHEN 'ventas' THEN 4 WHEN 'mechanic' THEN 5 WHEN 'auditor' THEN 6 WHEN 'customer' THEN 7 END
  ) AS rn FROM public.user_roles
) d
WHERE ur.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_role_per_user ON public.user_roles (user_id);

CREATE OR REPLACE FUNCTION public.update_user_role_safe(_target_user_id uuid, _new_role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_was_admin boolean;
  v_admin_count integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: solo administradores pueden cambiar roles';
  END IF;
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'target_user_id_required'; END IF;

  PERFORM 1 FROM public.user_roles WHERE role = 'admin'::app_role FOR UPDATE;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin'::app_role) INTO v_was_admin;

  IF v_was_admin AND _new_role <> 'admin'::app_role THEN
    SELECT count(*)::int INTO v_admin_count FROM public.user_roles WHERE role = 'admin'::app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN_CANNOT_BE_DEMOTED' USING HINT = 'no puedes degradar al ultimo administrador del sistema.';
    END IF;
  END IF;

  UPDATE public.user_roles SET role = _new_role WHERE user_id = _target_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _new_role);
  END IF;
END; $$;

-- DB-09 guard de ultimo admin a nivel tabla
CREATE OR REPLACE FUNCTION public.guard_user_roles_last_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin'::public.app_role THEN RETURN NEW; END IF;
  PERFORM public.assert_not_last_admin(OLD.user_id);
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_user_roles_last_admin ON public.user_roles;
CREATE TRIGGER trg_user_roles_last_admin BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles_last_admin();

-- DB-11 WITH CHECK en profiles
CREATE OR REPLACE FUNCTION public.profile_update_preserves_protected(_user_id uuid, _is_active boolean, _email text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_active boolean; v_email text;
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN true; END IF;
  SELECT is_active, email INTO v_is_active, v_email FROM public.profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN _is_active IS NOT DISTINCT FROM v_is_active AND _email IS NOT DISTINCT FROM v_email;
END; $$;

REVOKE ALL ON FUNCTION public.profile_update_preserves_protected(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_update_preserves_protected(uuid, boolean, text) TO authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (
    (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.profile_update_preserves_protected(user_id, is_active, email)
  );

-- DB-12 auditoria en tablas de configuracion/seguridad
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_changed text[]; v_key text;
  v_user_id uuid; v_email text; v_is_e2e_actor boolean := false;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;

  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
      IF v_email IS NOT NULL AND v_email ILIKE 'e2e-%@%' THEN v_is_e2e_actor := true; END IF;
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
    IF (to_jsonb(NEW) ? 'is_e2e') AND (((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) OR ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE)) THEN
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

DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
DROP TRIGGER IF EXISTS audit_role_permissions ON public.role_permissions;
CREATE TRIGGER audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
DROP TRIGGER IF EXISTS audit_company_settings ON public.company_settings;
CREATE TRIGGER audit_company_settings AFTER INSERT OR UPDATE OR DELETE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
DROP TRIGGER IF EXISTS audit_equipment_models ON public.equipment_models;
CREATE TRIGGER audit_equipment_models AFTER INSERT OR UPDATE OR DELETE ON public.equipment_models FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
DROP TRIGGER IF EXISTS audit_parts_inventory ON public.parts_inventory;
CREATE TRIGGER audit_parts_inventory AFTER INSERT OR UPDATE OR DELETE ON public.parts_inventory FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- DB-13 valid_until inmutable fuera de draft
CREATE OR REPLACE FUNCTION public.guard_quote_valid_until()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
    RAISE EXCEPTION 'No se puede modificar valid_until de una cotizacion en estado %. Crea una version nueva o regresala a draft.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_quote_valid_until ON public.quotes;
CREATE TRIGGER trg_guard_quote_valid_until BEFORE UPDATE OF valid_until ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_valid_until();