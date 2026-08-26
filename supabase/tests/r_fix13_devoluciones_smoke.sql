-- Smoke SQL de fix-13 (devoluciones: bolsa de horas y devolución tardía):
--   N-12 complete_return_inspection calcula meses de calendario (no CEIL(días/30))
--   N-13 complete_return_inspection registra late_days / suggested_late_charge
--   psql -f supabase/tests/r_fix13_devoluciones_smoke.sql
-- Solo lecturas de catálogo: no toca datos.

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

-- N-13: columnas informativas de devolución tardía.
SELECT pg_temp.expect_true(
  'N-13 return_inspections.late_days existe',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'return_inspections'
             AND column_name = 'late_days')
);
SELECT pg_temp.expect_true(
  'N-13 return_inspections.suggested_late_charge existe',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'return_inspections'
             AND column_name = 'suggested_late_charge')
);
SELECT pg_temp.expect_true(
  'N-13 complete_return_inspection persiste el cargo sugerido por retraso',
  pg_temp.fndef('complete_return_inspection') ILIKE '%suggested_late_charge%'
);
SELECT pg_temp.expect_true(
  'N-13 el cargo tardío usa la tarifa diaria de la reserva',
  pg_temp.fndef('complete_return_inspection') ILIKE '%b.daily_rate%'
);

-- N-12: la bolsa de horas ya no usa CEIL(días/30).
SELECT pg_temp.expect_true(
  'N-12 complete_return_inspection ya no usa CEIL(dias/30)',
  pg_temp.fndef('complete_return_inspection') NOT ILIKE '%CEIL(%/ 30%'
    AND pg_temp.fndef('complete_return_inspection') NOT ILIKE '%CEIL(%/30%'
);
SELECT pg_temp.expect_true(
  'N-12 complete_return_inspection usa meses de calendario (age)',
  pg_temp.fndef('complete_return_inspection') ILIKE '%age(v_span_end, v_booking_start)%'
);
SELECT pg_temp.expect_true(
  'N-12 el remanente se prorratea sobre los días reales del mes ancla',
  pg_temp.fndef('complete_return_inspection') ILIKE '%v_rem_days::numeric / v_days_in_month%'
);

-- Guards que no deben perderse.
SELECT pg_temp.expect_true(
  'complete_return_inspection conserva el guard de roles',
  pg_temp.fndef('complete_return_inspection') ILIKE '%has_role(auth.uid(), ''admin''%'
);
SELECT pg_temp.expect_true(
  'complete_return_inspection libera la unidad sólo si sigue rented (N-38)',
  pg_temp.fndef('complete_return_inspection') ILIKE '%v_old_status = ''rented''%'
);
SELECT pg_temp.expect_true(
  'complete_return_inspection fija search_path = public',
  (SELECT bool_and(p.proconfig::text ILIKE '%search_path%')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'complete_return_inspection')
);
SELECT pg_temp.expect_true(
  'anon no puede ejecutar complete_return_inspection',
  NOT has_function_privilege(
    'anon',
    'public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz)',
    'EXECUTE')
);

ROLLBACK;
