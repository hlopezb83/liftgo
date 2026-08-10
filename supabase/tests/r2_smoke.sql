-- Smoke SQL de la ronda R2 (26 correcciones).
-- Ejecutar manualmente contra staging:  psql -f supabase/tests/r2_smoke.sql
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

-- 02-FIX-R2-11: reprogramar pickup residual con reserva completed.
SELECT pg_temp.expect_true(
  'R2-11 validate_delivery_booking_integrity exime pickup con reserva completed',
  (SELECT prosrc FROM pg_proc WHERE proname = 'validate_delivery_booking_integrity') ILIKE '%FIX-R2-11%'
);

SELECT pg_temp.expect_true(
  'R2-11 trigger trg_delivery_booking_integrity vigente',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_delivery_booking_integrity' AND NOT tgisinternal)
);

-- 02-FIX-R2-01/03: disponibilidad y create_booking ignoran OT archivadas.
SELECT pg_temp.expect_true(
  'R2-01 get_available_forklifts filtra deleted_at',
  (SELECT prosrc FROM pg_proc WHERE proname = 'get_available_forklifts' LIMIT 1) ILIKE '%deleted_at IS NULL%'
);

SELECT pg_temp.expect_true(
  'R2-03 create_booking filtra OT archivadas/canceladas',
  (SELECT prosrc FROM pg_proc WHERE proname = 'create_booking' LIMIT 1) ILIKE '%deleted_at IS NULL%'
);

-- 02-FIX-R2-04: venta de equipo atómica con guards.
SELECT pg_temp.expect_true(
  'R2-04 assign_forklift_to_sale_quote existe y es SECURITY DEFINER',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assign_forklift_to_sale_quote' AND prosecdef)
);

-- 03-FIX-R2-01: guard de permiso/rol en TODAS las RPCs de reportes.
SELECT pg_temp.expect_true(
  'R2-REP todas las RPCs report_* con guard de permiso',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE (p.proname LIKE 'report\_%' OR p.proname = 'get_income_statement')
      AND p.prosrc NOT ILIKE '%has_permission%'
      AND p.prosrc NOT ILIKE '%has_role%'
  )
);


-- 03-FIX-R2-08: la vista de vencidas corre con permisos del invocador.
SELECT pg_temp.expect_true(
  'R2-08 v_overdue_invoices con security_invoker',
  (SELECT reloptions::text FROM pg_class WHERE relname = 'v_overdue_invoices') ILIKE '%security_invoker=on%'
);

-- 02-FIX-R2-06: horómetro no negativo en base de datos.
SELECT pg_temp.expect_true(
  'R2-06 deliveries con guard de horómetro no negativo',
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid AND t.relname = 'deliveries'
    WHERE pg_get_constraintdef(c.oid) ILIKE '%hours_reading%'
  )
  OR (SELECT count(*) FROM pg_proc WHERE prosrc ILIKE '%hours_reading%' AND prosrc ILIKE '%>= 0%') > 0
);

-- 02-FIX-R2-10: backfills sin filas pendientes.
SELECT pg_temp.expect_true(
  'R2-10 sin logs de póliza en $0 pendientes de backfill',
  (SELECT count(*) FROM public.maintenance_logs
    WHERE deleted_at IS NULL AND work_status = 'scheduled'
      AND COALESCE(cost, 0) = 0 AND COALESCE(manual_cost, 0) = 0
      AND description LIKE 'Póliza mensual - %') = 0
);

SELECT pg_temp.expect_true(
  'R2-10 sin next_service_date residual en pólizas programadas',
  (SELECT count(*) FROM public.maintenance_logs
    WHERE deleted_at IS NULL AND work_status = 'scheduled'
      AND next_service_date IS NOT NULL
      AND description LIKE 'Póliza mensual - %') = 0
);

SELECT pg_temp.expect_true(
  'R2-10 sin unidades disponibles con último status_log en maintenance',
  (SELECT count(*) FROM public.forklifts f
    WHERE f.status = 'available' AND f.deleted_at IS NULL
      AND (SELECT sl.to_status FROM public.status_logs sl
            WHERE sl.forklift_id = f.id ORDER BY sl.changed_at DESC LIMIT 1) = 'maintenance') = 0
);

ROLLBACK;
