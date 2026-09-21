-- Multiempresa · paso 2: contrato de las utilidades E2E (migración 0038).
--
-- Detecta, sin cambiar nada:
--   1) `e2e_purge_all()` no puede volver a existir (borrado global sin guarda).
--   2) Toda función E2E ejecutable por `authenticated` debe contener una
--      guarda organizacional reconocida en su definición.
--   3) Ninguna función E2E es alcanzable por `anon` ni por PUBLIC.
--   4) Las firmas que usan los fixtures siguen existiendo.
BEGIN;

-- ── 1. e2e_purge_all no debe reintroducirse ──────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.e2e_purge_all()') IS NOT NULL THEN
    RAISE EXCEPTION
      'E2E CONTRATO 0038: e2e_purge_all() volvió a existir; borra datos E2E de TODAS las empresas';
  END IF;
END;
$$;

-- ── 2. Firmas requeridas por los fixtures de Playwright ──────────────
DO $$
DECLARE
  v_firma text;
  v_faltan text[] := '{}';
BEGIN
  FOREACH v_firma IN ARRAY ARRAY[
    'public.e2e_require_admin_organization(text)',
    'public.e2e_seed_scenario(text)',
    'public.e2e_seed_portal_scenario(text, text)',
    'public.e2e_teardown(text)',
    'public.purge_e2e_data()',
    'public.purge_e2e_audit_logs()'
  ] LOOP
    IF to_regprocedure(v_firma) IS NULL THEN
      v_faltan := v_faltan || v_firma;
    END IF;
  END LOOP;

  IF array_length(v_faltan, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'E2E CONTRATO 0038: faltan firmas esperadas:\n%',
      array_to_string(v_faltan, E'\n');
  END IF;
END;
$$;

-- ── 3. Guarda organizacional y ACL ───────────────────────────────────
DO $$
DECLARE
  r record;
  v_sin_guarda text[] := '{}';
  v_anon text[] := '{}';
  v_sig text;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname || '(' || coalesce((
        SELECT string_agg(format_type(t, NULL), ', ' ORDER BY ord)
        FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, ord)
      ), '') || ')' AS signature,
      pg_get_functiondef(p.oid) AS def,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proname LIKE 'e2e\_%' OR p.proname LIKE 'purge\_e2e\_%')
    ORDER BY 2
  LOOP
    v_sig := r.signature;

    IF r.anon_exec THEN
      v_anon := v_anon || v_sig;
    END IF;

    -- La guarda se acepta por dos vías: la guarda dedicada de 0038 o el
    -- resolutor de contexto interno único.
    IF r.auth_exec
       AND r.def !~ 'e2e_require_admin_organization'
       AND r.def !~ 'current_internal_organization_id' THEN
      v_sin_guarda := v_sin_guarda || v_sig;
    END IF;
  END LOOP;

  IF array_length(v_anon, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'E2E CONTRATO 0038: funciones E2E alcanzables por anon:\n%',
      array_to_string(v_anon, E'\n');
  END IF;

  IF array_length(v_sin_guarda, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      E'E2E CONTRATO 0038: funciones E2E ejecutables por authenticated sin guarda organizacional:\n%',
      array_to_string(v_sin_guarda, E'\n');
  END IF;

  RAISE NOTICE 'OK: el bloque E2E conserva guarda organizacional y ACL cerrada';
END;
$$;

ROLLBACK;
