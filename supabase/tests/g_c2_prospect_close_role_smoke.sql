-- Smoke SQL de la Ronda G:
--   G-C2 el guard "solo admin/administrativo cierra como Ganado" vive ahora en
--        public.validate_prospect_close(), no solo en el cliente.
--   psql -f supabase/tests/g_c2_prospect_close_role_smoke.sql
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
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name;
$$;

SELECT pg_temp.expect_true(
  'G-C2 validate_prospect_close exige rol admin/administrativo',
  pg_temp.fndef('validate_prospect_close') ILIKE '%has_role%admin%'
  AND pg_temp.fndef('validate_prospect_close') ILIKE '%administrativo%'
);

SELECT pg_temp.expect_true(
  'G-C2 el guard usa (select auth.uid())',
  pg_temp.fndef('validate_prospect_close') ILIKE '%select auth.uid()%'
);

SELECT pg_temp.expect_true(
  'G-C2 el guard respeta el sembrado E2E',
  pg_temp.fndef('validate_prospect_close') ILIKE '%app.e2e_seed%'
);

SELECT pg_temp.expect_true(
  'G-C2 validate_prospect_close conserva SET search_path = public',
  pg_temp.fndef('validate_prospect_close') ILIKE '%search_path%public%'
);

SELECT pg_temp.expect_true(
  'G-C2 sigue vigente el trigger prospects_validate_close',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'prospects' AND t.tgname = 'prospects_validate_close'
  )
);

ROLLBACK;
