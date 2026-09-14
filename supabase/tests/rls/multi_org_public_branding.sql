-- Multi-organización · Fase 6.4: marca pública neutral de LiftGo.
BEGIN;

DO $$
DECLARE
  v_definition text;
  v_logo text;
  v_name text;
BEGIN
  SELECT pg_get_functiondef('public.get_public_branding()'::regprocedure)
  INTO v_definition;

  IF v_definition ILIKE '%company_settings%' THEN
    RAISE EXCEPTION
      'PUBLIC BRAND: get_public_branding no debe leer una S.A. territorial';
  END IF;

  SELECT logo_url, razon_social
    INTO v_logo, v_name
  FROM public.get_public_branding();

  IF v_logo IS NOT NULL OR v_name <> 'LiftGo' THEN
    RAISE EXCEPTION
      'PUBLIC BRAND: se esperaba LiftGo sin logo territorial, se obtuvo logo=% nombre=%',
      v_logo, v_name;
  END IF;
END;
$$;

ROLLBACK;
