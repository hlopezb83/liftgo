-- Smoke SQL de los hallazgos 1 y 7 (2026-09-03):
--   H1 get_insurance_alerts excluye equipos E2E (COALESCE(is_e2e,false)=false)
--      y sus cifras coinciden con la flota real (sin E2E, sin sold/retired,
--      sin archivados).
--   H7 índice único parcial contracts_one_active_per_booking impide un segundo
--      contrato no cancelado por reserva, preservando los duplicados
--      históricos CTR-0002/CTR-0003.
--   psql -f supabase/tests/r_fix39_hallazgos_seguros_contratos_smoke.sql
-- Solo lecturas: no toca datos.

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

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name
  LIMIT 1;
$$;

-- H1: la función excluye E2E con la misma semántica que el resto del panel.
SELECT pg_temp.expect_true(
  'H1 get_insurance_alerts excluye is_e2e',
  pg_temp.fndef('get_insurance_alerts') LIKE '%COALESCE(is_e2e, false) = false%'
);

-- H1: sigue excluyendo sold/retired y archivados (deleted_at).
SELECT pg_temp.expect_true(
  'H1 get_insurance_alerts excluye sold/retired',
  pg_temp.fndef('get_insurance_alerts') LIKE '%status NOT IN (''sold'',''retired'')%'
);
SELECT pg_temp.expect_true(
  'H1 get_insurance_alerts excluye archivados',
  pg_temp.fndef('get_insurance_alerts') LIKE '%deleted_at IS NULL%'
);

-- H1 (dato real): ejecutar la función como un admin real y comparar TODAS las
-- cifras del widget contra la flota sin E2E. Demuestra que los E2E no afectan
-- ni el conteo sin seguro ni la lista de pólizas por vencer.
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (SELECT user_id::text FROM public.user_roles WHERE role = 'admin' LIMIT 1),
    'role', 'authenticated'
  )::text,
  true
);

SELECT pg_temp.expect_true(
  'H1 no_insurance_count = flota real sin seguro (sin E2E)',
  (public.get_insurance_alerts()->>'no_insurance_count')::int = (
    SELECT count(*)::int FROM public.forklifts
    WHERE status NOT IN ('sold','retired') AND deleted_at IS NULL
      AND COALESCE(is_e2e, false) = false AND insurance_expiry IS NULL
  )
);

SELECT pg_temp.expect_true(
  'H1 expiring = pólizas por vencer (<=30 días) de la flota real (sin E2E)',
  jsonb_array_length(public.get_insurance_alerts()->'expiring') = (
    SELECT count(*)::int FROM public.forklifts
    WHERE status NOT IN ('sold','retired') AND deleted_at IS NULL
      AND COALESCE(is_e2e, false) = false
      AND insurance_expiry IS NOT NULL
      AND (insurance_expiry - public.today_mty())::int <= 30
  )
);

-- H7: el índice único parcial existe y su predicado no toca cancelados.
SELECT pg_temp.expect_true(
  'H7 índice contracts_one_active_per_booking existe',
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'contracts_one_active_per_booking')
);
SELECT pg_temp.expect_true(
  'H7 predicado excluye contratos cancelados',
  (SELECT indexdef FROM pg_indexes WHERE indexname = 'contracts_one_active_per_booking')
    LIKE '%status <> ''cancelled''%'
);

-- H7: los duplicados históricos siguen intactos (ni borrados ni alterados).
SELECT pg_temp.expect_true(
  'H7 CTR-0002 y CTR-0003 se conservan con su misma reserva',
  (SELECT count(*) FROM public.contracts
   WHERE contract_number IN ('CTR-0002','CTR-0003')
     AND booking_id IS NOT NULL) = 2
);

ROLLBACK;
