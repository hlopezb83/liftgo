-- Multiempresa · paso 3: contrato de catálogo de las RPC/helpers endurecidos
-- por la migración Drizzle 0039.
--
-- Comprueba, sin escribir datos:
--   1) Las seis funciones operativas son SECURITY INVOKER.
--   2) Los helpers que participan en policies siguen SECURITY DEFINER y
--      contienen una guarda organizacional reconocida.
--   3) get_feedback_leaderboard sigue DEFINER pero filtra por organización.
--   4) Ninguna de las once es alcanzable por PUBLIC ni por anon; authenticated
--      y service_role conservan EXECUTE.
BEGIN;

-- ── 1. Modo de seguridad ─────────────────────────────────────────────
DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_mal text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.assert_invoice_cancellable(uuid)',
    'public.audit_fleet_status_consistency()',
    'public.damage_restore_forklift_status(uuid, text)',
    'public.get_my_feedback_points_total()',
    'public.has_active_rental(uuid)',
    'public.has_open_rental(uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'RPC 0039: falta la función %', v_sig;
    END IF;
    v_oid := to_regprocedure(v_sig)::oid;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      v_mal := v_mal || v_sig;
    END IF;
  END LOOP;

  IF array_length(v_mal, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0039: deben ser SECURITY INVOKER y siguen definer:\n%',
      array_to_string(v_mal, E'\n');
  END IF;
END;
$$;

-- ── 2. Helpers DEFINER con guarda organizacional ─────────────────────
DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_def text;
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_customer_id_for_user(uuid)',
    'public.current_portal_customer_id()',
    'public.is_internal_member(uuid)',
    'public.get_feedback_leaderboard(text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'RPC 0039: falta la función %', v_sig;
    END IF;
    v_oid := to_regprocedure(v_sig)::oid;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      v_fallas := v_fallas || (v_sig || ': debe seguir SECURITY DEFINER');
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);

    IF v_def !~ 'current_organization_id|current_internal_organization_id' THEN
      v_fallas := v_fallas || (v_sig || ': sin guarda de organización');
    END IF;

    IF v_def !~ 'auth\.uid\(\)' THEN
      v_fallas := v_fallas || (v_sig || ': no valida el usuario autenticado');
    END IF;

    IF v_def ~* 'limit\s+1\b' THEN
      v_fallas := v_fallas || (v_sig || ': conserva un LIMIT 1 arbitrario');
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0039: helpers DEFINER sin endurecer:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;

-- ── 3. ACL: sin PUBLIC ni anon; authenticated y service_role con EXECUTE
DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_anon text[] := '{}';
  v_publico text[] := '{}';
  v_sin_auth text[] := '{}';
  v_sin_srv text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.assert_invoice_cancellable(uuid)',
    'public.audit_fleet_status_consistency()',
    'public.damage_restore_forklift_status(uuid, text)',
    'public.get_my_feedback_points_total()',
    'public.has_active_rental(uuid)',
    'public.has_open_rental(uuid)',
    'public.get_feedback_leaderboard(text)',
    'public.get_customer_id_for_user(uuid)',
    'public.current_portal_customer_id()',
    'public.is_internal_member(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig)::oid;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_anon := v_anon || v_sig;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = v_oid
        AND a.grantee = 0
        AND a.privilege_type = 'EXECUTE'
    ) THEN
      v_publico := v_publico || v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      v_sin_auth := v_sin_auth || v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      v_sin_srv := v_sin_srv || v_sig;
    END IF;
  END LOOP;

  IF array_length(v_anon, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0039: alcanzables por anon:\n%', array_to_string(v_anon, E'\n');
  END IF;
  IF array_length(v_publico, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0039: alcanzables por PUBLIC:\n%', array_to_string(v_publico, E'\n');
  END IF;
  IF array_length(v_sin_auth, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0039: authenticated perdió EXECUTE:\n%', array_to_string(v_sin_auth, E'\n');
  END IF;
  IF array_length(v_sin_srv, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0039: service_role perdió EXECUTE:\n%', array_to_string(v_sin_srv, E'\n');
  END IF;

  RAISE NOTICE 'OK: modo de seguridad y ACL de las RPC/helpers 0039';
END;
$$;

ROLLBACK;
