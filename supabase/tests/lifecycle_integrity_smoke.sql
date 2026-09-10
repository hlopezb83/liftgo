-- Smoke de integridad de ciclo de vida (A-03/A-04/A-05/A-06/A-07/A-09/M-01).
-- Ejecutar contra una base migrada:
--   psql -f supabase/tests/lifecycle_integrity_smoke.sql
-- Sólo inspecciona catálogo/definiciones y termina con ROLLBACK.

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
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
$$;

SELECT pg_temp.expect_true(
  'A-03 no existe trigger que rente al insertar booking',
  NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'public.bookings'::regclass
       AND NOT t.tgisinternal
       AND (
         t.tgname = 'trg_sync_forklift_on_booking_insert'
         OR p.proname = 'sync_forklift_on_booking_insert'
       )
  )
  AND to_regprocedure('public.sync_forklift_on_booking_insert()') IS NULL
);

SELECT pg_temp.expect_true(
  'A-03 no queda cron que rente reservas iniciadas',
  NOT EXISTS (
    SELECT 1
      FROM cron.job
     WHERE jobname = 'mark-started-bookings-rented-daily'
        OR command ILIKE '%mark_started_bookings_rented%'
  )
);

SELECT pg_temp.expect_true(
  'A-03 invocación heredada exige entrega completada',
  pg_temp.fndef('mark_started_bookings_rented') LIKE '%d.type = ''delivery''%'
  AND pg_temp.fndef('mark_started_bookings_rented') LIKE '%d.status = ''completed''%'
  AND pg_temp.fndef('mark_started_bookings_rented') LIKE '%booking_is_returned%'
  AND pg_temp.fndef('mark_started_bookings_rented') NOT LIKE '%start_date%'
);

SELECT pg_temp.expect_true(
  'A-03 create_booking no promueve forklift a rented',
  pg_temp.fndef('create_booking') NOT LIKE '%Reserva % creada%'
  AND pg_temp.fndef('create_booking') NOT LIKE '%v_starts_today AND v_current_status%'
);

SELECT pg_temp.expect_true(
  'A-03 sync usa entrega completada y devolución canónica',
  pg_temp.fndef('sync_forklift_rental_status') LIKE '%d.type = ''delivery''%'
  AND pg_temp.fndef('sync_forklift_rental_status') LIKE '%d.status = ''completed''%'
  AND pg_temp.fndef('sync_forklift_rental_status') LIKE '%booking_is_returned%'
);

SELECT pg_temp.expect_true(
  'A-03 conciliación programada tampoco deriva rented por calendario',
  pg_temp.fndef('reconcile_expired_bookings') LIKE '%d.type = ''delivery''%'
  AND pg_temp.fndef('reconcile_expired_bookings') LIKE '%d.status = ''completed''%'
  AND pg_temp.fndef('reconcile_expired_bookings') LIKE '%booking_is_returned%'
  AND pg_temp.fndef('reconcile_expired_bookings') NOT LIKE '%b.start_date <= public.today_mty()%'
);

SELECT pg_temp.expect_true(
  'A-03 salida de booking conserva rented sólo por otra entrega abierta',
  pg_temp.fndef('sync_forklift_on_booking_exit') LIKE '%d.type = ''delivery''%'
  AND pg_temp.fndef('sync_forklift_on_booking_exit') LIKE '%d.status = ''completed''%'
  AND pg_temp.fndef('sync_forklift_on_booking_exit') LIKE '%b.id IS DISTINCT FROM OLD.id%'
  AND pg_temp.fndef('sync_forklift_on_booking_exit') NOT LIKE '%start_date <=%'
);

SELECT pg_temp.expect_true(
  'A-03 cancel_booking libera según otra entrega abierta, no por fecha',
  pg_temp.fndef('cancel_booking') LIKE '%d.type = ''delivery''%'
  AND pg_temp.fndef('cancel_booking') LIKE '%d.status = ''completed''%'
  AND pg_temp.fndef('cancel_booking') LIKE '%booking_is_returned%'
  AND pg_temp.fndef('cancel_booking') NOT LIKE '%b.start_date <= public.today_mty()%'
);

