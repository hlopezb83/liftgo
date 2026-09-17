-- Multiempresa · detector de contrato de ACL para funciones del esquema public.
--
-- Motivo: Supabase ejecuta
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
--     TO anon, authenticated, service_role;
-- por lo que TODA función nueva de public nace con EXECUTE concedido
-- DIRECTAMENTE a anon en su proacl. Esto ya causó una regresión real en la
-- firma estricta del asignador de folio REP (corregida en 0026).
--
-- Esta suite NO cambia permisos ni lógica: solo detecta. Corre sobre la base
-- efímera de CI, después del historial Supabase completo y de las migraciones
-- Drizzle (0026 incluida). Termina en ROLLBACK.
--
-- Cobertura:
--   1) Control positivo: una función nueva creada aquí recibe EXECUTE directo
--      para anon por default privileges (demuestra que el detector mira el
--      lugar correcto y que el entorno reproduce la causa sistémica).
--   2) Control negativo: las dos firmas REP de 0026 NO tienen anon, ni directo
--      ni efectivo, y conservan sus grants legítimos.
--   3) Barrido: toda función SECURITY DEFINER de public debe estar libre de
--      anon (ACL directo, grant a PUBLIC y privilegio efectivo se comprueban
--      por separado). Allowlist mínima por firma exacta:
--        get_public_branding(), today_mty(), fx_is_missing(text, numeric).
--      Nada más se agrega a la allowlist: cualquier otra firma es un hallazgo
--      (incluidas accept_quote_from_portal / reject_quote_from_portal).
BEGIN;

-- =====================================================================
-- 0. Precondición: el rol anon existe en este entorno
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'ACL CONTRACT: el rol anon no existe; el detector no puede correr';
  END IF;
END;
$$;

-- =====================================================================
-- 1. Control positivo: default privileges conceden EXECUTE directo a anon
-- =====================================================================
CREATE FUNCTION public.__acl_probe_default_privileges()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$ SELECT 1 $fn$;

DO $$
DECLARE
  v_oid oid := 'public.__acl_probe_default_privileges()'::regprocedure;
  v_direct boolean;
  v_effective boolean;
BEGIN
  -- proacl IS NULL = ACL predeterminado de PostgreSQL (owner + PUBLIC), no
  -- "sin permisos": se expande con acldefault antes de inspeccionarlo.
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = v_oid
      AND a.privilege_type = 'EXECUTE'
      AND a.grantee = 'anon'::regrole::oid
  ) INTO v_direct;

  v_effective := has_function_privilege('anon', v_oid, 'EXECUTE');

  IF NOT v_direct THEN
    RAISE EXCEPTION
      'ACL CONTRACT (control positivo): una función nueva de public NO recibió EXECUTE directo para anon. '
      'O el entorno de CI ya no reproduce los default privileges de Supabase, o fueron revocados. '
      'Revisar pg_default_acl antes de confiar en el resto del detector.';
  END IF;

  IF NOT v_effective THEN
    RAISE EXCEPTION
      'ACL CONTRACT (control positivo): ACL directo presente pero has_function_privilege(anon) = false; '
      'estado inconsistente del entorno.';
  END IF;
END;
$$;

DROP FUNCTION public.__acl_probe_default_privileges();

-- =====================================================================
-- 2. Control negativo: firmas REP protegidas por 0026
-- =====================================================================
DO $$
DECLARE
  v_strict oid;
  v_wrapper oid;
  r record;
