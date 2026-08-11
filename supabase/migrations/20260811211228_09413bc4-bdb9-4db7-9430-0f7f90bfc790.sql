-- Tema 1: company_settings — normalización de policies + FORCE RLS
-- Reglas: TO authenticated explícito, (select auth.uid()), sin USING (true), sin acceso anon.

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Administrativo read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Administrativo update company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Auditor read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Back office read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Dispatchers read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Ventas read company_settings" ON public.company_settings;

CREATE POLICY "Admins full access company_settings"
  ON public.company_settings
  FOR ALL
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::app_role));

CREATE POLICY "Administrativo read company_settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'administrativo'::app_role));

CREATE POLICY "Administrativo update company_settings"
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role((select auth.uid()), 'administrativo'::app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'administrativo'::app_role));

CREATE POLICY "Auditor read company_settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'auditor'::app_role));

CREATE POLICY "Back office read company_settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'auditor'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
    OR public.has_role((select auth.uid()), 'ventas'::app_role)
  );

CREATE POLICY "Dispatchers read company_settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role));

CREATE POLICY "Ventas read company_settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'ventas'::app_role));

REVOKE ALL ON public.company_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;