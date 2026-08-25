-- H-11: aislar datos E2E server-side en las policies SELECT de roles operativos.
-- Los roles admin/administrativo NO se filtran (ahí corren las suites E2E).

-- customers
DROP POLICY IF EXISTS "Dispatchers read customers" ON public.customers;
CREATE POLICY "Dispatchers read customers" ON public.customers FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role) AND (is_e2e IS NOT TRUE));

DROP POLICY IF EXISTS "Auditor read customers" ON public.customers;
CREATE POLICY "Auditor read customers" ON public.customers FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'auditor'::app_role) AND (is_e2e IS NOT TRUE));

-- quotes
DROP POLICY IF EXISTS "Dispatchers read quotes" ON public.quotes;
CREATE POLICY "Dispatchers read quotes" ON public.quotes FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role) AND (is_e2e IS NOT TRUE));

DROP POLICY IF EXISTS "Mechanics read quotes" ON public.quotes;
CREATE POLICY "Mechanics read quotes" ON public.quotes FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'mechanic'::app_role) AND (is_e2e IS NOT TRUE));

DROP POLICY IF EXISTS "Auditor read quotes" ON public.quotes;
CREATE POLICY "Auditor read quotes" ON public.quotes FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'auditor'::app_role) AND (is_e2e IS NOT TRUE));

-- forklifts
DROP POLICY IF EXISTS "Dispatchers read forklifts" ON public.forklifts;
CREATE POLICY "Dispatchers read forklifts" ON public.forklifts FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role) AND (is_e2e IS NOT TRUE));

DROP POLICY IF EXISTS "Mechanics read forklifts" ON public.forklifts;
CREATE POLICY "Mechanics read forklifts" ON public.forklifts FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'mechanic'::app_role) AND (is_e2e IS NOT TRUE));

DROP POLICY IF EXISTS "Ventas read forklifts" ON public.forklifts;
CREATE POLICY "Ventas read forklifts" ON public.forklifts FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'ventas'::app_role) AND (is_e2e IS NOT TRUE));

DROP POLICY IF EXISTS "Auditor read forklifts" ON public.forklifts;
CREATE POLICY "Auditor read forklifts" ON public.forklifts FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'auditor'::app_role) AND (is_e2e IS NOT TRUE));