-- Generated from audited source; run ONLY in a fresh local fixture database.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt()->>'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;
CREATE TYPE public.app_role AS ENUM ('admin','administrativo','ventas','auditor','mechanic','dispatcher','customer');
-- Enum labels from the audited generated Database type; not a placeholder enum.
CREATE TYPE public.expense_category AS ENUM ('renta','nomina','software','depreciacion','otro','costo_venta','caja_chica','publicidad','mantenimiento','refacciones','combustible','transporte_logistica','seguros_equipo','servicios_publicos','honorarios','papeleria','capacitacion','comisiones_ventas','viajes_representacion','intereses','comisiones_bancarias');
CREATE TYPE public.supplier_bill_status AS ENUM ('draft','pending','partial','paid','overdue','cancelled');
CREATE TYPE public.supplier_bill_approval_status AS ENUM ('not_required','pending','approved','rejected');
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.suppliers (id uuid PRIMARY KEY, organization_id uuid, deleted_at timestamptz);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.user_roles (user_id uuid PRIMARY KEY, role public.app_role);
CREATE TABLE public.organizations (id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.organization_memberships (auth_user_id uuid UNIQUE, organization_id uuid, member_type text);
CREATE TABLE public.company_settings (organization_id uuid PRIMARY KEY, cxp_approval_threshold_mxn numeric(14,2));
GRANT SELECT ON public.company_settings TO authenticated;
CREATE TABLE public.supplier_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number     TEXT NOT NULL UNIQUE,
  supplier_id     UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  cfdi_uuid       TEXT,
  folio           TEXT,
  serie           TEXT,
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  retention_isr   NUMERIC(14,2) NOT NULL DEFAULT 0,
  retention_iva   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total           NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  currency        TEXT NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN','USD')),
  exchange_rate   NUMERIC(14,6) NOT NULL DEFAULT 1,
  payment_method_sat TEXT CHECK (payment_method_sat IN ('PUE','PPD') OR payment_method_sat IS NULL),
  payment_form_sat   TEXT,
  cfdi_use        TEXT,
  category        public.expense_category,
  description     TEXT,
  status          public.supplier_bill_status NOT NULL DEFAULT 'pending',
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
  xml_url         TEXT,
  pdf_url         TEXT,
  notes           TEXT,
  legacy_expense_id UUID,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_bills
 ADD COLUMN cfdi_xml_url text, ADD COLUMN receptor_rfc text,
 ADD COLUMN tipo_comprobante text, ADD COLUMN coverage_start date,
 ADD COLUMN coverage_end date, ADD COLUMN payment_in_progress_at timestamptz,
 ADD COLUMN organization_id uuid,
 ADD COLUMN approval_status public.supplier_bill_approval_status NOT NULL DEFAULT 'not_required',
 ADD COLUMN approved_by uuid, ADD COLUMN approved_at timestamptz,
 ADD COLUMN approval_notes text;
ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS discount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_bills
  DROP CONSTRAINT IF EXISTS supplier_bills_discount_non_negative_chk;

ALTER TABLE public.supplier_bills
  ADD CONSTRAINT supplier_bills_discount_non_negative_chk CHECK (discount >= 0);
ALTER TABLE public.supplier_bills DROP CONSTRAINT supplier_bills_bill_number_key;
ALTER TABLE public.supplier_bills ADD CONSTRAINT "supplier_bills_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_bills ADD CONSTRAINT "supplier_bills_coverage_range_chk" CHECK ((((coverage_start IS NULL) AND (coverage_end IS NULL)) OR ((coverage_start IS NOT NULL) AND (coverage_end IS NOT NULL) AND (coverage_end >= coverage_start))));
ALTER TABLE public.supplier_bills ADD CONSTRAINT "supplier_bills_organization_bill_number_key" UNIQUE (organization_id, bill_number);
ALTER TABLE public.supplier_bills ADD CONSTRAINT "supplier_bills_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.supplier_bills ADD CONSTRAINT "supplier_bills_tipo_comprobante_check" CHECK (((tipo_comprobante IS NULL) OR (tipo_comprobante = ANY (ARRAY['I'::text, 'E'::text, 'N'::text, 'P'::text, 'T'::text]))));
CREATE TABLE public.supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id         UUID NOT NULL REFERENCES public.supplier_bills(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT,
  bank_account    TEXT,
  reference       TEXT,
  receipt_url     TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_payments ADD COLUMN organization_id uuid;
-- Captured catalog definition: is_active_user
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.is_active FROM public.profiles p WHERE p.user_id = _user_id),
    true
  );
