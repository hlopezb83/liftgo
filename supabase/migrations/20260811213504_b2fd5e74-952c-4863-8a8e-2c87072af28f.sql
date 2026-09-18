-- =============================================================================
-- Optimizacion de policies RLS (sin cambio de semantica)
--
-- 1) auth.uid() -> (select auth.uid()) en TODAS las policies vivas del schema
--    public (234 de 247 lo usaban directo). Postgres deja de re-evaluar la
--    funcion STABLE por fila y la sube a un InitPlan que corre una sola vez.
-- 2) Cadenas OR de has_role() consolidadas en funciones STABLE helper
--    (is_admin_or_administrativo / is_admin_administrativo_auditor /
--     is_ops_staff / is_backoffice / is_staff): 38 usos. Cada helper hace UN
--    solo EXISTS sobre user_roles en vez de N llamadas a has_role.
--
-- NO cambia que roles acceden a que: se conservan exactamente el mismo TO,
-- cmd, PERMISSIVE/RESTRICTIVE y la misma logica booleana. Las policies
-- "TO public" conservan has_role inline, porque los helpers solo tienen
-- EXECUTE para authenticated/service_role (nunca anon).
--
-- Evidencia EXPLAIN sobre public.invoices (predicado STABLE representativo;
-- el rol de inspeccion de este entorno no puede hacer SET ROLE authenticated,
-- asi que se usa una funcion STABLE equivalente para mostrar el plan):
--
-- ANTES:
--   EXPLAIN SELECT id FROM public.invoices
--    WHERE length(invoice_number) = pg_backend_pid();
--
--   Seq Scan on invoices  (cost=0.00..10.73 rows=1 width=16)
--     Filter: (length(invoice_number) = pg_backend_pid())
--
-- DESPUES:
--   EXPLAIN SELECT id FROM public.invoices
--    WHERE length(invoice_number) = (select pg_backend_pid());
--
--   Seq Scan on invoices  (cost=0.01..10.50 rows=1 width=16)
--     Filter: (length(invoice_number) = (InitPlan 1).col1)
--     InitPlan 1
--       ->  Result  (cost=0.00..0.01 rows=1 width=4)
--
-- La funcion STABLE desaparece del Filter por fila y pasa a un InitPlan
-- evaluado una unica vez. Ese es exactamente el efecto que producen
-- (select auth.uid()) y (select public.is_staff()) dentro de las policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Funciones helper STABLE (consolidan OR-chains de has_role)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin_or_administrativo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo']::public.app_role[])
  )
$$;
REVOKE ALL ON FUNCTION public.is_admin_or_administrativo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_administrativo() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_administrativo_auditor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo', 'auditor']::public.app_role[])
  )
$$;
REVOKE ALL ON FUNCTION public.is_admin_administrativo_auditor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_administrativo_auditor() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_ops_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo', 'dispatcher', 'mechanic']::public.app_role[])
  )
$$;
REVOKE ALL ON FUNCTION public.is_ops_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_ops_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_backoffice()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo', 'auditor', 'dispatcher', 'ventas']::public.app_role[])
  )
$$;
REVOKE ALL ON FUNCTION public.is_backoffice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_backoffice() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo', 'auditor', 'dispatcher', 'mechanic', 'ventas']::public.app_role[])
  )
