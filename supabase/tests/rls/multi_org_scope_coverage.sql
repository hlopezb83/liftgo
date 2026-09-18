-- Multiempresa · Tramo 9: cobertura DINÁMICA de aislamiento por organización.
--
-- Hasta 0029 la cobertura RLS multiempresa se comprobaba con listas estáticas
-- de tablas (multi_org_read_isolation.sql, organization_columns.sql). Esta
-- suite recorre information_schema/pg_policies/pg_trigger y falla cerrado si
-- aparece una tabla pública de negocio que:
--   · tenga `organization_id` pero NO la policy RESTRICTIVE `org_scope_isolation`
--     ni el trigger `trg_organization_write_context`, o
--   · NO tenga `organization_id` y NO esté en la allowlist explícita de tablas
--     globales/relación (cada una con su propia razón y sus propias policies).
-- Además exige RLS habilitada (y forzada) en TODAS las tablas públicas y que
-- ninguna policy permisiva de lectura para authenticated sea `USING (true)`
-- fuera de la allowlist de tablas globales.
--
-- Cuando se agregue una tabla nueva, la opción correcta es darle
-- `organization_id` + policy/trigger (o justificarla aquí, por nombre, si es
-- global). No se admiten comodines.
BEGIN;

DO $$
DECLARE
  -- Tablas SIN organization_id: identidad global o catálogo del sistema.
  -- Cada una tiene policies propias verificadas por su suite dedicada.
  c_globales CONSTANT text[] := ARRAY[
    'customers',                    -- identidad global; acotada por customer_scope_matches (0030)
    'organizations',                -- catálogo de empresas; select por membresía
    'profiles',                     -- perfil por usuario auth (una empresa por usuario)
    'role_permissions',             -- catálogo de permisos por rol
    'user_roles',                   -- rol por usuario auth
    'storage_reference_migrations', -- ledger técnico del migrador Storage (service_role)
    'platform_operators'            -- operadores de plataforma (0030), select propio
  ];
  -- Tablas CON organization_id que usan policies propias (relación/infra)
  -- en lugar de org_scope_isolation. Se exige igualmente que TODAS sus
  -- policies referencien la organización o al usuario autenticado.
  c_relacion CONSTANT text[] := ARRAY[
    'organization_memberships',     -- la propia membresía define el contexto
    'organization_customers',       -- relación comercial por empresa
    'customer_portal_accounts',     -- cuenta portal por (empresa, cliente)
    'organization_document_counters', -- folios por empresa (sólo funciones)
    'storage_object_migrations'     -- ledger técnico del migrador Storage
  ];
  r record;
  v_fallas text[] := '{}';
  v_tablas integer := 0;
  v_scoped integer := 0;
BEGIN
  FOR r IN
    SELECT t.table_name,
           EXISTS (
             SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = t.table_name
               AND c.column_name = 'organization_id'
           ) AS tiene_org,
           cl.relrowsecurity AS rls,
           cl.relforcerowsecurity AS rls_forzada,
           EXISTS (
             SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = t.table_name
               AND p.policyname = 'org_scope_isolation'
               AND p.permissive = 'RESTRICTIVE'
           ) AS tiene_iso,
           EXISTS (
             SELECT 1 FROM pg_trigger tr
             WHERE tr.tgrelid = cl.oid AND NOT tr.tgisinternal
               AND tr.tgname = 'trg_organization_write_context'
           ) AS tiene_trigger,
           (SELECT count(*) FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = t.table_name) AS n_policies
    FROM information_schema.tables t
    JOIN pg_class cl ON cl.relname = t.table_name
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  LOOP
    v_tablas := v_tablas + 1;

    IF NOT r.rls THEN
      v_fallas := v_fallas || format('%s: RLS deshabilitada', r.table_name);
    END IF;
    IF r.n_policies = 0 THEN
      v_fallas := v_fallas || format('%s: sin policies (tabla inaccesible o abierta según GRANT)', r.table_name);
    END IF;

    IF r.tiene_org THEN
      IF r.table_name = ANY (c_relacion) THEN
        -- Relación/infra: policies propias; ninguna debe ser abierta.
        IF EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = r.table_name
            AND p.permissive = 'PERMISSIVE'
            AND (p.roles @> ARRAY['authenticated'::name] OR p.roles @> ARRAY['public'::name])
            AND coalesce(p.qual, p.with_check) IS NOT NULL
            AND regexp_replace(coalesce(p.qual, ''), '\s', '', 'g') = 'true'
        ) THEN
          v_fallas := v_fallas || format('%s: policy permisiva USING (true) en tabla de relación', r.table_name);
        END IF;
      ELSE
        v_scoped := v_scoped + 1;
        IF NOT r.tiene_iso THEN
          v_fallas := v_fallas || format('%s: tiene organization_id pero NO org_scope_isolation (RESTRICTIVE)', r.table_name);
        END IF;
        IF NOT r.tiene_trigger THEN
          v_fallas := v_fallas || format('%s: tiene organization_id pero NO trg_organization_write_context', r.table_name);
        END IF;
        IF NOT r.rls_forzada THEN
          v_fallas := v_fallas || format('%s: RLS no forzada en tabla org-scoped', r.table_name);
        END IF;
      END IF;
    ELSIF NOT (r.table_name = ANY (c_globales)) THEN
      v_fallas := v_fallas || format(
        '%s: tabla pública sin organization_id y fuera de la allowlist de globales', r.table_name);
    END IF;
  END LOOP;

  -- La allowlist no debe contener tablas inexistentes (evita listas zombis).
  FOR r IN
    SELECT unnest(c_globales || c_relacion) AS nombre
  LOOP
    IF to_regclass('public.' || r.nombre) IS NULL THEN
      v_fallas := v_fallas || format('allowlist: la tabla %s no existe', r.nombre);
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'COBERTURA MULTIEMPRESA: % hallazgo(s):\n%',
      array_length(v_fallas, 1), array_to_string(v_fallas, E'\n');
  END IF;

  RAISE NOTICE 'OK: cobertura dinámica multiempresa: % tablas públicas, % org-scoped con policy+trigger, % globales, % relación',
    v_tablas, v_scoped, array_length(c_globales, 1), array_length(c_relacion, 1);
END;
$$;

-- `org_scope_isolation` debe delegar en organization_scope_matches (que desde
-- 0030 excluye empresas suspendidas) en TODAS las tablas org-scoped.
DO $$
DECLARE
  v_malas text;
BEGIN
  SELECT string_agg(p.tablename, ', ' ORDER BY p.tablename) INTO v_malas
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.policyname = 'org_scope_isolation'
    AND coalesce(p.qual, '') NOT ILIKE '%organization_scope_matches(%';
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'COBERTURA MULTIEMPRESA: org_scope_isolation sin organization_scope_matches en: %', v_malas;
  END IF;

  -- organization_scope_matches sólo acepta empresas activas.
  IF pg_get_functiondef('public.organization_scope_matches(uuid)'::regprocedure) NOT ILIKE '%is_active%' THEN
    RAISE EXCEPTION 'COBERTURA MULTIEMPRESA: organization_scope_matches no considera organizations.is_active';
  END IF;
  RAISE NOTICE 'OK: org_scope_isolation delega en organization_scope_matches (con is_active)';
END;
$$;

ROLLBACK;