BEGIN
  -- to_regprocedure resuelve por tipos exactos y devuelve NULL si la firma no
  -- existe (a diferencia de ::regprocedure, que aborta).
  v_strict := to_regprocedure('public.assign_stamped_rep_number(uuid, text, uuid)');
  v_wrapper := to_regprocedure('public.assign_stamped_rep_number(uuid, text)');

  IF v_strict IS NULL OR v_wrapper IS NULL THEN
    RAISE EXCEPTION
      'ACL CONTRACT (control negativo): faltan firmas REP de 0026 (estricta=% wrapper=%); '
      'la cadena Drizzle no se aplicó en esta base',
      v_strict, v_wrapper;
  END IF;

  FOR r IN
    SELECT unnest(ARRAY[v_strict, v_wrapper]) AS oid
  LOOP
    -- proacl IS NULL = ACL predeterminado; se expande con acldefault.
    IF EXISTS (
      SELECT 1
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = r.oid
        AND a.privilege_type = 'EXECUTE'
        AND a.grantee = 'anon'::regrole::oid
    ) THEN
      RAISE EXCEPTION
        'ACL CONTRACT (control negativo): % conserva ACL directo de EXECUTE para anon',
        r.oid::regprocedure;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = r.oid
        AND a.privilege_type = 'EXECUTE'
        AND a.grantee = 0  -- 0 = PUBLIC
    ) THEN
      RAISE EXCEPTION
        'ACL CONTRACT (control negativo): % conserva EXECUTE concedido a PUBLIC',
        r.oid::regprocedure;
    END IF;

    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION
        'ACL CONTRACT (control negativo): anon tiene privilegio EFECTIVO de EXECUTE sobre %',
        r.oid::regprocedure;
    END IF;
  END LOOP;

  -- Grants legítimos que 0026 debe conservar.
  IF NOT has_function_privilege('authenticated', v_strict, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_strict, 'EXECUTE') THEN
    RAISE EXCEPTION
      'ACL CONTRACT (control negativo): la firma estricta REP perdió EXECUTE para authenticated/service_role';
  END IF;

  IF NOT has_function_privilege('service_role', v_wrapper, 'EXECUTE') THEN
    RAISE EXCEPTION
      'ACL CONTRACT (control negativo): el wrapper REP perdió EXECUTE para service_role';
  END IF;
END;
$$;

-- =====================================================================
-- 3. Barrido: funciones SECURITY DEFINER de public sin anon
-- =====================================================================
DO $$
DECLARE
  v_allow text[] := ARRAY[
    'get_public_branding()',
    'today_mty()',
    'fx_is_missing(text, numeric)'
  ];
  v_direct text[] := ARRAY[]::text[];
  v_public text[] := ARRAY[]::text[];
  v_effective text[] := ARRAY[]::text[];
  r record;
  v_sig text;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      -- Firma por TIPOS exactos (pg_get_function_identity_arguments incluye
      -- los nombres de los argumentos y no sirve para comparar).
      p.proname || '(' || coalesce((
        SELECT string_agg(format_type(t, NULL), ', ' ORDER BY ord)
        FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, ord)
      ), '') || ')' AS signature,
      -- proacl IS NULL = ACL predeterminado de PostgreSQL (no "sin permisos"):
      -- se expande con acldefault('f', proowner) antes de inspeccionarlo.
      EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 'anon'::regrole::oid
      ) AS anon_direct,
      EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 0
      ) AS public_grant,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_effective
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind = 'f'
    ORDER BY 2
  LOOP
    v_sig := r.signature;
    CONTINUE WHEN v_sig = ANY (v_allow);

    -- Categorías INDEPENDIENTES: una misma firma puede aparecer en varias
    -- (p. ej. ACL directo a anon y además grant a PUBLIC).
    IF r.anon_direct THEN
      v_direct := v_direct || v_sig;
    END IF;

    IF r.public_grant THEN
      v_public := v_public || v_sig;
    END IF;

    IF r.anon_effective AND NOT r.anon_direct AND NOT r.public_grant THEN
      -- Efecto sin ACL explícito para anon ni para PUBLIC. La causa puede ser
      -- membresía de roles u otra ruta; el detector no la afirma, solo reporta.
      v_effective := v_effective || v_sig;
    END IF;
  END LOOP;

  IF array_length(v_direct, 1) IS NOT NULL
     OR array_length(v_public, 1) IS NOT NULL
     OR array_length(v_effective, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'ACL CONTRACT: funciones SECURITY DEFINER de public alcanzables por anon.\n'
      'ACL directo a anon (% firmas): %\n'
      'Grant explícito a PUBLIC (% firmas): %\n'
      'Privilegio efectivo sin ACL directo a anon ni a PUBLIC — causa por determinar (% firmas): %',
      coalesce(array_length(v_direct, 1), 0), array_to_string(v_direct, E'\n  - '),
      coalesce(array_length(v_public, 1), 0), array_to_string(v_public, E'\n  - '),
      coalesce(array_length(v_effective, 1), 0), array_to_string(v_effective, E'\n  - ');
  END IF;
END;
$$;

ROLLBACK;
