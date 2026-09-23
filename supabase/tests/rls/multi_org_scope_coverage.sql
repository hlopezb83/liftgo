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
-- Las tablas de INFRAESTRUCTURA SENSIBLE (allowlist `c_infra_deny_all`) no se
-- convierten en tablas de negocio: se les exige un contrato MÁS estricto
-- (FORCE RLS + deny-all RESTRICTIVE + cero policies permisivas + cero grants a
-- anon/authenticated/PUBLIC + grants completos de service_role).
-- Además exige RLS habilitada en TODAS las tablas públicas y que ninguna
-- policy permisiva de las tablas de relación sea `USING (true)`.
-- (FORCE ROW LEVEL SECURITY no se exige aquí: 44 tablas históricas no lo
-- tienen y no forma parte de este tramo.)
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
    'platform_operators',           -- operadores de plataforma (0030), select propio
    'brand_assets',                 -- identidad visual oficial compartida de LiftGo (0046)
    'equipment_model_catalog',      -- maestro técnico compartido de modelos (0046)
    'parts_catalog',                -- maestro compartido de SKUs, sin stock ni costos (0046)
    'parts_catalog_equipment_models', -- compatibilidad global SKU-modelo (0046)
    'legal_template_definitions',   -- definiciones legales globales LiftGo (0046)
    'legal_template_versions'       -- versiones legales globales append-only (0046)
  ];
  -- Tablas CON organization_id que usan policies propias (relación/infra)
  -- en lugar del trigger de negocio. Sus contratos se verifican aquí y en
  -- las suites RLS dedicadas; ninguna policy permisiva puede ser abierta.
  c_relacion CONSTANT text[] := ARRAY[
    'organization_memberships',     -- la propia membresía define el contexto
    'organization_customers',       -- relación comercial por empresa
    'customer_portal_accounts',     -- cuenta portal por (empresa, cliente)
    'organization_document_counters', -- folios por empresa (sin policies: sólo funciones)
    'storage_object_migrations',    -- ledger técnico del migrador Storage
    'rate_limits',                   -- contador global solo del servidor; suite rate_limits.sql
    'organization_legal_template_assignments' -- adopción legal privada por empresa (0046)
  ];
  -- Tablas CON organization_id de INFRAESTRUCTURA SENSIBLE: no son tablas de
  -- negocio y NO deben ser alcanzables desde la aplicación. En lugar de
  -- org_scope_isolation + trg_organization_write_context (que habilitarían
  -- escritura desde `authenticated`), se exige el contrato inverso y más
  -- estricto, verificado abajo tabla por tabla:
  --   RLS habilitada + FORCE, policy RESTRICTIVE deny-all para
  --   authenticated/anon, CERO policies permisivas para esos roles, CERO
  --   grants directos a anon/authenticated/PUBLIC y grants a service_role.
  -- Excepción exacta por nombre: cualquier otra tabla con organization_id
  -- sigue fallando cerrado en la rama de negocio.
  c_infra_deny_all CONSTANT text[] := ARRAY[
    -- 0034/0035: decisiones humanas de resolución manual de la cuarentena del
    -- migrador Storage. Contiene rutas de objetos; sólo el operador autorizado
    -- (service_role, entorno privado) la lee o escribe. Registrar una fila no
    -- autoriza copia: el migrador revalida dueño y empresa activa antes de
    -- copiar y falla cerrado ante discrepancias.
    'storage_migration_manual_resolutions'
  ];
  r record;
  v_grants_abiertos integer;
  v_grants_service integer;
  v_permisivas integer;
  v_deny_all boolean;
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
    -- Sin policies + RLS habilitada = deny-all para roles sin BYPASSRLS
    -- (p. ej. organization_document_counters, sólo vía funciones). No es falla.

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
      ELSIF r.table_name = ANY (c_infra_deny_all) THEN
        -- Infraestructura sensible: contrato deny-all, MÁS estricto que el de
        -- negocio. No se acepta ninguna apertura hacia la aplicación.
        IF NOT r.rls_forzada THEN
          v_fallas := v_fallas || format('%s: infra deny-all sin FORCE ROW LEVEL SECURITY', r.table_name);
        END IF;

        SELECT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = r.table_name
            AND p.permissive = 'RESTRICTIVE'
            AND p.cmd = 'ALL'
            AND p.roles @> ARRAY['authenticated'::name]
            AND p.roles @> ARRAY['anon'::name]
            AND regexp_replace(coalesce(p.qual, ''), '\s', '', 'g') = 'false'
            AND regexp_replace(coalesce(p.with_check, ''), '\s', '', 'g') = 'false'
        ) INTO v_deny_all;
        IF NOT v_deny_all THEN
          v_fallas := v_fallas || format(
            '%s: infra deny-all sin policy RESTRICTIVE FOR ALL TO authenticated, anon USING(false) WITH CHECK(false)',
            r.table_name);
        END IF;

        -- Cualquier policy permisiva alcanzable por la aplicación abriría datos.
        SELECT count(*) INTO v_permisivas
        FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = r.table_name
          AND p.permissive = 'PERMISSIVE'
          AND (p.roles @> ARRAY['authenticated'::name]
               OR p.roles @> ARRAY['anon'::name]
               OR p.roles @> ARRAY['public'::name]);
        IF v_permisivas > 0 THEN
          v_fallas := v_fallas || format(
            '%s: infra deny-all con % policy(s) PERMISSIVE para anon/authenticated/public',
            r.table_name, v_permisivas);
        END IF;

        -- Sin grants directos: ni siquiera con policies deny-all debe existir
        -- privilegio de tabla para los roles de la aplicación.
        SELECT count(*) INTO v_grants_abiertos
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public' AND g.table_name = r.table_name
          AND g.grantee IN ('anon', 'authenticated', 'PUBLIC');
        IF v_grants_abiertos > 0 THEN
          v_fallas := v_fallas || format(
            '%s: infra deny-all con % grant(s) directo(s) a anon/authenticated/PUBLIC',
            r.table_name, v_grants_abiertos);
        END IF;

        -- El operador autorizado sí debe poder operar la tabla.
        SELECT count(DISTINCT g.privilege_type) INTO v_grants_service
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public' AND g.table_name = r.table_name
          AND g.grantee = 'service_role'
          AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
        IF v_grants_service <> 4 THEN
          v_fallas := v_fallas || format(
            '%s: infra deny-all sin los 4 privilegios de service_role (encontrados: %)',
            r.table_name, v_grants_service);
        END IF;
      ELSE
        v_scoped := v_scoped + 1;
        IF NOT r.tiene_iso THEN
          v_fallas := v_fallas || format('%s: tiene organization_id pero NO org_scope_isolation (RESTRICTIVE)', r.table_name);
        END IF;
        IF NOT r.tiene_trigger THEN
          v_fallas := v_fallas || format('%s: tiene organization_id pero NO trg_organization_write_context', r.table_name);
        END IF;
      END IF;
    ELSIF NOT (r.table_name = ANY (c_globales)) THEN
      v_fallas := v_fallas || format(
        '%s: tabla pública sin organization_id y fuera de la allowlist de globales', r.table_name);
    END IF;
  END LOOP;

  -- La allowlist no debe contener tablas inexistentes (evita listas zombis).
  FOR r IN
    SELECT unnest(c_globales || c_relacion || c_infra_deny_all) AS nombre
  LOOP
    IF to_regclass('public.' || r.nombre) IS NULL THEN
      v_fallas := v_fallas || format('allowlist: la tabla %s no existe', r.nombre);
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'COBERTURA MULTIEMPRESA: % hallazgo(s):\n%',
      array_length(v_fallas, 1), array_to_string(v_fallas, E'\n');
  END IF;

  RAISE NOTICE 'OK: cobertura dinámica multiempresa: % tablas públicas, % org-scoped con policy+trigger, % globales, % relación, % infra deny-all',
    v_tablas, v_scoped, array_length(c_globales, 1), array_length(c_relacion, 1),
    array_length(c_infra_deny_all, 1);
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