$function$;
-- Captured catalog definition: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_active_user(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role = _role
     )
$function$;
-- Captured catalog definition: current_organization_id
CREATE OR REPLACE FUNCTION public.current_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN count(*) = 1 THEN (array_agg(m.organization_id))[1]
    ELSE NULL
  END
  FROM public.organization_memberships m
  WHERE m.auth_user_id = (SELECT auth.uid())
$function$;
-- Captured catalog definition: is_admin_or_administrativo
CREATE OR REPLACE FUNCTION public.is_admin_or_administrativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo']::public.app_role[])
  )
$function$;
-- Captured catalog definition: organization_scope_matches
CREATE OR REPLACE FUNCTION public.organization_scope_matches(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_organization_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = p_organization_id AND o.is_active
     )
     AND (
       p_organization_id = public.current_organization_id()
       OR (
         -- Sólo procesos SIN sesión (sin auth.uid()) conservan la
         -- compatibilidad temporal, y únicamente con UNA empresa activa.
         (SELECT auth.uid()) IS NULL
         AND public.current_organization_id() IS NULL
         AND (SELECT count(*) = 1 FROM public.organizations WHERE is_active)
       )
     )
$function$;
-- Captured catalog definition: enforce_organization_write_context
CREATE OR REPLACE FUNCTION public.enforce_organization_write_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member_organization_id uuid;
  v_context_organization_id uuid;
  v_effective_organization_id uuid;
  v_organization_count integer;
BEGIN
  -- La organización forma parte de la identidad inmutable de una fila.
  IF TG_OP = 'UPDATE'
     AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'La organización de un registro no se puede cambiar'
      USING ERRCODE = '23514';
  END IF;

  v_member_organization_id := public.current_organization_id();
  v_context_organization_id := NULLIF(
    current_setting('app.organization_id', true),
    ''
  )::uuid;

  -- Un usuario autenticado siempre escribe exclusivamente en su propia
  -- organización. La columna se rellena si el cliente aún no la envía.
  IF v_member_organization_id IS NOT NULL THEN
    v_effective_organization_id := v_member_organization_id;

    IF NEW.organization_id IS NOT NULL
       AND NEW.organization_id IS DISTINCT FROM v_effective_organization_id THEN
      RAISE EXCEPTION 'La organización indicada no corresponde al usuario autenticado'
        USING ERRCODE = '42501';
    END IF;

    -- Tramo 9: una empresa suspendida no escribe, ni siquiera mediante
    -- funciones SECURITY DEFINER que no pasan por RLS.
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = v_effective_organization_id AND o.is_active
    ) THEN
      RAISE EXCEPTION 'La empresa está suspendida; no se permiten operaciones'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.organization_id IS NOT NULL THEN
    -- service_role puede procesar organizaciones distintas en sentencias
    -- consecutivas; un valor explícito siempre sustituye el contexto heredado.
    v_effective_organization_id := NEW.organization_id;
  ELSIF v_context_organization_id IS NOT NULL THEN
    v_effective_organization_id := v_context_organization_id;
  ELSE
    -- Compatibilidad temporal para los writers de sistema existentes: solo
    -- mientras haya una organización activa. Con varias, el contexto es
    -- obligatorio y no se adivina una organización.
    SELECT count(*) INTO v_organization_count
    FROM public.organizations
    WHERE is_active;

    IF v_organization_count <> 1 THEN
      RAISE EXCEPTION
        'organization_id es obligatorio para operaciones sin membresía cuando hay % organizaciones activas',
        v_organization_count
        USING ERRCODE = '23514';
    END IF;

    SELECT id INTO v_effective_organization_id
    FROM public.organizations
    WHERE is_active;
  END IF;

  NEW.organization_id := v_effective_organization_id;
  PERFORM set_config('app.organization_id', v_effective_organization_id::text, true);

  RETURN NEW;
