-- Multiempresa · Tramo 8.1: el asignador de folio REP debe estar acotado a la
-- organización del propio pago.
--
-- Esta prueba FALLA si la migración del tramo 8.1 no está aplicada en el
-- entorno donde corre. La migración forma parte del cambio, así que un NOTICE
-- que la convirtiera en no-op ocultaría exactamente el riesgo que se audita.
BEGIN;

DO $$
DECLARE
  v_strict oid;
  v_legacy oid;
  v_def text;
  v_legacy_def text;
BEGIN
  -- 1. Firma estricta de tres parámetros (obligatoria).
  SELECT p.oid INTO v_strict
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'assign_stamped_rep_number'
    AND p.pronargs = 3;

  IF v_strict IS NULL THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: falta assign_stamped_rep_number(uuid, text, uuid); aplicar la migración del tramo 8.1 antes de desplegar Edge Functions';
  END IF;

  v_def := pg_get_functiondef(v_strict);

  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_strict AND p.prosecdef) THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la función estricta debe ser SECURITY DEFINER';
  END IF;

  IF v_def !~ 'search_path' THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la función estricta debe fijar search_path';
  END IF;

  -- La organización se lee de payments ANTES del UPDATE y condiciona el UPDATE.
  IF v_def !~ 'FROM public\.payments' AND v_def !~ 'FROM payments' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la organización debe leerse de payments antes del UPDATE';
  END IF;

  IF v_def !~ 'organization_id\s*=\s*v_payment_org' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el UPDATE debe filtrar por la organización leída del pago';
  END IF;

  IF v_def !~ 'p_organization_id' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la función debe contrastar p_organization_id contra el pago';
  END IF;

  IF v_def !~ 'v_payment_org IS NULL' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: un pago sin organización debe rechazarse explícitamente';
  END IF;

  -- 2. Wrapper de compatibilidad de dos parámetros: si existe, no puede
  --    aceptar organización del llamante ni actualizar payments por su cuenta.
  SELECT p.oid INTO v_legacy
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'assign_stamped_rep_number'
    AND p.pronargs = 2;

  IF v_legacy IS NOT NULL THEN
    v_legacy_def := pg_get_functiondef(v_legacy);

    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_legacy AND p.prosecdef) THEN
      RAISE EXCEPTION 'REP FOLIO ORG: el wrapper debe ser SECURITY DEFINER';
    END IF;

    IF v_legacy_def !~ 'search_path' THEN
      RAISE EXCEPTION 'REP FOLIO ORG: el wrapper debe fijar search_path';
    END IF;

    IF v_legacy_def !~ 'assign_stamped_rep_number\s*\(' THEN
      RAISE EXCEPTION
        'REP FOLIO ORG: el wrapper de dos parámetros debe delegar en la función estricta';
    END IF;

    IF v_legacy_def ~* 'UPDATE\s+(public\.)?payments' THEN
      RAISE EXCEPTION
        'REP FOLIO ORG: el wrapper no debe actualizar payments por su cuenta';
    END IF;
  END IF;

  -- 3. El índice global se conserva en este tramo (el Lote 2 no se aplica).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND indexname = 'payments_rep_number_uidx'
  ) THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: payments_rep_number_uidx debe conservarse en el tramo 8.1';
  END IF;

  RAISE NOTICE 'REP FOLIO ORG: OK';
END $$;

ROLLBACK;
