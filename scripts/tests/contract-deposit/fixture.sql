-- Synthetic minimum schema only; this is not a complete Supabase replay.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM ('admin', 'administrativo', 'dispatcher');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
$$;
CREATE FUNCTION public.has_role(p_user uuid, p_role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'app_role' = p_role::text AND p_user = auth.uid();
$$;
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  deposit_amount numeric,
  deposit_status text NOT NULL DEFAULT 'held',
  deposit_settled_at timestamptz,
  deposit_settled_amount numeric,
  deposit_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Same updated_at behavior as the existing contracts trigger.
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_tenant ON public.contracts TO authenticated
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org')::uuid)
  WITH CHECK (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org')::uuid);
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, UPDATE ON public.contracts TO authenticated;
