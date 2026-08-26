-- Smoke SQL de fix-17 / fix-18:
--   N-18 revert_audit_log verifica cambios posteriores antes de revertir
--   N-31 trigger que desvincula user_id al archivar y policy sin archivados
--   N-36 extend_booking filtra mantenimientos archivados / sin trabajo real
--   N-40 monotonía de horómetro en deliveries (trigger)
--   N-45 has_role exige perfil activo (is_active_user)
--   psql -f supabase/tests/r_fix17_18_smoke.sql
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

-- N-18
SELECT pg_temp.expect_true(
  'N-18 revert_audit_log compara el estado actual antes de revertir',
  pg_temp.fndef('revert_audit_log') LIKE '%to_jsonb(t)%'
);
SELECT pg_temp.expect_true(
  'N-18 revert_audit_log usa updated_at como bloqueo optimista',
  pg_temp.fndef('revert_audit_log') LIKE '%updated_at%'
);

-- N-31
SELECT pg_temp.expect_true(
  'N-31 trigger trg_customer_archive_unlink_user existe en customers',
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgrelid = 'public.customers'::regclass
             AND NOT tgisinternal
             AND tgname = 'trg_customer_archive_unlink_user')
);
SELECT pg_temp.expect_true(
  'N-31 policy "Customers read own record" excluye archivados',
  EXISTS (SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'customers'
             AND policyname = 'Customers read own record'
             AND qual LIKE '%deleted_at IS NULL%')
);
SELECT pg_temp.expect_true(
  'N-31 la función del trigger no es ejecutable por anon',
  NOT has_function_privilege('anon', 'public.trg_customer_archive_unlink_user()', 'execute')
);

-- N-36
SELECT pg_temp.expect_true(
  'N-36 extend_booking ignora mantenimientos archivados',
  pg_temp.fndef('extend_booking') LIKE '%ml.deleted_at IS NULL%'
);
SELECT pg_temp.expect_true(
  'N-36 extend_booking ignora work_status scheduled/cancelled',
  pg_temp.fndef('extend_booking') LIKE '%work_status NOT IN%'
);

-- N-40
SELECT pg_temp.expect_true(
  'N-40 trigger de monotonía de horómetro existe en deliveries',
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgrelid = 'public.deliveries'::regclass
             AND NOT tgisinternal
             AND tgname = 'trg_deliveries_hours_reading_monotonic')
);

-- N-45
SELECT pg_temp.expect_true(
  'N-45 is_active_user existe y es SECURITY DEFINER',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'is_active_user' AND p.prosecdef)
);
SELECT pg_temp.expect_true(
  'N-45 has_role exige perfil activo',
  pg_temp.fndef('has_role') LIKE '%is_active_user%'
);
SELECT pg_temp.expect_true(
  'N-45 usuario sin fila en profiles no se bloquea (fallback COALESCE true)',
  pg_temp.fndef('is_active_user') LIKE '%COALESCE%true%'
);
SELECT pg_temp.expect_true(
  'N-45 is_active_user no es ejecutable por anon',
  NOT has_function_privilege('anon', 'public.is_active_user(uuid)', 'execute')
);

ROLLBACK;
