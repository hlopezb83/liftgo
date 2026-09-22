-- Multiempresa · paso 7: contrato de catálogo de las cinco RPC SECURITY DEFINER
-- de lecturas de cliente, ranking de reportes, vínculo por RFC y folio REP
-- (migración Drizzle 0044).
--
-- Comprueba, sin escribir datos:
--   1) Las cinco firmas exactas existen y siguen SECURITY DEFINER.
--   2) search_path fijo y seguro ('public').
--   3) El tipo de sesión se resuelve por membresía/cuenta real
--      (current_internal_organization_id / is_internal_member y, en las
--      lecturas de cliente y el ranking, current_portal_customer_id).
--   4) anon y PUBLIC sin EXECUTE; authenticated y service_role con EXECUTE.
BEGIN;

DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_def text;
  v_cfg text[];
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_customer_profitability(uuid)',
    'public.get_customer_summary(uuid)',
    'public.get_feedback_leaderboard(text)',
    'public.link_customer_to_organization_by_rfc(text,text,text,text,text)',
    'public.assign_stamped_rep_number(uuid,text,uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_fallas := array_append(v_fallas, format('falta la función %s', v_sig));
      CONTINUE;
    END IF;
    v_oid := to_regprocedure(v_sig)::oid;

    SELECT p.proconfig, pg_get_functiondef(p.oid)
      INTO v_cfg, v_def
      FROM pg_proc p WHERE p.oid = v_oid;

    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) THEN
      v_fallas := array_append(v_fallas, format('%s no es SECURITY DEFINER', v_sig));
    END IF;

    IF v_cfg IS NULL OR position('search_path=public' in array_to_string(v_cfg, ',')) = 0 THEN
      v_fallas := array_append(v_fallas, format('%s sin search_path=public fijo', v_sig));
    END IF;

    IF position('current_internal_organization_id' in v_def) = 0 THEN
      v_fallas := array_append(v_fallas, format('%s no usa current_internal_organization_id', v_sig));
    END IF;

    IF position('is_internal_member' in v_def) = 0 THEN
      v_fallas := array_append(v_fallas, format('%s no usa is_internal_member', v_sig));
    END IF;

    IF position('current_portal_customer_id' in v_def) = 0 THEN
      v_fallas := array_append(v_fallas,
        format('%s no resuelve el canal portal con current_portal_customer_id', v_sig));
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, format('%s ejecutable por anon', v_sig));
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc p
                WHERE p.oid = v_oid
                  AND array_to_string(p.proacl, ',') ~ '(^|,)=X') THEN
      v_fallas := array_append(v_fallas, format('%s ejecutable por PUBLIC', v_sig));
    END IF;

    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, format('%s sin EXECUTE para authenticated', v_sig));
    END IF;

    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, format('%s sin EXECUTE para service_role', v_sig));
    END IF;
  END LOOP;

  -- El ranking ya no puede decidir el canal por rol global.
  SELECT pg_get_functiondef(to_regprocedure('public.get_feedback_leaderboard(text)')::oid)
    INTO v_def;
  IF position('has_role' in v_def) > 0 THEN
    v_fallas := array_append(v_fallas, 'get_feedback_leaderboard sigue decidiendo el canal por rol global');
  END IF;
  IF position('current_organization_id()' in v_def) > 0 THEN
    v_fallas := array_append(v_fallas, 'get_feedback_leaderboard sigue usando current_organization_id()');
  END IF;

  -- El vínculo por RFC es exclusivamente interno.
  SELECT pg_get_functiondef(
    to_regprocedure('public.link_customer_to_organization_by_rfc(text,text,text,text,text)')::oid)
    INTO v_def;
  IF position('current_organization_id()' in v_def) > 0 THEN
    v_fallas := array_append(v_fallas, 'link_customer_to_organization_by_rfc sigue usando current_organization_id()');
  END IF;

  -- El folio REP compara contra la organización interna verificada.
  SELECT pg_get_functiondef(
    to_regprocedure('public.assign_stamped_rep_number(uuid,text,uuid)')::oid)
    INTO v_def;
  IF position('current_organization_id()' in v_def) > 0 THEN
    v_fallas := array_append(v_fallas, 'assign_stamped_rep_number sigue usando current_organization_id()');
  END IF;

  -- El wrapper de dos argumentos conserva su canal interno.
  IF to_regprocedure('public.assign_stamped_rep_number(uuid,text)') IS NULL THEN
    v_fallas := array_append(v_fallas, 'falta el wrapper assign_stamped_rep_number(uuid,text)');
  ELSIF has_function_privilege('anon',
          to_regprocedure('public.assign_stamped_rep_number(uuid,text)')::oid, 'EXECUTE') THEN
    v_fallas := array_append(v_fallas, 'el wrapper assign_stamped_rep_number(uuid,text) es ejecutable por anon');
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'CONTRATO 0044 FALLA: %', array_to_string(v_fallas, ' | ');
  END IF;

  RAISE NOTICE 'CONTRATO 0044 OK';
END;
$$;

ROLLBACK;
