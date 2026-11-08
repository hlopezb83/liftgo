-- Focused synthetic PostgreSQL fixture, not a replay of all product migrations.
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
$$;
GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
CREATE TABLE public.organizations(id uuid PRIMARY KEY,is_active boolean NOT NULL);
CREATE TABLE public.organization_memberships(organization_id uuid NOT NULL,auth_user_id uuid NOT NULL,member_type text NOT NULL);
CREATE TABLE public.user_roles(user_id uuid NOT NULL,role text NOT NULL);
CREATE TABLE public.role_permissions(role text NOT NULL,module text NOT NULL,access_level text NOT NULL);
CREATE TABLE public.quotes(
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, quote_number text NOT NULL,
  customer_id uuid,customer_name text,forklift_id uuid,start_date date,end_date date,
  subtotal numeric DEFAULT 100,tax_rate numeric DEFAULT 16,tax_amount numeric DEFAULT 16,total numeric DEFAULT 116,
  status text DEFAULT 'draft',valid_until date,quote_type text DEFAULT 'rental',currency text DEFAULT 'MXN',tipo_cambio numeric DEFAULT 1,
  created_at timestamptz DEFAULT '2026-01-01Z',is_e2e boolean,notes text,line_items jsonb DEFAULT '[]'
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_own_roles ON public.user_roles FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_staff_permissions ON public.role_permissions FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=(SELECT auth.uid()) AND ur.role IN('admin','administrativo','auditor','ventas','dispatcher','mechanic')));
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_staff_quotes ON public.quotes FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=(SELECT auth.uid()) AND ur.role IN('admin','administrativo','auditor','ventas','dispatcher','mechanic')));
-- Added after the actual repository organization helper is loaded:
-- a restrictive organization scope and an extra hidden row prove invoker RLS.
GRANT SELECT ON public.user_roles,public.role_permissions,public.quotes TO authenticated;
-- Simulate inherited default grants to prove the migration closes them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, service_role;
