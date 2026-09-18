-- R9-06: `public.normalize_regimen_fiscal(text)` es un helper puro usado solo
-- por migraciones/procesos internos. No hay ningún flujo de la app que lo
-- invoque, así que se retira el EXECUTE a PUBLIC/anon/authenticated.
-- Idempotente: REVOKE/GRANT son seguros al re-ejecutarse.
REVOKE ALL ON FUNCTION public.normalize_regimen_fiscal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_regimen_fiscal(text) FROM anon;
REVOKE ALL ON FUNCTION public.normalize_regimen_fiscal(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_regimen_fiscal(text) TO service_role;

DO $$
DECLARE
  v_auth boolean;
  v_anon boolean;
  v_service boolean;
BEGIN
  SELECT has_function_privilege('authenticated', 'public.normalize_regimen_fiscal(text)', 'EXECUTE'),
         has_function_privilege('anon', 'public.normalize_regimen_fiscal(text)', 'EXECUTE'),
         has_function_privilege('service_role', 'public.normalize_regimen_fiscal(text)', 'EXECUTE')
    INTO v_auth, v_anon, v_service;

  IF v_auth OR v_anon THEN
    RAISE EXCEPTION 'R9-06: normalize_regimen_fiscal sigue ejecutable por anon/authenticated';
  END IF;
  IF NOT v_service THEN
    RAISE EXCEPTION 'R9-06: service_role perdió EXECUTE sobre normalize_regimen_fiscal';
  END IF;
END $$;