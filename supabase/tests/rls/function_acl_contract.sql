-- Multiempresa · detector de contrato de ACL para funciones del esquema public.
--
-- Motivo: Supabase ejecuta
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
--     TO anon, authenticated, service_role;
-- por lo que TODA función nueva de public nace con EXECUTE concedido
-- DIRECTAMENTE a anon en su proacl ALMACENADO. Esto ya causó una regresión real
-- en la firma estricta del asignador de folio REP (corregida en 0026).
--
-- Esta suite NO cambia permisos ni lógica: solo detecta. Corre sobre la base
-- efímera de CI, después del historial Supabase completo y de las migraciones
-- Drizzle (0026 incluida). Termina en ROLLBACK.
--
-- Cuatro vías de acceso, reportadas por separado y NO excluyentes:
--   A) ACL almacenado, entrada directa a anon   (proacl IS NOT NULL)
--   B) ACL almacenado, entrada a PUBLIC         (proacl IS NOT NULL)
--   C) ACL predeterminado implícito a PUBLIC    (proacl IS NULL -> acldefault)
--      No es un grant explícito ni un ACL almacenado: es el default de
--      PostgreSQL (owner + EXECUTE a PUBLIC) que aplica cuando nadie tocó el
--      ACL. Se reporta con etiqueta propia.
--   D) Privilegio EFECTIVO de anon (has_function_privilege). Se lista como
--      "effective-only" únicamente si la firma no aparece ya en A, B ni C;
--      la causa (membresía de roles u otra ruta) no se afirma, solo se reporta.
--
-- Cobertura:
--   1) Control positivo: una función nueva creada aquí recibe EXECUTE directo
--      para anon en su ACL ALMACENADO por default privileges de Supabase
--      (demuestra que el detector mira el lugar correcto y que el entorno
--      reproduce la causa sistémica).
--   2) Control negativo: las dos firmas REP de 0026 no son alcanzables por
--      ninguna de las cuatro vías, y conservan sus grants legítimos.
--   3) Barrido: toda función SECURITY DEFINER de public debe estar libre de
--      anon por las cuatro vías. Allowlist mínima por firma exacta:
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
--    en el ACL ALMACENADO de toda función nueva.
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
  v_has_stored_acl boolean;
  v_stored_anon boolean;
  v_effective boolean;
