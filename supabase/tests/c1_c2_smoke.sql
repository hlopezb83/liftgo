-- ============================================================================
-- Smoke tests FIX C-1 / C-2: guards de rol en RPCs SECURITY DEFINER.
-- Ejecutar con: psql -f supabase/tests/c1_c2_smoke.sql
-- ============================================================================
DO $$
DECLARE
  v_oid_cri oid;
  v_oid_cfs oid;
BEGIN
  SELECT p.oid INTO v_oid_cri
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_recurring_invoice';

  SELECT p.oid INTO v_oid_cfs
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'change_forklift_status';

  IF v_oid_cri IS NULL OR v_oid_cfs IS NULL THEN
    RAISE EXCEPTION 'C1/C2: alguna función no existe';
  END IF;

  -- 1) anon no puede ejecutar ninguna de las dos
  IF has_function_privilege('anon', v_oid_cri, 'EXECUTE') THEN
    RAISE EXCEPTION 'C-1: anon aún puede ejecutar create_recurring_invoice';
  END IF;
  IF has_function_privilege('anon', v_oid_cfs, 'EXECUTE') THEN
    RAISE EXCEPTION 'C-2: anon aún puede ejecutar change_forklift_status';
  END IF;

  -- 2) authenticated y service_role conservan EXECUTE (la app sigue operando)
  IF NOT has_function_privilege('authenticated', v_oid_cri, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_oid_cri, 'EXECUTE') THEN
    RAISE EXCEPTION 'C-1: se perdió el EXECUTE legítimo';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid_cfs, 'EXECUTE') THEN
    RAISE EXCEPTION 'C-2: se perdió el EXECUTE legítimo';
  END IF;

  -- 3) el guard de rol está presente en el cuerpo
  IF pg_get_functiondef(v_oid_cri) NOT ILIKE '%not authorized%'
     OR pg_get_functiondef(v_oid_cri) NOT ILIKE '%administrativo%' THEN
    RAISE EXCEPTION 'C-1: falta el guard de rol';
  END IF;
  IF pg_get_functiondef(v_oid_cfs) NOT ILIKE '%not authorized%'
     OR pg_get_functiondef(v_oid_cfs) NOT ILIKE '%mechanic%' THEN
    RAISE EXCEPTION 'C-2: falta el guard de rol';
  END IF;

  -- 4) C-1 mantiene el bypass de service_role (cron de facturación recurrente)
  IF pg_get_functiondef(v_oid_cri) NOT ILIKE '%service_role%' THEN
    RAISE EXCEPTION 'C-1: se perdió el bypass de service_role';
  END IF;

  -- 5) C-2 conserva su lógica de negocio original
  IF pg_get_functiondef(v_oid_cfs) NOT ILIKE '%renta activa%'
     OR pg_get_functiondef(v_oid_cfs) NOT ILIKE '%app.forklift_rpc%' THEN
    RAISE EXCEPTION 'C-2: se alteró la lógica de negocio original';
  END IF;

  RAISE NOTICE 'C1/C2 smoke: OK';
END $$;
