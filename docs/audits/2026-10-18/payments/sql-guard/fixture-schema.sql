\set ON_ERROR_STOP on
-- Synthetic, isolated SQL-only fixture. These are minimum tables with source/catalog column types.
-- RLS/ACL and organization-write authorization are deliberately outside this business-rule proof.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fixture.user_id', true), '')::uuid;
$$;
CREATE FUNCTION public.current_internal_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fixture.organization_id', true), '')::uuid;
$$;
CREATE FUNCTION public.resolve_organization_context() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT public.current_internal_organization_id();
$$;
-- Auth stub for the source sync helper only; this is not an authorization test.
CREATE FUNCTION public.is_internal_member(p_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_uid = '10000000-0000-0000-0000-000000000001'::uuid;
$$;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL,
  total numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft',
  moneda text DEFAULT 'MXN', tipo_cambio numeric DEFAULT 1,
  metodo_pago text, cfdi_status text DEFAULT 'pending',
  issued_at date NOT NULL DEFAULT CURRENT_DATE, due_date date, paid_at date,
  organization_id uuid NOT NULL
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'MXN', exchange_rate numeric NOT NULL DEFAULT 1,
  payment_date date NOT NULL DEFAULT CURRENT_DATE, payment_method text,
  reference_number text, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  payment_form_sat text, installment_number integer, prior_balance numeric,
  rep_cfdi_status text NOT NULL DEFAULT 'none', rep_cfdi_uuid uuid,
  amount_mxn numeric, organization_id uuid
);
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  total numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft',
  cfdi_status text NOT NULL DEFAULT 'pending', cancellation_status text NOT NULL DEFAULT 'none',
  organization_id uuid NOT NULL
);
CREATE TABLE public.fiscal_periods (period text NOT NULL, closed_at timestamptz, organization_id uuid NOT NULL);
CREATE TABLE public.fixture_attempts (
  case_id text PRIMARY KEY, expected_state text NOT NULL, actual_state text NOT NULL,
  message text NOT NULL, detail text, hint text, affected bigint, statement text NOT NULL
);
CREATE TABLE public.fixture_observations (case_id text PRIMARY KEY, observation jsonb NOT NULL);

-- Seed historical rows before enabling guards: current default-1 guard cannot create the N8 original.
-- These rows characterize editing pre-existing records; they are not evidence such a row is published.
INSERT INTO public.invoices(id, invoice_number, total, status, moneda, tipo_cambio, metodo_pago, cfdi_status, issued_at, organization_id)
SELECT ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'SYNTH-' || n, CASE WHEN n=120 THEN 0.12 WHEN n=301 THEN 17.50 ELSE 100 END,
  CASE WHEN n=401 THEN 'draft' WHEN n=402 THEN 'cancelled' ELSE 'sent' END,
  CASE WHEN n=301 THEN 'MXN' ELSE 'USD' END,
  CASE WHEN n=301 THEN 1 ELSE 17.5 END, CASE WHEN n=403 THEN 'PUE' ELSE 'PPD' END,
  CASE WHEN n IN (240,403) THEN 'stamped' ELSE 'pending' END, '2026-09-01',
  '10000000-0000-0000-0000-000000000002'::uuid
FROM unnest(ARRAY[101,102,103,104,105,120,201,202,203,211,212,213,214,221,222,223,240,301,401,402,403]) AS n;
INSERT INTO public.payments(id, invoice_id, amount, currency, exchange_rate, payment_date, rep_cfdi_status, organization_id)
SELECT ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  CASE WHEN n=301 THEN 1 ELSE 175 END,
  CASE WHEN n=301 THEN 'USD' ELSE 'MXN' END,
  CASE WHEN n=201 THEN 1 WHEN n=203 THEN 18 ELSE 17.5 END,
  '2026-09-01', CASE WHEN n=240 THEN 'stamped' ELSE 'none' END,
  '10000000-0000-0000-0000-000000000002'::uuid
FROM unnest(ARRAY[201,202,203,221,222,223,240,301]) AS n;

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices, public.payments, public.credit_notes,
  public.fixture_attempts, public.fixture_observations TO authenticated;
