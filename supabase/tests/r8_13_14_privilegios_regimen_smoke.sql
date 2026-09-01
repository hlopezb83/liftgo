-- Smoke SQL de R8-13 y R8-14.
--   psql -f supabase/tests/r8_13_14_privilegios_regimen_smoke.sql
-- Todo corre dentro de una transacción con ROLLBACK: no deja datos.

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

-- ---------------------------------------------------------------------------
-- R8-13: la función interna no es ejecutable por anon/authenticated; la
-- autoridad es el wrapper SECURITY DEFINER.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'anon NO puede ejecutar releasable_payment_locks',
  NOT has_function_privilege('anon', 'public.releasable_payment_locks(integer)', 'EXECUTE'));

SELECT pg_temp.expect_true(
  'authenticated NO puede ejecutar releasable_payment_locks',
  NOT has_function_privilege('authenticated', 'public.releasable_payment_locks(integer)', 'EXECUTE'));

SELECT pg_temp.expect_true(
  'authenticated SÍ puede ejecutar count_releasable_payment_locks (wrapper)',
  has_function_privilege('authenticated', 'public.count_releasable_payment_locks(integer)', 'EXECUTE'));

SELECT pg_temp.expect_true(
  'authenticated SÍ puede ejecutar release_stale_payment_locks (wrapper)',
  has_function_privilege('authenticated', 'public.release_stale_payment_locks(integer)', 'EXECUTE'));

SELECT pg_temp.expect_true(
  'anon NO puede ejecutar count_releasable_payment_locks',
  NOT has_function_privilege('anon', 'public.count_releasable_payment_locks(integer)', 'EXECUTE'));

SELECT pg_temp.expect_true(
  'ambos wrappers son SECURITY DEFINER',
  (SELECT bool_and(prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('count_releasable_payment_locks', 'release_stale_payment_locks')));

-- ---------------------------------------------------------------------------
-- R8-14: normalizador determinista de régimen fiscal.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true('normaliza etiqueta heredada 616',
  public.normalize_regimen_fiscal('616 - Sin obligaciones fiscales') = '616');
SELECT pg_temp.expect_true('normaliza espacios',
  public.normalize_regimen_fiscal('  601  ') = '601');
SELECT pg_temp.expect_true('idempotente sobre código puro',
  public.normalize_regimen_fiscal(public.normalize_regimen_fiscal('612')) = '612');
SELECT pg_temp.expect_true('código fuera de catálogo => NULL',
  public.normalize_regimen_fiscal('999 - inventado') IS NULL);
SELECT pg_temp.expect_true('valor ambiguo sin prefijo => NULL',
  public.normalize_regimen_fiscal('Sin obligaciones fiscales') IS NULL);
SELECT pg_temp.expect_true('cuatro dígitos no es prefijo válido',
  public.normalize_regimen_fiscal('6011') IS NULL);
SELECT pg_temp.expect_true('nulo/vacío => NULL',
  public.normalize_regimen_fiscal(NULL) IS NULL AND public.normalize_regimen_fiscal('') IS NULL);

-- ---------------------------------------------------------------------------
-- R8-14: la reparación toca SOLO borradores sin timbrar y deterministas.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE r8_14_probe AS
SELECT id, status, cfdi_uuid, cfdi_status, receptor_regimen_fiscal
  FROM public.invoices
 WHERE false;

-- Simula el universo con una tabla espejo (no se modifican facturas reales).
CREATE TEMP TABLE r8_14_cases (
  etiqueta text,
  status text,
  cfdi_uuid uuid,
  cfdi_status text,
  valor text,
  esperado text
);

INSERT INTO r8_14_cases VALUES
  ('borrador determinista', 'draft', NULL, NULL, '616 - Sin obligaciones fiscales', '616'),
  ('borrador ya limpio',    'draft', NULL, NULL, '601', '601'),
  ('borrador ambiguo',      'draft', NULL, NULL, 'Sin obligaciones fiscales', 'Sin obligaciones fiscales'),
  ('borrador fuera de catálogo', 'draft', NULL, NULL, '999 - inventado', '999 - inventado'),
  ('enviada (no borrador)', 'sent',  NULL, NULL, '616 - Sin obligaciones fiscales', '616 - Sin obligaciones fiscales'),
  ('cancelada',             'cancelled', NULL, NULL, '616 - Sin obligaciones fiscales', '616 - Sin obligaciones fiscales'),
  ('borrador timbrado',     'draft', gen_random_uuid(), 'stamped', '616 - Sin obligaciones fiscales', '616 - Sin obligaciones fiscales');

-- Misma condición exacta que la migración.
CREATE TEMP TABLE r8_14_result AS
SELECT etiqueta,
       esperado,
       CASE
         WHEN status = 'draft'
          AND cfdi_uuid IS NULL
          AND coalesce(cfdi_status, '') NOT IN ('stamped', 'cancelled')
          AND valor IS NOT NULL
          AND btrim(valor) <> ''
          AND public.normalize_regimen_fiscal(valor) IS NOT NULL
         THEN public.normalize_regimen_fiscal(valor)
         ELSE valor
       END AS obtenido
  FROM r8_14_cases;

SELECT pg_temp.expect_true(
  'reparación selectiva: ' || etiqueta,
  obtenido IS NOT DISTINCT FROM esperado)
FROM r8_14_result;

-- Rerunnable: no quedan candidatos vivos después de la migración.
SELECT pg_temp.expect_true(
  'sin candidatos pendientes en invoices (migración idempotente)',
  (SELECT count(*) FROM public.invoices i
    WHERE i.status = 'draft'
      AND i.cfdi_uuid IS NULL
      AND coalesce(i.cfdi_status, '') NOT IN ('stamped', 'cancelled')
      AND i.receptor_regimen_fiscal IS NOT NULL
      AND public.normalize_regimen_fiscal(i.receptor_regimen_fiscal) IS NOT NULL
      AND i.receptor_regimen_fiscal IS DISTINCT FROM
          public.normalize_regimen_fiscal(i.receptor_regimen_fiscal)) = 0);

ROLLBACK;
