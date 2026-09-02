-- Smoke A6-1: archivar una OT abierta debe liberar el montacargas.
--   Antes, trg_sync_forklift_on_maintenance sólo escuchaba `work_status`, así
--   que archivar una OT 'in_progress' (soft_delete_maintenance_log) dejaba la
--   unidad atascada en 'maintenance' para siempre.
--   Ahora el trigger también escucha `deleted_at` y trata el archivado como
--   cancelación, conservando los frenos existentes: rentas activas hoy, daños
--   abiertos u otras OT abiertas mantienen la unidad en mantenimiento.
--
--   psql -f supabase/tests/r_fix38_maintenance_archive_releases_forklift_smoke.sql
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

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name;
$$;

-- ---------------------------------------------------------------------------
-- 1. Contrato del trigger (catálogo)
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_true(
  'trg_sync_forklift_on_maintenance escucha también deleted_at',
  pg_get_triggerdef(t.oid) LIKE '%UPDATE OF work_status, deleted_at%'
) FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'maintenance_logs'
   AND t.tgname = 'trg_sync_forklift_on_maintenance';

SELECT pg_temp.expect_true(
  'la función trata el archivado como cancelación',
  pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%v_archived%'
);

SELECT pg_temp.expect_true(
  'sigue respetando daños abiertos (reported/in_repair)',
  pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%in_repair%'
);

SELECT pg_temp.expect_true(
  'sigue respetando otras OT abiertas (pending/in_progress)',
  pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%v_open_work_orders%'
);

SELECT pg_temp.expect_true(
  'sigue respetando rentas confirmadas vigentes',
  pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%v_active_bookings%'
);

SELECT pg_temp.expect_true(
  'SECURITY DEFINER con search_path fijo',
  pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%SECURITY DEFINER%'
  AND pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%search_path%'
);

-- ---------------------------------------------------------------------------
-- 2. Comportamiento
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_fk   uuid := gen_random_uuid();
  v_fk2  uuid := gen_random_uuid();
  v_ot   uuid := gen_random_uuid();
  v_ot2  uuid := gen_random_uuid();
  v_st   text;
BEGIN
  PERFORM set_config('app.e2e_seed', 'on', true);

  -- Caso 1: OT en progreso archivada -> unidad liberada.
  INSERT INTO public.forklifts (id, name, model, serial_number, status)
  VALUES (v_fk, 'SMOKE A6-1', 'M', 'SMOKE-A61-' || v_fk, 'available');
  INSERT INTO public.maintenance_logs (id, forklift_id, service_type, work_status, performed_at)
  VALUES (v_ot, v_fk, 'preventivo', 'in_progress', now());

  SELECT status INTO v_st FROM public.forklifts WHERE id = v_fk;
  PERFORM pg_temp.expect_true('OT en progreso pone la unidad en mantenimiento', v_st = 'maintenance');

  UPDATE public.maintenance_logs SET deleted_at = now() WHERE id = v_ot;
  SELECT status INTO v_st FROM public.forklifts WHERE id = v_fk;
  PERFORM pg_temp.expect_true('archivar la OT abierta libera la unidad (available)', v_st = 'available');

  -- Caso 2: daño abierto impide liberar.
  INSERT INTO public.forklifts (id, name, model, serial_number, status)
  VALUES (v_fk2, 'SMOKE A6-1 daño', 'M', 'SMOKE-A62-' || v_fk2, 'available');
  INSERT INTO public.maintenance_logs (id, forklift_id, service_type, work_status, performed_at)
  VALUES (v_ot2, v_fk2, 'preventivo', 'in_progress', now());
  INSERT INTO public.damage_records (id, forklift_id, description, status)
  VALUES (gen_random_uuid(), v_fk2, 'smoke daño', 'reported');

  UPDATE public.maintenance_logs SET deleted_at = now() WHERE id = v_ot2;
  SELECT status INTO v_st FROM public.forklifts WHERE id = v_fk2;
  PERFORM pg_temp.expect_true('con daño abierto la unidad permanece en mantenimiento', v_st = 'maintenance');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'OMITIDO: el rol actual no puede escribir estas tablas (%).', SQLERRM;
END $$;

ROLLBACK;