END;
$function$;
-- Captured catalog definition: enforce_supplier_bill_status_consistency
CREATE OR REPLACE FUNCTION public.enforce_supplier_bill_status_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;
-- Captured catalog definition: enforce_supplier_bill_total_covers_paid
CREATE OR REPLACE FUNCTION public.enforce_supplier_bill_total_covers_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paid numeric;
BEGIN
  IF NEW.total IS NOT DISTINCT FROM OLD.total THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.supplier_payments WHERE bill_id = OLD.id;
  IF round(NEW.total, 2) < round(v_paid, 2) THEN
    RAISE EXCEPTION 'El nuevo total (%) no puede ser menor a lo ya pagado (%). Elimina o reversa pagos primero.',
      NEW.total, v_paid USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;
-- Captured catalog definition: guard_supplier_bill_approval
CREATE OR REPLACE FUNCTION public.guard_supplier_bill_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role'
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La aprobacion de facturas de proveedor solo se modifica via approve_supplier_bill / reject_supplier_bill / request_bill_reapproval.'
    USING ERRCODE = 'check_violation';
END;
$function$;
-- Captured catalog definition: guard_supplier_bill_balance
CREATE OR REPLACE FUNCTION public.guard_supplier_bill_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
  v_paid NUMERIC(14,2);
  v_expected NUMERIC(14,2);
BEGIN
  IF NEW.balance IS NOT DISTINCT FROM OLD.balance THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.cxp_recalc', true) = 'on' OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = NEW.id;
  v_expected := GREATEST(round(COALESCE(NEW.total, OLD.total, 0) - v_paid, 2), 0);
  IF NEW.balance = v_expected THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'El balance de la bill no es editable directamente (esperado % segun total y pagos; recibido %). El balance se recalcula con los pagos (recalc_supplier_bill).', v_expected, NEW.balance
    USING ERRCODE = 'check_violation';
END; $function$;
-- Captured catalog definition: lock_paid_supplier_bill_with_payments
CREATE OR REPLACE FUNCTION public.lock_paid_supplier_bill_with_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paid numeric;
BEGIN
  IF current_setting('app.cxp_recalc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'paid'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT COALESCE(SUM(sp.amount), 0) INTO v_paid
    FROM public.supplier_payments sp
    WHERE sp.bill_id = OLD.id;
    IF v_paid > 0 THEN
      RAISE EXCEPTION 'La cuenta tiene pagos registrados por %; elimina o reversa los pagos antes de cambiar su estado.', v_paid
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
-- Captured catalog definition: recalc_supplier_bill_balance_on_total_change
CREATE OR REPLACE FUNCTION public.recalc_supplier_bill_balance_on_total_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paid numeric(14,2);
BEGIN
  IF NEW.total IS DISTINCT FROM OLD.total THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = NEW.id;
    NEW.balance := GREATEST(NEW.total - v_paid, 0);
  END IF;
  RETURN NEW;
END;
$function$;
-- Captured catalog definition: set_supplier_bill_approval_status
CREATE OR REPLACE FUNCTION public.set_supplier_bill_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold NUMERIC(14,2);
  v_total_mxn NUMERIC(14,2);
  v_old_total_mxn NUMERIC(14,2);
  v_fx_missing boolean;
  v_old_fx_missing boolean;
  v_jwt_role text;
  v_has_payments boolean;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  -- R10-02: `current_user` es fiable aquí porque esta función NO es SECURITY
  -- DEFINER: PostgREST hace SET ROLE service_role para el rol de servicio.
  IF v_jwt_role = 'service_role'
     OR current_user = 'service_role'
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT cs.cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings cs
   WHERE cs.organization_id = NEW.organization_id
   LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_fx_missing := public.fx_is_missing(NEW.currency, NEW.exchange_rate);

  v_total_mxn := CASE
    WHEN v_fx_missing THEN NULL
    WHEN upper(COALESCE(NEW.currency, 'MXN')) = 'MXN' THEN COALESCE(NEW.total, 0)
    ELSE COALESCE(NEW.total, 0) * NEW.exchange_rate
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Una factura de proveedor no puede nacer en estado de aprobacion %. Registrala pendiente y usa approve_supplier_bill / reject_supplier_bill.', NEW.approval_status
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_fx_missing OR v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;

    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_notes := NULL;

    RETURN NEW;
  END IF;

  v_old_fx_missing := public.fx_is_missing(OLD.currency, OLD.exchange_rate);
  v_old_total_mxn := CASE
    WHEN v_old_fx_missing THEN NULL
    WHEN upper(COALESCE(OLD.currency, 'MXN')) = 'MXN' THEN COALESCE(OLD.total, 0)
    ELSE COALESCE(OLD.total, 0) * OLD.exchange_rate
  END;

  -- R9-01: cuando el TC falta, AMBOS total_mxn son NULL y la comparación
  -- `IS NOT DISTINCT FROM` los daba por equivalentes: un cambio real de
  -- NEW.total pasaba de largo (sin guard de pagos y sin recálculo). Se compara
  -- explícitamente el total en la moneda del documento.
  IF v_total_mxn IS NOT DISTINCT FROM v_old_total_mxn
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND v_fx_missing IS NOT DISTINCT FROM v_old_fx_missing THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = NEW.id
  ) INTO v_has_payments;

  IF v_has_payments THEN
    RAISE EXCEPTION 'No se puede cambiar el monto, la moneda o el tipo de cambio: la factura ya tiene pagos registrados.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.approval_status = 'approved' THEN
    RAISE EXCEPTION 'No se puede cambiar el monto de una factura ya aprobada. Recházala y solicita reaprobación antes de editarla.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- R9-08 / R10-01 (sin cambios): rechazada siempre vuelve a 'pending'.
  IF OLD.approval_status IN ('pending', 'not_required', 'rejected') THEN
    IF v_fx_missing OR v_total_mxn > v_threshold OR OLD.approval_status = 'rejected' THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END $function$;
