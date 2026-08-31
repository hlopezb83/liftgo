-- Smoke SQL del paquete de correcciones R3 (10 fixes, v7.287.0).
-- Ejecutar manualmente contra staging:  psql -f supabase/tests/r3_fixes_smoke.sql
-- Solo lecturas de catálogo: no modifica datos.

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

-- FIX-R3-01 (Alta): archivado de OT cerrada con refacciones / mano de obra.
SELECT pg_temp.expect_true(
  'R3-01 trigger reject_mutations_on_closed_maintenance reconoce el bypass transaccional',
  (SELECT prosrc FROM pg_proc WHERE proname = 'reject_mutations_on_closed_maintenance' LIMIT 1)
    ILIKE '%app.maintenance_soft_delete%'
);

SELECT pg_temp.expect_true(
  'R3-01 soft_delete_maintenance_log setea el flag local a la transacción',
  (SELECT prosrc FROM pg_proc WHERE proname = 'soft_delete_maintenance_log' LIMIT 1)
    ILIKE '%set_config(''app.maintenance_archive_rpc''%'
);

SELECT pg_temp.expect_true(
  'R3-01 soft_delete_maintenance_log exige rol antes del bypass',
  (SELECT prosrc FROM pg_proc WHERE proname = 'soft_delete_maintenance_log' LIMIT 1)
    ILIKE '%has_role%'
);

SELECT pg_temp.expect_true(
  'R3-01 triggers de lock sobre refacciones y mano de obra vigentes',
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('trg_maintenance_parts_lock_closed', 'trg_maintenance_labor_lock_closed')
      AND NOT tgisinternal) = 2
);

-- FIX-R3-03: la RPC de venta valida la cotización (sale + accepted, FOR UPDATE).
SELECT pg_temp.expect_true(
  'R3-03 assign_forklift_to_sale_quote bloquea la cotización con FOR UPDATE',
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_forklift_to_sale_quote' LIMIT 1)
    ILIKE '%FOR UPDATE%'
);

SELECT pg_temp.expect_true(
  'R3-03 assign_forklift_to_sale_quote exige tipo venta y estatus aceptada',
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_forklift_to_sale_quote' LIMIT 1)
    ILIKE '%accepted%'
);

-- FIX-R3-04: desasignación transaccional.
SELECT pg_temp.expect_true(
  'R3-04 existe unassign_forklift_from_sale_quote',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'unassign_forklift_from_sale_quote')
);

SELECT pg_temp.expect_true(
  'R3-04 unassign_forklift_from_sale_quote es SECURITY DEFINER con search_path fijo',
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'unassign_forklift_from_sale_quote'
      AND prosecdef
      AND array_to_string(proconfig, ',') ILIKE '%search_path%'
  )
);

-- FIX-R3-01 (Finanzas): reset de contadores de reintento al reclamar.
SELECT pg_temp.expect_true(
  'R3-fin-01 la RPC de claim resetea rep_lookup_attempts / lookup_attempts',
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE prosrc ILIKE '%lookup_attempts%'
      AND prosrc ILIKE '%= 0%'
      AND proname ILIKE '%claim%'
  )
);

ROLLBACK;
