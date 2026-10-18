\set ON_ERROR_STOP on
-- Minimum SQL policy fixture. RLS/auth/organization authorization remain outside this fixture.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fixture.user_id',true),'')::uuid;
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"role":"authenticated"}'::jsonb; $$;
CREATE FUNCTION public.current_internal_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fixture.organization_id',true),'')::uuid;
$$;
CREATE FUNCTION public.resolve_organization_context() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT public.current_internal_organization_id(); $$;
CREATE FUNCTION public.is_internal_member(p_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_uid='10000000-0000-0000-0000-000000000001'::uuid;
$$;
CREATE TABLE public.invoices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL,
  total numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft', moneda text DEFAULT 'MXN', tipo_cambio numeric DEFAULT 1,
  metodo_pago text, cfdi_status text DEFAULT 'pending', issued_at date NOT NULL DEFAULT CURRENT_DATE,
  due_date date, paid_at date, organization_id uuid NOT NULL, cancelled_at timestamptz, cancellation_reason text
);
CREATE TABLE public.payments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.invoices(id), amount numeric NOT NULL CHECK(amount>0),
  currency text NOT NULL DEFAULT 'MXN', exchange_rate numeric NOT NULL DEFAULT 1, payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text, reference_number text, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  payment_form_sat text, installment_number integer, prior_balance numeric, rep_cfdi_status text NOT NULL DEFAULT 'none',
  rep_cfdi_uuid uuid, amount_mxn numeric, organization_id uuid
);
CREATE TABLE public.credit_notes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.invoices(id), total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft', cfdi_status text NOT NULL DEFAULT 'pending', cancellation_status text NOT NULL DEFAULT 'none', organization_id uuid NOT NULL
);
CREATE TABLE public.fiscal_periods(period text NOT NULL, closed_at timestamptz, organization_id uuid NOT NULL);
CREATE TABLE public.policy_expectations(name text PRIMARY KEY, kind text NOT NULL, expected jsonb NOT NULL, actual jsonb NOT NULL, passed boolean NOT NULL);
CREATE TABLE public.policy_function_baseline(name text PRIMARY KEY, definition text NOT NULL, md5 text NOT NULL);

CREATE FUNCTION public.policy_invoice_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid; $$;
CREATE FUNCTION public.policy_payment_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid; $$;

INSERT INTO public.invoices(id,invoice_number,total,status,moneda,tipo_cambio,metodo_pago,cfdi_status,issued_at,organization_id)
SELECT policy_invoice_id(n), 'POLICY-'||n, total, 'sent', currency, rate, 'PPD','pending','2026-09-01','10000000-0000-0000-0000-000000000002'::uuid
FROM (VALUES
  (101,100::numeric,'USD',17.5::numeric),(102,100,'USD',17.5),(103,100,'USD',17.5),(104,100,'USD',17.5),
  (111,0.12,'USD',17.5),(112,0.12,'USD',17.5),(113,0.12,'USD',17.5),(114,0.12,'USD',17.5),
  (201,100,'USD',17.5),(202,100,'USD',17.5),(203,100,'USD',17.5),(204,100,'USD',17.5),
  (211,100,'USD',17.5),(212,100,'USD',17.5),(213,100,'USD',17.5),(214,100,'USD',17.5),
  (301,100,'USD',17.5),(302,100,'USD',17.5),(303,100,'USD',17.5),(304,100,'USD',17.5),
  (401,100,'USD',NULL),(402,100,'USD',1),(403,100,'MXN',1),(404,100,'MXN',1),(405,100,'USD',NULL),
  (406,100,'uSd',NULL),(407,100,'uSd',17.5),(408,100,'USD',17.5),(409,100,'USD',17.5),(410,100,'USD',17.5),
  (411,100,'USD',17.5),(412,100,'USD',17.5),(413,100,'MXN',1),(414,100,'USD',0),
  (501,100,'USD',17.5),(502,100,'USD',17.5),
  (601,0.35,'MXN',1),(602,0.30,'MXN',1),(603,100,'USD',17.5)
) AS configurations(n,total,currency,rate);

-- Explicit pre-existing rows for edit-only scenarios; seed happens before installing business triggers.
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,organization_id)
SELECT policy_payment_id(n),policy_invoice_id(n),175,'MXN',rate,'2026-09-01','10000000-0000-0000-0000-000000000002'::uuid
FROM (VALUES(201,1::numeric),(202,17.5),(203,18),(204,0),(301,1),(302,17.5),(303,18),(304,0)) AS seeds(n,rate);
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,organization_id)
SELECT policy_payment_id(n),policy_invoice_id(n),amount,'EUR',1,'2026-09-01','10000000-0000-0000-0000-000000000002'::uuid
FROM (VALUES(501,1::numeric),(502,100)) AS seeds(n,amount);

GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.invoices,public.payments,public.credit_notes,public.policy_expectations TO authenticated;