SELECT pg_temp.expect_true(
  'A-03 devolución excluye la reserva cerrada y exige otra entrega abierta',
  pg_temp.fndef('complete_return_inspection') LIKE '%b.id <> p_booking_id%'
  AND pg_temp.fndef('complete_return_inspection') LIKE '%d.type = ''delivery''%'
  AND pg_temp.fndef('complete_return_inspection') LIKE '%d.status = ''completed''%'
  AND pg_temp.fndef('complete_return_inspection') LIKE '%booking_is_returned%'
  AND pg_temp.fndef('complete_return_inspection') NOT LIKE '%b.start_date <= public.today_mty()%'
);

SELECT pg_temp.expect_true(
  'A-03 cualquier transición a rented exige entrega completada',
  pg_temp.fndef('guard_forklift_rented_requires_delivery') LIKE '%has_open_rental%'
  AND EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_forklift_rented_requires_delivery' AND NOT tgisinternal
  )
);

SELECT pg_temp.expect_true(
  'A-04 venta bloquea toda reserva confirmed pendiente, incluida futura',
  pg_temp.fndef('guard_forklift_sale_commitments') LIKE '%status = ''confirmed''%'
  AND pg_temp.fndef('guard_forklift_sale_commitments') LIKE '%booking_is_returned%'
  AND pg_temp.fndef('guard_forklift_sale_commitments') NOT LIKE '%start_date <=%'
);

SELECT pg_temp.expect_true(
  'A-04 selector de venta usa fuente canónica completa y paginada',
  pg_temp.fndef('get_sale_available_forklifts') LIKE '%f.status = ''available''%'
  AND pg_temp.fndef('get_sale_available_forklifts') LIKE '%b.status = ''confirmed''%'
  AND pg_temp.fndef('get_sale_available_forklifts') LIKE '%booking_is_returned%'
  AND pg_temp.fndef('get_sale_available_forklifts') NOT LIKE '%start_date%'
  AND pg_temp.fndef('get_sale_available_forklifts') LIKE '%LIMIT p_limit%'
  AND pg_temp.fndef('get_sale_available_forklifts') LIKE '%OFFSET p_offset%'
  AND has_function_privilege(
    'authenticated',
    'public.get_sale_available_forklifts(integer,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_sale_available_forklifts(integer,integer)',
    'EXECUTE'
  )
);

SELECT pg_temp.expect_true(
  'A-05 UI dispone de RPC transaccional complete_delivery',
  pg_temp.fndef('complete_delivery') LIKE '%FOR UPDATE%'
  AND pg_temp.fndef('complete_delivery') LIKE '%delivery_requires_available_forklift%'
  AND has_function_privilege('authenticated', 'public.complete_delivery(uuid,text,numeric,text)', 'EXECUTE')
);

SELECT pg_temp.expect_true(
  'A-05 efecto completed falla si la unidad no sigue available',
  pg_temp.fndef('apply_delivery_completed_effects') LIKE '%v_rows <> 1%'
);

SELECT pg_temp.expect_true(
  'A-05/A-09 daño legacy facturado pero no reparado sigue bloqueando entrega y liberación',
  pg_temp.fndef('validate_delivery_booking_integrity') LIKE '%repaired_at IS NULL%'
  AND pg_temp.fndef('complete_return_inspection') LIKE '%repaired_at IS NULL%'
  AND pg_temp.fndef('sync_forklift_rental_status') LIKE '%repaired_at IS NULL%'
  AND pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%repaired_at IS NULL%'
  AND pg_temp.fndef('reconcile_expired_bookings') LIKE '%repaired_at IS NULL%'
);