-- Captured catalog definition: validate_transition
CREATE OR REPLACE FUNCTION public.validate_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[];
  v_initial text[];
  v_due date;
  v_jwt_role text;
  v_has_payments boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_initial := CASE TG_TABLE_NAME
      WHEN 'invoices'       THEN ARRAY['draft','sent']
      WHEN 'quotes'         THEN ARRAY['draft','sent']
      WHEN 'bookings'       THEN ARRAY['confirmed']
      WHEN 'supplier_bills' THEN ARRAY['draft','pending']
      WHEN 'forklifts'      THEN ARRAY['available']
      ELSE ARRAY[]::text[]
    END;

    IF TG_TABLE_NAME = 'supplier_bills' AND NEW.status::text = 'overdue' THEN
      v_due := NULLIF(to_jsonb(NEW) ->> 'due_date', '')::date;
      IF v_due IS NOT NULL AND v_due < public.today_mty() THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NOT (NEW.status::text = ANY(v_initial)) THEN
      RAISE EXCEPTION 'Estado inicial no permitido en %: %. Usa el flujo/RPC correspondiente.',
        TG_TABLE_NAME, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.audit_revert', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['overdue','paid','cancelled']
      WHEN 'overdue'  THEN ARRAY['paid','cancelled']
      WHEN 'partial'  THEN ARRAY['overdue','paid','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'     THEN ARRAY['sent','rejected','expired']
      WHEN 'sent'      THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'   THEN ARRAY['draft']
      WHEN 'accepted'  THEN ARRAY['cancelled','converted']
      WHEN 'converted' THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'bookings' THEN CASE OLD.status::text
      WHEN 'confirmed' THEN ARRAY['completed','cancelled']
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

  IF TG_TABLE_NAME = 'supplier_bills'
     AND current_setting('app.cxp_recalc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'supplier_bills' AND OLD.status::text = 'paid' THEN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
      SELECT EXISTS (SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = OLD.id)
        INTO v_has_payments;
      IF v_has_payments THEN
        RAISE EXCEPTION 'La cuenta tiene pagos registrados; elimina o reversa los pagos primero.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'forklifts'
     AND OLD.status::text = 'rented'
     AND NEW.status::text IS DISTINCT FROM 'rented'
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on' THEN
    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.deliveries d
        ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
      WHERE b.forklift_id = OLD.id
        AND b.status = 'confirmed'
        AND NOT public.booking_is_returned(b.id)
    ) THEN
      RAISE EXCEPTION 'La unidad tiene una renta entregada sin devolución; completa la devolución antes de cambiar su estado'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND current_setting('app.payment_sync', true) = 'on'
     AND OLD.status::text IN ('sent','partial','overdue','paid')
     AND NEW.status::text IN ('sent','partial','overdue','paid') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND OLD.status::text = 'paid'
     AND NEW.status::text = 'cancelled' THEN
    IF v_jwt_role = 'service_role'
       OR current_setting('app.sat_flow', true) IS NOT DISTINCT FROM 'on' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'forklifts'
     AND current_setting('app.forklift_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'quotes'
     AND OLD.status::text = 'converted'
     AND NEW.status::text = 'accepted'
     AND current_setting('app.quote_rebound', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
-- Captured internal helper, body verified against Drizzle 0031.
CREATE OR REPLACE FUNCTION public.current_internal_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(m.organization_id))[1] END
  FROM public.organization_memberships m
  JOIN public.organizations o
    ON o.id = m.organization_id AND o.is_active
  WHERE m.auth_user_id = (SELECT auth.uid())
    AND m.member_type = 'internal'
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m2
      WHERE m2.auth_user_id = (SELECT auth.uid())
        AND m2.member_type <> 'internal'
    )
$function$;
CREATE OR REPLACE FUNCTION public.today_mty()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'America/Monterrey')::date $$;
CREATE OR REPLACE FUNCTION public.fx_is_missing(p_currency text, p_rate numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(COALESCE(p_currency, 'MXN')) <> 'MXN'
     AND (p_rate IS NULL OR p_rate <= 0 OR p_rate = 1);
$$;
CREATE OR REPLACE FUNCTION public.trg_supplier_bill_init_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('paid','partial','overdue','cancelled') THEN
      RAISE EXCEPTION 'No se puede crear una bill directamente en estado %. Registrala como pendiente y usa el flujo de pagos.', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.balance := COALESCE(NEW.total,0);
    IF NEW.status NOT IN ('draft','cancelled') THEN
      IF NEW.due_date IS NOT NULL AND NEW.due_date < public.today_mty() THEN
        NEW.status := 'overdue';
      ELSE
        NEW.status := 'pending';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.recalc_supplier_bill(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total   NUMERIC(14,2);
  v_paid    NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_due     DATE;
  v_current public.supplier_bill_status;
BEGIN
  SELECT total, status, due_date INTO v_total, v_current, v_due
    FROM public.supplier_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_current IN ('draft','cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = p_bill_id;

  -- M-15: tolerancia de 0.005 solo para MARCAR 'paid'.
  IF v_paid >= v_total - 0.005 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < public.today_mty() THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  PERFORM set_config('app.cxp_recalc', 'on', true);

  UPDATE public.supplier_bills
    SET balance = GREATEST(v_total - v_paid, 0),
        status  = v_status,
        updated_at = now()
    WHERE id = p_bill_id;
END $function$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_bills TO authenticated;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bills FORCE ROW LEVEL SECURITY;
CREATE POLICY "Bills: admin/administrativo full"
 ON public.supplier_bills AS PERMISSIVE FOR ALL TO "authenticated"
 USING (( SELECT is_admin_or_administrativo() AS is_admin_or_administrativo)) WITH CHECK (( SELECT is_admin_or_administrativo() AS is_admin_or_administrativo));
CREATE POLICY "Bills: auditor read"
 ON public.supplier_bills AS PERMISSIVE FOR SELECT TO "authenticated"
 USING (has_role(( SELECT auth.uid() AS uid), 'auditor'::app_role));
CREATE POLICY "org_scope_isolation"
 ON public.supplier_bills AS RESTRICTIVE FOR ALL TO "authenticated"
 USING (( SELECT organization_scope_matches(supplier_bills.organization_id) AS organization_scope_matches)) WITH CHECK (( SELECT organization_scope_matches(supplier_bills.organization_id) AS organization_scope_matches));
GRANT SELECT ON public.supplier_payments TO authenticated;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SupPay: admin/administrativo full"
  ON public.supplier_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'));

CREATE POLICY "SupPay: auditor read"
  ON public.supplier_payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor'));


CREATE POLICY org_scope_isolation ON public.supplier_payments AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.organization_scope_matches(organization_id)))
 WITH CHECK ((SELECT public.organization_scope_matches(organization_id)));
CREATE TRIGGER trg_guard_supplier_bill_approval BEFORE UPDATE OF approval_status, approved_by, approved_at, approval_notes ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION guard_supplier_bill_approval();
CREATE TRIGGER trg_guard_supplier_bill_balance BEFORE UPDATE OF balance ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION guard_supplier_bill_balance();
CREATE TRIGGER trg_lock_paid_supplier_bill BEFORE UPDATE ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION lock_paid_supplier_bill_with_payments();
CREATE TRIGGER trg_organization_write_context BEFORE INSERT OR UPDATE ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION enforce_organization_write_context();
CREATE TRIGGER trg_sb_init_balance BEFORE INSERT ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION trg_supplier_bill_init_balance();
CREATE TRIGGER trg_set_supplier_bill_approval_status BEFORE INSERT OR UPDATE OF total, currency, exchange_rate ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION set_supplier_bill_approval_status();
CREATE TRIGGER trg_supplier_bill_recalc_on_total BEFORE UPDATE OF total ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION recalc_supplier_bill_balance_on_total_change();
CREATE TRIGGER trg_supplier_bill_status_consistency BEFORE UPDATE OF status ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION enforce_supplier_bill_status_consistency();
CREATE TRIGGER trg_supplier_bill_total_covers_paid BEFORE UPDATE OF total ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION enforce_supplier_bill_total_covers_paid();
CREATE TRIGGER trg_validate_transition BEFORE INSERT OR UPDATE OF status ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION validate_transition();
REVOKE UPDATE ON public.supplier_bills FROM authenticated;
GRANT UPDATE (
  bill_number, supplier_id, cfdi_uuid, folio, serie, issue_date, due_date,
  subtotal, tax_amount, retention_isr, retention_iva, total, currency,
  exchange_rate, payment_method_sat, payment_form_sat, cfdi_use, category,
  description, status, balance, xml_url, pdf_url, cfdi_xml_url, receptor_rfc,
  tipo_comprobante, coverage_start, coverage_end, notes, legacy_expense_id,
  created_by, payment_in_progress_at, updated_at
) ON public.supplier_bills TO authenticated;
INSERT INTO public.user_roles VALUES ('00000000-0000-4000-8000-000000000001', 'admin'),
('00000000-0000-4000-8000-000000000002', 'administrativo'),
('00000000-0000-4000-8000-000000000003', 'ventas'),
('00000000-0000-4000-8000-000000000004', 'auditor'),
('00000000-0000-4000-8000-000000000005', 'mechanic'),
('00000000-0000-4000-8000-000000000006', 'dispatcher'),
('00000000-0000-4000-8000-000000000007', 'customer'),
('00000000-0000-4000-8000-000000000008', 'admin'),
('00000000-0000-4000-8000-000000000009', 'admin'),
('00000000-0000-4000-8000-000000000010', 'admin'),
('00000000-0000-4000-8000-000000000011', 'admin'),
('00000000-0000-4000-8000-000000000012', 'admin'),
('00000000-0000-4000-8000-000000000013', 'admin');
INSERT INTO auth.users SELECT user_id FROM public.user_roles;
INSERT INTO public.profiles SELECT user_id, user_id <> '00000000-0000-4000-8000-000000000008'::uuid FROM public.user_roles WHERE user_id <> '00000000-0000-4000-8000-000000000013'::uuid;
INSERT INTO public.organizations VALUES ('00000000-0000-4000-8000-000000000101',true),('00000000-0000-4000-8000-000000000102',true),('00000000-0000-4000-8000-000000000103',false);
INSERT INTO public.organization_memberships VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000102', 'internal'),
('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000101', 'customer'),
('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000103', 'internal'),
('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000101', 'internal');
INSERT INTO public.company_settings VALUES ('00000000-0000-4000-8000-000000000101',1000),('00000000-0000-4000-8000-000000000102',2000);
INSERT INTO public.suppliers VALUES ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000101',null),('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000102',null),('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000101',now());
-- Synthetic seed only: postgres owns this disposable DB, not an application user.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,total,subtotal,organization_id,approval_status)
 VALUES ('00000000-0000-4000-8000-000000000201','SYNTHETIC-A',100,100,'00000000-0000-4000-8000-000000000101','not_required'),
 ('00000000-0000-4000-8000-000000000202','SYNTHETIC-B',100,100,'00000000-0000-4000-8000-000000000102','not_required'),
 ('00000000-0000-4000-8000-000000000203','SYNTHETIC-APPROVED',200,200,'00000000-0000-4000-8000-000000000101','approved'),
 ('00000000-0000-4000-8000-000000000204','SYNTHETIC-PARTIAL',100,100,'00000000-0000-4000-8000-000000000101','not_required'),
 ('00000000-0000-4000-8000-000000000205','SYNTHETIC-PAID',100,100,'00000000-0000-4000-8000-000000000101','not_required'),
 ('00000000-0000-4000-8000-000000000206','SYNTHETIC-CANCELLED',100,100,'00000000-0000-4000-8000-000000000101','not_required'),
 ('00000000-0000-4000-8000-000000000207','SYNTHETIC-INACTIVE-ORG',100,100,'00000000-0000-4000-8000-000000000103','not_required'),
 ('00000000-0000-4000-8000-000000000208','SYNTHETIC-PENDING-WITH-PAYMENT',100,100,'00000000-0000-4000-8000-000000000101','not_required');
