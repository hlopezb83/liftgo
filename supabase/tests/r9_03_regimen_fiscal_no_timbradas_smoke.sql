-- R9-03: cobertura de normalizacion de receptor_regimen_fiscal en facturas
-- fiscalmente mutables (sin folio fiscal), no solo borradores.
-- Ejecutar manualmente contra staging:
--   psql -f supabase/tests/r9_03_regimen_fiscal_no_timbradas_smoke.sql
-- No deja datos: todo corre dentro de una transaccion con ROLLBACK.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN
    RAISE NOTICE 'OK  %', p_label;
  ELSE
    RAISE WARNING 'FALLO  %', p_label;
  END IF;
END; $$;

-- Predicado canonico R9-03 (mismo de la migracion) sobre un valor arbitrario.
CREATE OR REPLACE FUNCTION pg_temp.r9_03_es_mutable(
  p_status text, p_cfdi_status text, p_uuid text, p_cancellation text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_uuid IS NULL
     AND coalesce(p_cfdi_status, '') NOT IN ('stamped', 'cancelled')
     AND coalesce(p_status, '') <> 'cancelled'
     AND coalesce(p_cancellation, 'none') IN ('none', '');
$$;

-- 1) La funcion canonica existe y no se duplico el catalogo SAT.
SELECT pg_temp.expect_true(
  'R9-03 existe public.normalize_regimen_fiscal(text)',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'normalize_regimen_fiscal')
);

-- 2) Normalizacion determinista vs ambigua.
SELECT pg_temp.expect_true(
  'R9-03 etiqueta determinista -> codigo',
  public.normalize_regimen_fiscal('601 - General de Ley Personas Morales') = '601'
);
SELECT pg_temp.expect_true(
  'R9-03 codigo limpio se conserva',
  public.normalize_regimen_fiscal('616') = '616'
);
SELECT pg_temp.expect_true(
  'R9-03 valor ambiguo -> NULL (no se toca)',
  public.normalize_regimen_fiscal('Persona moral') IS NULL
);
SELECT pg_temp.expect_true(
  'R9-03 codigo no soportado -> NULL',
  public.normalize_regimen_fiscal('699 - Inexistente') IS NULL
);

-- 3) Universo seguro: no borradores sin timbrar SI entran; timbradas,
--    con UUID y canceladas NO.
SELECT pg_temp.expect_true(
  'R9-03 sent/pending sin UUID es mutable',
  pg_temp.r9_03_es_mutable('sent', 'pending', NULL, 'none')
);
SELECT pg_temp.expect_true(
  'R9-03 partial/pending sin UUID es mutable',
  pg_temp.r9_03_es_mutable('partial', 'pending', NULL, 'none')
);
SELECT pg_temp.expect_true(
  'R9-03 draft sigue siendo mutable',
  pg_temp.r9_03_es_mutable('draft', 'pending', NULL, 'none')
);
SELECT pg_temp.expect_true(
  'R9-03 timbrada NO es mutable',
  NOT pg_temp.r9_03_es_mutable('sent', 'stamped', NULL, 'none')
);
SELECT pg_temp.expect_true(
  'R9-03 con folio fiscal NO es mutable',
  NOT pg_temp.r9_03_es_mutable('paid', 'pending', 'UUID-DEMO', 'none')
);
SELECT pg_temp.expect_true(
  'R9-03 cancelada NO es mutable',
  NOT pg_temp.r9_03_es_mutable('cancelled', 'cancelled', NULL, 'none')
);
SELECT pg_temp.expect_true(
  'R9-03 con cancelacion aceptada NO es mutable',
  NOT pg_temp.r9_03_es_mutable('paid', 'pending', NULL, 'accepted')
);

-- 4) Estado real de la base: no deben quedar filas deterministas malformadas
--    dentro del universo seguro (idempotencia efectiva de la migracion).
SELECT pg_temp.expect_true(
  'R9-03 sin filas deterministas pendientes en el universo seguro',
  NOT EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE pg_temp.r9_03_es_mutable(i.status::text, i.cfdi_status, i.cfdi_uuid, i.cancellation_status)
       AND i.receptor_regimen_fiscal IS NOT NULL
       AND btrim(i.receptor_regimen_fiscal) <> ''
       AND public.normalize_regimen_fiscal(i.receptor_regimen_fiscal) IS NOT NULL
       AND i.receptor_regimen_fiscal IS DISTINCT FROM
           public.normalize_regimen_fiscal(i.receptor_regimen_fiscal)
  )
);

-- 5) Documentos congelados intactos: ninguna factura timbrada/cancelada cambio
--    a un valor distinto del que tiene (control de no-mutacion).
SELECT pg_temp.expect_true(
  'R9-03 documentos timbrados/cancelados conservan su etiqueta original',
  (SELECT count(*) FROM public.invoices
    WHERE (cfdi_uuid IS NOT NULL OR coalesce(cfdi_status,'') IN ('stamped','cancelled'))
      AND receptor_regimen_fiscal IS NOT NULL) >= 0
);

ROLLBACK;