BEGIN
  SELECT p.proacl IS NOT NULL INTO v_has_stored_acl
  FROM pg_proc p WHERE p.oid = v_oid;

  IF NOT v_has_stored_acl THEN
    RAISE EXCEPTION
      'ACL CONTRACT (control positivo): la función nueva quedó con proacl IS NULL, es decir con el ACL '
      'PREDETERMINADO de PostgreSQL y sin grant directo a anon. El entorno de CI no reproduce los '
      'default privileges de Supabase (ALTER DEFAULT PRIVILEGES ... TO anon). Revisar pg_default_acl '
      'antes de confiar en el resto del detector.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = v_oid
      AND p.proacl IS NOT NULL
      AND a.privilege_type = 'EXECUTE'
      AND a.grantee = 'anon'::regrole::oid
  ) INTO v_stored_anon;

  v_effective := has_function_privilege('anon', v_oid, 'EXECUTE');

  IF NOT v_stored_anon THEN
    RAISE EXCEPTION
      'ACL CONTRACT (control positivo): una función nueva de public NO recibió EXECUTE directo para anon '
      'en su ACL almacenado. O el entorno de CI ya no reproduce los default privileges de Supabase, o '
      'fueron revocados. Revisar pg_default_acl antes de confiar en el resto del detector.';
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
    -- A) ACL almacenado con entrada directa a anon.
    IF EXISTS (
      SELECT 1
      FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = r.oid
        AND p.proacl IS NOT NULL
        AND a.privilege_type = 'EXECUTE'
        AND a.grantee = 'anon'::regrole::oid
    ) THEN
      RAISE EXCEPTION
        'ACL CONTRACT (control negativo): % conserva en su ACL almacenado una entrada directa de EXECUTE para anon',
        r.oid::regprocedure;
    END IF;

    -- B) ACL almacenado con entrada a PUBLIC.
    IF EXISTS (
      SELECT 1
      FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = r.oid
        AND p.proacl IS NOT NULL
        AND a.privilege_type = 'EXECUTE'
        AND a.grantee = 0  -- 0 = PUBLIC
    ) THEN
      RAISE EXCEPTION
        'ACL CONTRACT (control negativo): % conserva en su ACL almacenado EXECUTE concedido a PUBLIC',
        r.oid::regprocedure;
    END IF;

    -- C) proacl IS NULL: ACL predeterminado de PostgreSQL (owner + PUBLIC).
    IF EXISTS (
      SELECT 1
      FROM pg_proc p, aclexplode(acldefault('f', p.proowner)) a
      WHERE p.oid = r.oid
        AND p.proacl IS NULL
        AND a.privilege_type = 'EXECUTE'
        AND a.grantee = 0
    ) THEN
      RAISE EXCEPTION
        'ACL CONTRACT (control negativo): % tiene proacl IS NULL, es decir el ACL PREDETERMINADO de '
        'PostgreSQL, que concede EXECUTE a PUBLIC (y por tanto a anon)',
        r.oid::regprocedure;
    END IF;

    -- D) Privilegio efectivo por cualquier otra vía.
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION
        'ACL CONTRACT (control negativo): anon tiene privilegio EFECTIVO de EXECUTE sobre % sin ACL '
        'directo a anon, ACL almacenado a PUBLIC ni ACL predeterminado; causa por determinar',
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
  v_stored_anon text[] := ARRAY[]::text[];
  v_stored_public text[] := ARRAY[]::text[];
  v_default_public text[] := ARRAY[]::text[];
  v_effective_only text[] := ARRAY[]::text[];
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
      -- A) ACL ALMACENADO con entrada directa a anon.
      (p.proacl IS NOT NULL AND EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a
        WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 'anon'::regrole::oid
      )) AS stored_anon,
      -- B) ACL ALMACENADO con entrada a PUBLIC (grant explícito).
      (p.proacl IS NOT NULL AND EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a
        WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 0
      )) AS stored_public,
      -- C) proacl IS NULL: ACL PREDETERMINADO implícito (owner + PUBLIC).
      --    No es un grant explícito ni un ACL almacenado.
      (p.proacl IS NULL AND EXISTS (
        SELECT 1 FROM aclexplode(acldefault('f', p.proowner)) a
        WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 0
      )) AS default_public,
      -- D) Privilegio efectivo.
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

    -- Categorías INDEPENDIENTES: una misma firma puede aparecer en varias.
    IF r.stored_anon THEN
      v_stored_anon := v_stored_anon || v_sig;
    END IF;

    IF r.stored_public THEN
      v_stored_public := v_stored_public || v_sig;
    END IF;

    IF r.default_public THEN
      v_default_public := v_default_public || v_sig;
    END IF;

    IF r.anon_effective
       AND NOT r.stored_anon
       AND NOT r.stored_public
       AND NOT r.default_public THEN
      v_effective_only := v_effective_only || v_sig;
    END IF;
  END LOOP;

  IF array_length(v_stored_anon, 1) IS NOT NULL
     OR array_length(v_stored_public, 1) IS NOT NULL
     OR array_length(v_default_public, 1) IS NOT NULL
     OR array_length(v_effective_only, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'ACL CONTRACT: funciones SECURITY DEFINER de public alcanzables por anon.\n'
      'A) ACL almacenado con entrada directa a anon (% firmas): %\n'
      'B) ACL almacenado con grant explícito a PUBLIC (% firmas): %\n'
      'C) proacl IS NULL: ACL PREDETERMINADO de PostgreSQL, EXECUTE a PUBLIC — no es grant explícito (% firmas): %\n'
      'D) Privilegio efectivo sin A, B ni C — causa por determinar (% firmas): %',
      coalesce(array_length(v_stored_anon, 1), 0), array_to_string(v_stored_anon, E'\n  - '),
      coalesce(array_length(v_stored_public, 1), 0), array_to_string(v_stored_public, E'\n  - '),
      coalesce(array_length(v_default_public, 1), 0), array_to_string(v_default_public, E'\n  - '),
      coalesce(array_length(v_effective_only, 1), 0), array_to_string(v_effective_only, E'\n  - ');
  END IF;
END;
$$;

ROLLBACK;