$$;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Reescritor de expresiones (helper temporal, se elimina al final)
--    Sustituye SOLO grupos que sean cadenas OR puras de has_role(auth.uid(), X)
--    por el helper equivalente. Cualquier otra forma queda intacta.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.__rls_consolidate(expr text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  out_expr text := expr;
  chain    text;
  roles    text[];
  helper   text;
BEGIN
  FOR chain IN
    SELECT DISTINCT m[1]
    FROM regexp_matches(
           expr,
           '(\(has_role\(auth\.uid\(\), ''[a-z_]+''::app_role\)( OR has_role\(auth\.uid\(\), ''[a-z_]+''::app_role\))+\))',
           'g'
         ) AS m
  LOOP
    roles := ARRAY(
      SELECT r[1]
      FROM regexp_matches(chain, 'has_role\(auth\.uid\(\), ''([a-z_]+)''::app_role\)', 'g') AS r
      ORDER BY 1
    );

    helper := CASE
      WHEN roles = ARRAY['admin','administrativo']
        THEN 'is_admin_or_administrativo'
      WHEN roles = ARRAY['admin','administrativo','auditor']
        THEN 'is_admin_administrativo_auditor'
      WHEN roles = ARRAY['admin','administrativo','dispatcher','mechanic']
        THEN 'is_ops_staff'
      WHEN roles = ARRAY['admin','administrativo','auditor','dispatcher','ventas']
        THEN 'is_backoffice'
      WHEN roles = ARRAY['admin','administrativo','auditor','dispatcher','mechanic','ventas']
        THEN 'is_staff'
      ELSE NULL
    END;

    IF helper IS NOT NULL THEN
      out_expr := replace(out_expr, chain, '( SELECT public.' || helper || '())');
    END IF;
  END LOOP;

  RETURN out_expr;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 3. DROP + CREATE del estado final de cada policy que cambia
-- -----------------------------------------------------------------------------

DO $mig$
DECLARE
  r        record;
  nq       text;
  nw       text;
  stmt     text;
  changed  integer := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    -- Normaliza lo ya envuelto para no anidar (select (select auth.uid())).
    nq := replace(coalesce(r.qual, ''), '( SELECT auth.uid() AS uid)', 'auth.uid()');
    nw := replace(coalesce(r.with_check, ''), '( SELECT auth.uid() AS uid)', 'auth.uid()');

    -- Los helpers no tienen EXECUTE para anon: solo se usan en policies
    -- cuyo unico rol destino es authenticated.
    IF r.roles = ARRAY['authenticated']::name[] THEN
      nq := public.__rls_consolidate(nq);
      nw := public.__rls_consolidate(nw);
    END IF;

    nq := replace(nq, 'auth.uid()', '( SELECT auth.uid() AS uid)');
    nw := replace(nw, 'auth.uid()', '( SELECT auth.uid() AS uid)');

    CONTINUE WHEN nq = coalesce(r.qual, '') AND nw = coalesce(r.with_check, '');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

    stmt := format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
      r.policyname,
      r.tablename,
      r.permissive,
      r.cmd,
      array_to_string(r.roles, ', ')
    );
    IF nq <> '' THEN
      stmt := stmt || ' USING (' || nq || ')';
    END IF;
    IF nw <> '' THEN
      stmt := stmt || ' WITH CHECK (' || nw || ')';
    END IF;

    EXECUTE stmt;
    changed := changed + 1;
  END LOOP;

  RAISE NOTICE 'Policies recreadas: %', changed;
END;
$mig$;

DROP FUNCTION public.__rls_consolidate(text);

-- -----------------------------------------------------------------------------
-- 4. Verificacion: no debe quedar ninguna policy con auth.uid() sin envolver
-- -----------------------------------------------------------------------------

DO $check$
DECLARE
  pendientes integer;
BEGIN
  SELECT count(*) INTO pendientes
  FROM (
    SELECT
      (length(e) - length(replace(e, 'auth.uid()', ''))) / 10
        - (length(e) - length(replace(e, 'SELECT auth.uid() AS uid', ''))) / 24 AS bare
    FROM (
      SELECT coalesce(qual, '') || ' ' || coalesce(with_check, '') AS e
      FROM pg_policies
      WHERE schemaname = 'public'
    ) p
  ) x
  WHERE bare > 0;

  IF pendientes > 0 THEN
    RAISE EXCEPTION 'Quedaron % policies con auth.uid() sin envolver', pendientes;
  END IF;
END;
$check$;