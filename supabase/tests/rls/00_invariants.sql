-- E1: invariantes de seguridad del estado FINAL del schema.
--
-- Esta suite NO prueba una tabla concreta: falla el CI si alguien vuelve a
-- introducir los antipatrones que ya se corrigieron en v7.294.0 / v7.299.x.
--
-- Invariantes:
--   1. Ninguna policy `FOR ALL ... USING (true)` en `public`, salvo las que
--      apuntan exclusivamente a `service_role` (que ya bypasea RLS).
--   2. Ninguna policy con `USING (true)` dirigida a `anon` o a `PUBLIC` para
--      comandos de escritura (INSERT/UPDATE/DELETE/ALL).
--   3. Toda tabla sensible tiene RLS habilitado Y `FORCE ROW LEVEL SECURITY`.
--   4. Toda tabla de `public` con RLS habilitado tiene al menos una policy
--      (si no, queda inaccesible en silencio).
--
-- Para añadir una tabla sensible nueva: agrégala a `v_sensitive` y crea su
-- migración con `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.

BEGIN;

DO $$
DECLARE
  r record;
  v_bad text := '';
  v_count int := 0;
  v_sensitive text[] := ARRAY[
    'billing_secrets', 'invoices', 'payments_portal', 'supplier_payments',
    'supplier_bills', 'profiles', 'user_roles', 'role_permissions',
    'audit_logs', 'contracts', 'customers_portal', 'company_settings'
  ];
  v_name text;
  v_relkind "char";
  v_rls boolean;
  v_force boolean;
BEGIN
  -- 1. FOR ALL USING (true)
  FOR r IN
    SELECT tablename, policyname, roles::text AS roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'ALL'
      AND permissive = 'PERMISSIVE'
      AND coalesce(btrim(qual), '') = 'true'
      AND roles::text[] <> ARRAY['service_role']
  LOOP
    v_count := v_count + 1;
    v_bad := v_bad || format(E'\n  - FOR ALL USING(true): %I.%s (roles: %s)',
                             r.tablename, r.policyname, r.roles);
  END LOOP;

  -- 2. Escritura abierta a anon / PUBLIC
  FOR r IN
    SELECT tablename, policyname, cmd, roles::text AS roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND permissive = 'PERMISSIVE'
      AND (roles::text[] && ARRAY['anon', 'public'])
      AND coalesce(btrim(with_check), btrim(qual), '') = 'true'
  LOOP
    v_count := v_count + 1;
    v_bad := v_bad || format(E'\n  - escritura abierta a %s: %I.%s (%s)',
                             r.roles, r.tablename, r.policyname, r.cmd);
  END LOOP;

  -- 3. FORCE RLS en tablas sensibles
  FOREACH v_name IN ARRAY v_sensitive LOOP
    SELECT c.relkind, c.relrowsecurity, c.relforcerowsecurity
      INTO v_relkind, v_rls, v_force
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_name;

    IF v_relkind IS NULL THEN
      -- No existe (o es vista): no aplica FORCE RLS. Solo se informa.
      RAISE NOTICE 'AVISO: % no es una tabla de public; se omite del check de FORCE RLS', v_name;
      CONTINUE;
    END IF;
    IF v_relkind <> 'r' THEN
      CONTINUE;
    END IF;
    IF NOT v_rls OR NOT v_force THEN
      v_count := v_count + 1;
      v_bad := v_bad || format(E'\n  - tabla sensible sin blindaje: %I (rls=%s, force=%s)',
                               v_name, v_rls, v_force);
    END IF;
  END LOOP;

  -- 4. RLS habilitado pero sin policies
  FOR r IN
    SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
       )
  LOOP
    v_count := v_count + 1;
    v_bad := v_bad || format(E'\n  - RLS activo sin ninguna policy: %I', r.tablename);
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'INVARIANTES DE SEGURIDAD ROTAS (% hallazgo(s)):%', v_count, v_bad;
  END IF;

  RAISE NOTICE 'OK: invariantes de RLS/FORCE RLS/USING(true) satisfechas';
END $$;

ROLLBACK;
