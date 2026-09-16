-- Multiempresa · Tramo 8.1: el asignador de folio REP debe estar acotado a la
-- organización del propio pago.
--
-- IMPORTANTE: la migración que endurece `public.assign_stamped_rep_number`
-- (docs/multiempresa/sql/0026_rep_number_org_scoped_assignment.sql) todavía NO
-- está aprobada ni aplicada. Mientras la firma de tres parámetros no exista,
-- esta prueba emite un NOTICE explícito y no valida nada (no puede pasar por
-- error): en cuanto la migración se aplique, las aserciones entran en vigor
-- automáticamente y fallan si el scope por organización desaparece.
BEGIN;

DO $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'assign_stamped_rep_number'
    AND p.pronargs = 3;

  IF v_oid IS NULL THEN
    RAISE NOTICE
      'REP FOLIO ORG: pendiente — la migración 0026 (firma de 3 parámetros) no está aplicada; aserciones omitidas';
    RETURN;
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- SECURITY DEFINER con search_path fijo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid = v_oid AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la función debe ser SECURITY DEFINER';
  END IF;

  IF v_def !~ 'search_path' THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la función debe fijar search_path';
  END IF;

  -- El UPDATE debe acotarse a la organización leída del propio pago.
  IF v_def !~ 'organization_id\s*=\s*v_payment_org' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el UPDATE debe filtrar por la organización del pago';
  END IF;

  -- El parámetro de organización sólo valida; nunca decide la fila.
  IF v_def !~ 'p_organization_id' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la función debe contrastar p_organization_id contra el pago';
  END IF;

  -- Un pago sin organización no puede folearse (fail-closed).
  IF v_def !~ 'v_payment_org IS NULL' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: un pago sin organización debe rechazarse explícitamente';
  END IF;

  -- El índice global se conserva en este tramo (el Lote 2 no está aplicado).
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