UPDATE public.supplier_bills SET status='cancelled' WHERE id='00000000-0000-4000-8000-000000000206';
INSERT INTO public.supplier_payments(bill_id,amount,organization_id)
 VALUES ('00000000-0000-4000-8000-000000000204',20,'00000000-0000-4000-8000-000000000101'),('00000000-0000-4000-8000-000000000205',100,'00000000-0000-4000-8000-000000000101'),('00000000-0000-4000-8000-000000000208',20,'00000000-0000-4000-8000-000000000101');
SELECT public.recalc_supplier_bill('00000000-0000-4000-8000-000000000204');
SELECT public.recalc_supplier_bill('00000000-0000-4000-8000-000000000205');
-- Deliberately leave 208 pending: an inconsistent synthetic legacy row proves
-- that the RPC checks ANY payment independently from the status lock.
SELECT set_config('app.cxp_recalc','off',false),set_config('request.jwt.claims','{}',false),set_config('app.organization_id','',false);
CREATE OR REPLACE FUNCTION public.enforce_supplier_payment_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_total numeric(14,2);
  v_status public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_paid_after numeric(14,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('supplier_payment:' || NEW.bill_id::text));
  SELECT total, status, approval_status INTO v_bill_total, v_status, v_approval
    FROM public.supplier_bills WHERE id = NEW.bill_id FOR UPDATE;
  IF v_bill_total IS NULL THEN RAISE EXCEPTION 'Factura de proveedor no encontrada'; END IF;
  IF v_status IN ('cancelled','draft') THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en bills en estado %', v_status USING ERRCODE = 'check_violation';
  END IF;
  IF v_approval IN ('pending','rejected') THEN
    RAISE EXCEPTION 'No se pueden registrar pagos: la bill tiene aprobacion %. Completa el flujo de aprobacion primero.', v_approval
      USING ERRCODE = 'check_violation';
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
CREATE TRIGGER trg_enforce_supplier_payment_balance
 BEFORE INSERT OR UPDATE OF amount, bill_id ON public.supplier_payments
 FOR EACH ROW EXECUTE FUNCTION public.enforce_supplier_payment_balance();
CREATE OR REPLACE FUNCTION public.trg_supplier_payment_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_supplier_bill(OLD.bill_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_supplier_bill(NEW.bill_id);
    IF TG_OP = 'UPDATE' AND OLD.bill_id <> NEW.bill_id THEN
      PERFORM public.recalc_supplier_bill(OLD.bill_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;
CREATE TRIGGER trg_sp_recalc_aiud
 AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
 FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_payment_recalc();
