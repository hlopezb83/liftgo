CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fixture.user_id', true), '')::uuid;
$$;
CREATE FUNCTION current_internal_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fixture.organization_id', true), '')::uuid;
$$;
CREATE FUNCTION today_mty() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-11-10'; $$;
CREATE FUNCTION fx_is_missing(text, numeric) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(coalesce($1, 'MXN')) <> 'MXN' AND coalesce($2, 0) <= 0;
$$;
CREATE TYPE app_role AS ENUM ('admin','administrativo','auditor','ventas','dispatcher','mechanic','customer');
CREATE TABLE user_roles (user_id uuid, role app_role);
CREATE TABLE role_permissions (role app_role, module text, access_level text);
CREATE FUNCTION has_role(uuid, app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2);
$$;

CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, rfc text, deleted_at timestamptz);
CREATE TABLE organization_customers (organization_id uuid, customer_id uuid);
CREATE TABLE quotes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, quote_number text,
  customer_name text, created_at timestamptz DEFAULT now(), is_e2e boolean);
CREATE UNIQUE INDEX quotes_org_number ON quotes(organization_id, quote_number);
CREATE TABLE invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, invoice_number text,
  customer_name text, created_at timestamptz DEFAULT now(), status text, is_e2e boolean,
  total numeric, moneda text, tipo_cambio numeric, cancellation_status text, issued_at timestamptz, paid_at timestamptz);
CREATE TABLE forklifts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text,
  status text, created_at timestamptz DEFAULT now(), deleted_at timestamptz, is_e2e boolean);
CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, booking_number text,
  customer_name text, customer_id uuid, forklift_id uuid, status text, return_status text, is_e2e boolean,
  created_at timestamptz DEFAULT now(), start_date date, end_date date);
CREATE TABLE deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, booking_id uuid,
  delivery_number text, type text, address text, scheduled_date date, status text,
  signature_base64 text, created_at timestamptz DEFAULT now());
CREATE TABLE delivery_historical_reconciliations (delivery_id uuid PRIMARY KEY, organization_id uuid, revoked_at timestamptz);
CREATE TABLE return_inspections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, booking_id uuid,
  inspection_number text, created_at timestamptz DEFAULT now());
CREATE TABLE maintenance_logs (forklift_id uuid, next_service_date date, deleted_at timestamptz, is_e2e boolean, performed_at timestamptz);
CREATE TABLE payments (invoice_id uuid, amount_mxn numeric, amount numeric, exchange_rate numeric, currency text, payment_date date);
CREATE TABLE credit_notes (id uuid PRIMARY KEY, invoice_id uuid, currency text, total numeric,
  issued_at timestamptz, cfdi_status text, status text, cancellation_status text);
CREATE VIEW v_invoices_with_balance WITH (security_invoker = true) AS
  SELECT invoices.*, total AS balance, total AS balance_mxn, issued_at::date AS due_date FROM invoices;
CREATE VIEW v_booking_occupancy WITH (security_invoker = true) AS
  SELECT forklift_id, is_e2e, start_date AS occ_start, end_date AS occ_end FROM bookings;
CREATE VIEW v_invoice_forklift_revenue AS
  SELECT NULL::uuid AS forklift_id, NULL::text AS status, false AS is_e2e, 0::numeric AS total_mxn_share WHERE false;

DO $fixture$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organization_customers','quotes','invoices','forklifts','bookings',
    'deliveries','delivery_historical_reconciliations','return_inspections'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY fixture_scope ON public.%I FOR SELECT TO authenticated USING
      (organization_id = (SELECT public.current_internal_organization_id()))', table_name);
  END LOOP;
END;
$fixture$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
