-- Smoke del guard P2 de mantenimientos:
--   trg_guard_maintenance_archive / public.guard_maintenance_archive() impide
--   que un UPDATE directo sobre maintenance_logs.deleted_at evada la ruta
--   canónica public.soft_delete_maintenance_log(), que es la única que ejecuta
--   los efectos colaterales: regla de OT cerrada (solo admin) y limpieza de
--   maintenance_parts / maintenance_labor de OT abiertas (con su devolución de
--   inventario y recálculo de costo vía triggers).
--   Desarchivar y las ediciones ordinarias quedan sin cambios.
--
--   psql -f supabase/tests/r_fix36_maintenance_archive_guard_smoke.sql
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
-- 1. Contrato del guard (catálogo)
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_true(
  'existe el trigger BEFORE UPDATE trg_guard_maintenance_archive',
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'maintenance_logs'
      AND t.tgname = 'trg_guard_maintenance_archive'
      AND (t.tgtype & 2) <> 0   -- BEFORE
      AND (t.tgtype & 16) <> 0  -- UPDATE
  )
);

SELECT pg_temp.expect_true(
  'el trigger está acotado a la columna deleted_at',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (t.tgattr::smallint[])
    WHERE c.relname = 'maintenance_logs'
      AND t.tgname = 'trg_guard_maintenance_archive'
      AND a.attname = 'deleted_at'
  )
);

SELECT pg_temp.expect_true(
  'guard_maintenance_archive es SECURITY DEFINER con search_path = public',
  pg_temp.fndef('guard_maintenance_archive') LIKE '%SECURITY DEFINER%'
  AND pg_temp.fndef('guard_maintenance_archive') LIKE '%search_path%public%'
);

SELECT pg_temp.expect_true(
  'el guard sólo actúa en la transición no archivado -> archivado',
  pg_temp.fndef('guard_maintenance_archive')
    LIKE '%OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL%'
);

SELECT pg_temp.expect_true(
  'el guard reconoce la bandera transaccional de la ruta canónica',
  pg_temp.fndef('guard_maintenance_archive') LIKE '%app.maintenance_archive_rpc%'
);

SELECT pg_temp.expect_true(
  'sólo el sembrado E2E queda exento (sin bypass de service_role)',
  pg_temp.fndef('guard_maintenance_archive') LIKE '%app.e2e_seed%'
  AND pg_temp.fndef('guard_maintenance_archive') NOT LIKE '%auth.uid() IS NULL%'
);

SELECT pg_temp.expect_true(
  'contrato de error estable 42501 para archivado directo',
  pg_temp.fndef('guard_maintenance_archive') LIKE '%42501%'
);

SELECT pg_temp.expect_true(
  'EXECUTE del guard revocado a anon/authenticated',
  NOT has_function_privilege('anon', 'public.guard_maintenance_archive()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.guard_maintenance_archive()', 'EXECUTE')
);

-- ---------------------------------------------------------------------------
-- 2. Semántica del RPC canónico: se preserva íntegra
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_true(
  'soft_delete_maintenance_log sigue exigiendo admin/administrativo',
  pg_temp.fndef('soft_delete_maintenance_log')
    LIKE '%solo admin/administrativo pueden archivar mantenimientos%'
);

SELECT pg_temp.expect_true(
  'la OT cerrada (completed) sigue siendo exclusiva de admin',
  pg_temp.fndef('soft_delete_maintenance_log')
    LIKE '%solo un administrador puede archivarla%'
);

SELECT pg_temp.expect_true(
  'el RPC limpia refacciones y mano de obra sólo de OT no cerradas',
  pg_temp.fndef('soft_delete_maintenance_log')
    LIKE '%v_status <> ''completed''%'
  AND pg_temp.fndef('soft_delete_maintenance_log') LIKE '%DELETE FROM public.maintenance_parts%'
  AND pg_temp.fndef('soft_delete_maintenance_log') LIKE '%DELETE FROM public.maintenance_labor%'
);

SELECT pg_temp.expect_true(
  'el RPC marca la transacción como ruta canónica de archivado',
  pg_temp.fndef('soft_delete_maintenance_log')
    LIKE '%set_config(''app.maintenance_archive_rpc'', ''on'', true)%'
);

SELECT pg_temp.expect_true(
  'el RPC apaga la bandera después del archivado',
  pg_temp.fndef('soft_delete_maintenance_log')
    LIKE '%set_config(''app.maintenance_archive_rpc'', ''off'', true)%'
);

-- ---------------------------------------------------------------------------
-- 3. Comportamiento: UPDATE directo bloqueado sin importar el rol
--    (el guard no depende del rol: la única ruta válida es el RPC)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_forklift uuid;
  v_log uuid;
  v_err text;
  v_still_active boolean;
BEGIN
  SELECT id INTO v_forklift FROM public.forklifts LIMIT 1;
  IF v_forklift IS NULL THEN
    RAISE NOTICE 'SKIP  sin forklifts para la prueba de comportamiento';
    RETURN;
  END IF;

  PERFORM set_config('app.e2e_seed', 'on', true);
  INSERT INTO public.maintenance_logs (forklift_id, service_type, description, work_status, performed_at)
  VALUES (v_forklift, 'preventive', 'SMOKE fix36 archivado', 'draft', now()::date)
  RETURNING id INTO v_log;
  PERFORM set_config('app.e2e_seed', 'off', true);

  -- 3.a UPDATE directo (mecánico/administrativo/admin: misma ruta SQL) rechazado
  BEGIN
    UPDATE public.maintenance_logs SET deleted_at = now() WHERE id = v_log;
    RAISE WARNING 'FALLO  el UPDATE directo de deleted_at debió ser rechazado';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK  UPDATE directo de deleted_at rechazado con 42501';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE WARNING 'FALLO  error inesperado en UPDATE directo: %', v_err;
  END;

  SELECT deleted_at IS NULL INTO v_still_active
    FROM public.maintenance_logs WHERE id = v_log;
  PERFORM pg_temp.expect_true('la fila sigue activa tras el intento directo', v_still_active);

  -- 3.b Edición ordinaria (sin tocar deleted_at) no se ve afectada
  BEGIN
    UPDATE public.maintenance_logs SET description = 'SMOKE fix36 editado' WHERE id = v_log;
    RAISE NOTICE 'OK  edición ordinaria de mantenimiento sin cambios';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE WARNING 'FALLO  la edición ordinaria fue bloqueada: %', v_err;
  END;

  -- 3.c Ruta canónica simulada (bandera de la transacción) sí archiva
  BEGIN
    PERFORM set_config('app.maintenance_archive_rpc', 'on', true);
    UPDATE public.maintenance_logs SET deleted_at = now() WHERE id = v_log;
    PERFORM set_config('app.maintenance_archive_rpc', 'off', true);
    RAISE NOTICE 'OK  la ruta canónica sí puede archivar';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE WARNING 'FALLO  la ruta canónica fue bloqueada: %', v_err;
  END;

  -- 3.d Desarchivar sigue sin restricciones nuevas
  BEGIN
    UPDATE public.maintenance_logs SET deleted_at = NULL WHERE id = v_log;
    RAISE NOTICE 'OK  desarchivar sin cambios';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE WARNING 'FALLO  desarchivar fue bloqueado: %', v_err;
  END;
END $$;

ROLLBACK;