SELECT pg_temp.expect_true(
  'A-06 completed y cancelled quedan terminales',
  pg_temp.fndef('guard_delivery_completed_terminal') LIKE '%WHEN ''pending''%'
  AND pg_temp.fndef('guard_delivery_completed_terminal') LIKE '%WHEN ''scheduled''%'
  AND pg_temp.fndef('guard_delivery_completed_terminal') NOT LIKE '%WHEN ''cancelled'' THEN ARRAY[%'
  AND pg_temp.fndef('guard_delivery_completed_terminal') NOT LIKE '%WHEN ''completed'' THEN ARRAY[%'
  AND pg_temp.fndef('guard_delivery_completed_terminal') NOT LIKE '%app.audit_revert%'
  AND EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.deliveries'::regclass
       AND tgname = 'trg_guard_delivery_completed_terminal'
       AND NOT tgisinternal
  )
);

SELECT pg_temp.expect_true(
  'A-06 cancelar no acepta un payload obsoleto con otros campos',
  pg_temp.fndef('validate_delivery_booking_integrity') LIKE '%to_jsonb(NEW) - ''status'' - ''updated_at''%'
  AND pg_temp.fndef('validate_delivery_booking_integrity') LIKE '%sólo puede modificar status y updated_at%'
);

SELECT pg_temp.expect_true(
  'A-07 contratos aplican whitelist aun para admin',
  pg_temp.fndef('enforce_signed_contract_lock') LIKE '%WHEN ''signed'' THEN ARRAY[''completed'', ''cancelled'']%'
  AND pg_temp.fndef('enforce_signed_contract_lock') LIKE '%WHEN ''active'' THEN ARRAY[''completed'', ''cancelled'']%'
  AND pg_temp.fndef('enforce_signed_contract_lock') LIKE '%contracts_status_transition%'
  AND EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.contracts'::regclass
       AND tgname = 'trg_contracts_signed_lock'
       AND NOT tgisinternal
  )
);

SELECT pg_temp.expect_true(
  'A-09 predicado canónico de OT abierta bloquea reserva, entrega y devolución',
  pg_temp.fndef('create_booking') LIKE '%''pending'', ''in_progress'', ''waiting_parts''%'
  AND pg_temp.fndef('extend_booking') LIKE '%''pending'', ''in_progress'', ''waiting_parts''%'
  AND pg_temp.fndef('get_available_forklifts') LIKE '%''pending'', ''in_progress'', ''waiting_parts''%'
  AND pg_temp.fndef('complete_return_inspection') LIKE '%''pending'', ''in_progress'', ''waiting_parts''%'
  AND pg_temp.fndef('validate_delivery_booking_integrity') LIKE '%''pending'', ''in_progress'', ''waiting_parts''%'
);

SELECT pg_temp.expect_true(
  'A-09/M-01 sync trata waiting_parts como activo y detecta restore',
  pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%v_restored%'
  AND pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%OLD.deleted_at IS NOT NULL%'
  AND pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%''pending'', ''in_progress'', ''waiting_parts''%'
  AND pg_temp.fndef('sync_forklift_status_on_maintenance') LIKE '%v_forklift_status = ''rented'' AND NOT v_has_open_rental%'
  AND EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.maintenance_logs'::regclass
       AND tgname = 'trg_sync_forklift_on_maintenance'
       AND NOT tgisinternal
  )
);

SELECT pg_temp.expect_true(
  'A-03/A-09 cierre de daño restaura según entrega real y waiting_parts',
  pg_temp.fndef('damage_restore_forklift_status') LIKE '%has_open_rental%'
  AND pg_temp.fndef('damage_restore_forklift_status') LIKE '%''pending'', ''in_progress'', ''waiting_parts''%'
  AND pg_temp.fndef('damage_restore_forklift_status') NOT LIKE '%FROM public.bookings%'
);

SELECT pg_temp.expect_true(
  'A-08 reconciliación no deja available una unidad con daño físico pendiente',
  NOT EXISTS (
    SELECT 1
      FROM public.forklifts f
      JOIN public.damage_records dr ON dr.forklift_id = f.id
     WHERE f.status = 'available'
       AND f.deleted_at IS NULL
       AND dr.deleted_at IS NULL
       AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
  )
);

ROLLBACK;
