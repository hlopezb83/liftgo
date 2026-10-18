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
CREATE TYPE public.expense_category AS ENUM ('other');
CREATE TYPE public.supplier_bill_status AS ENUM ('draft','pending','partial','paid','overdue','cancelled');
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.suppliers (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.user_roles (user_id uuid PRIMARY KEY, role public.app_role);
CREATE TABLE public.organizations (id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.organization_memberships (auth_user_id uuid UNIQUE, organization_id uuid, member_type text);
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
 ADD COLUMN discount numeric(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN cfdi_xml_url text, ADD COLUMN receptor_rfc text,
 ADD COLUMN tipo_comprobante text, ADD COLUMN coverage_start date,
 ADD COLUMN coverage_end date, ADD COLUMN payment_in_progress_at timestamptz,
 ADD COLUMN organization_id uuid,
 ADD COLUMN approval_status text NOT NULL DEFAULT 'pending',
 ADD COLUMN approved_by uuid, ADD COLUMN approved_at timestamptz,
 ADD COLUMN approval_notes text;
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.is_active FROM public.profiles p WHERE p.user_id = _user_id),
    true
  );
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_user(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role = _role
     )
$$;
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN count(*) = 1 THEN (array_agg(m.organization_id))[1]
    ELSE NULL
  END
  FROM public.organization_memberships m
  WHERE m.auth_user_id = (SELECT auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.organization_scope_matches(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_bills TO authenticated;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bills: admin/administrativo full"
  ON public.supplier_bills FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'));

CREATE POLICY "Bills: auditor read"
  ON public.supplier_bills FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor'));


CREATE POLICY org_scope_isolation ON public.supplier_bills AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.organization_scope_matches(organization_id)))
 WITH CHECK ((SELECT public.organization_scope_matches(organization_id)));
CREATE OR REPLACE FUNCTION public.guard_supplier_bill_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role'
     OR v_jwt_role IS NULL
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La aprobacion de facturas de proveedor solo se modifica via approve_supplier_bill / reject_supplier_bill / request_bill_reapproval.'
    USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_supplier_bill_approval ON public.supplier_bills;
CREATE TRIGGER trg_guard_supplier_bill_approval
  BEFORE UPDATE OF approval_status, approved_by, approved_at, approval_notes
  ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_approval();


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
('00000000-0000-4000-8000-000000000010', 'admin');
INSERT INTO auth.users SELECT user_id FROM public.user_roles;
INSERT INTO public.profiles SELECT user_id, user_id <> '00000000-0000-4000-8000-000000000008'::uuid FROM public.user_roles;
INSERT INTO public.organizations VALUES ('00000000-0000-4000-8000-000000000101',true),('00000000-0000-4000-8000-000000000102',true);
INSERT INTO public.organization_memberships VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000101', 'internal'),
('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000102', 'internal');
INSERT INTO public.supplier_bills(id,bill_number,total,subtotal,organization_id)
 VALUES ('00000000-0000-4000-8000-000000000201','SYNTHETIC-A',100,100,'00000000-0000-4000-8000-000000000101'),('00000000-0000-4000-8000-000000000202','SYNTHETIC-B',100,100,'00000000-0000-4000-8000-000000000102');
