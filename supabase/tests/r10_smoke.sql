-- Smoke SQL de la Ronda 10 (permisos de expiracion + zona horaria de reservas).
-- Ejecutar manualmente contra staging:
--   psql -f supabase/tests/r10_smoke.sql
-- Solo lecturas: no modifica datos.

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

-- 1) R10-DB-01: authenticated ya NO puede ejecutar expire_stale_quotes.
SELECT pg_temp.expect_true(
  'R10-DB-01 authenticated sin EXECUTE en expire_stale_quotes',
  NOT has_function_privilege('authenticated', 'public.expire_stale_quotes()', 'EXECUTE')
);

SELECT pg_temp.expect_true(
  'R10-DB-01 anon sin EXECUTE en expire_stale_quotes',
  NOT has_function_privilege('anon', 'public.expire_stale_quotes()', 'EXECUTE')
);

-- 2) El cron/edge (service_role) sigue pudiendo ejecutarla.
SELECT pg_temp.expect_true(
  'R10-DB-01 service_role conserva EXECUTE',
  has_function_privilege('service_role', 'public.expire_stale_quotes()', 'EXECUTE')
);

-- 3) Guard interno presente en el cuerpo de la funcion.
SELECT pg_temp.expect_true(
  'R10-DB-01 guard interno por auth.role()',
  (SELECT prosrc FROM pg_proc WHERE proname = 'expire_stale_quotes') ILIKE '%service_role%'
);

-- 4) R10-DB-02: la apertura de reserva usa today_mty() (no CURRENT_DATE).
--    La auditoria lo atribuyo a start_repair_work_order, pero la expresion
--    v_starts_today vive en create_booking y ya migro en R9-DB-01.
SELECT pg_temp.expect_true(
  'R10-DB-02 create_booking usa today_mty() en v_starts_today',
  (SELECT prosrc FROM pg_proc WHERE proname = 'create_booking') ILIKE '%v_starts_today := p_start_date <= public.today_mty()%'
);

SELECT pg_temp.expect_true(
  'R10-DB-02 start_repair_work_order sin CURRENT_DATE',
  (SELECT prosrc FROM pg_proc WHERE proname = 'start_repair_work_order') !~* 'current_date'
);

ROLLBACK;
