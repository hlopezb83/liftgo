-- Smoke de catálogo para integridad atómica daño/factura.
-- psql -f supabase/tests/r_fix42_damage_invoice_integrity_smoke.sql
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_cond THEN RAISE EXCEPTION 'FALLO: %', p_label; END IF;
  RAISE NOTICE 'OK: %', p_label;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text, p_nargs integer)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name AND p.pronargs = p_nargs;
$$;

SELECT pg_temp.expect_true(
  'overload de cinco argumentos bloquea el daño FOR UPDATE',
  pg_temp.fndef('save_invoice_with_bookings', 5) LIKE '%FOR UPDATE%'
  AND pg_temp.fndef('save_invoice_with_bookings', 5) LIKE '%deleted_at IS NULL%'
  AND pg_temp.fndef('save_invoice_with_bookings', 5) LIKE '%repaired_at IS NULL%'
);

SELECT pg_temp.expect_true(
  'archivar daño conserva documentos',
  pg_temp.fndef('soft_delete_damage_record', 1) NOT LIKE '%DELETE FROM public.documents%'
);

SELECT pg_temp.expect_true(
  'archivar exige reparación terminada',
  pg_temp.fndef('soft_delete_damage_record', 1) LIKE '%v_rec.repaired_at IS NULL%'
  AND pg_temp.fndef('soft_delete_damage_record', 1) LIKE '%waiting_parts%'
);

SELECT pg_temp.expect_true(
  'guard de facturación está instalado como BEFORE trigger',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'damage_records'
      AND t.tgname = 'trg_damage_billing_requires_repair'
      AND NOT t.tgisinternal
      AND (t.tgtype & 2) <> 0
  )
);

SELECT pg_temp.expect_true(
  'guard de facturación revalida repaired_at aunque no cambie billing',
  pg_temp.fndef('guard_damage_billing_requires_repair', 0)
    LIKE '%IF NEW.invoice_id IS NOT NULL OR NEW.status = ''invoiced''%'
  AND pg_temp.fndef('guard_damage_billing_requires_repair', 0)
    LIKE '%OLD.deleted_at IS NULL%'
);

SELECT pg_temp.expect_true(
  'estado físico y repaired_at no pueden contradecirse',
  pg_temp.fndef('guard_damage_billing_requires_repair', 0)
    LIKE '%NEW.status IN (''repaired'', ''invoiced'') AND NEW.repaired_at IS NULL%'
  AND pg_temp.fndef('guard_damage_billing_requires_repair', 0)
    LIKE '%NEW.status IN (''reported'', ''in_repair'') AND NEW.repaired_at IS NOT NULL%'
  AND pg_temp.fndef('restore_forklift_on_damage_repaired', 0)
    LIKE '%NEW.status IN (''repaired'', ''invoiced'')%'
);

SELECT pg_temp.expect_true(
  'restaurar montacargas también escucha repaired_at',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'damage_records'
      AND t.tgname = 'trg_damage_repaired_restore'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%UPDATE OF status, repaired_at, deleted_at%'
  )
);

SELECT pg_temp.expect_true(
  'restauración serializa por equipo y restablece el bypass',
  pg_temp.fndef('restore_forklift_on_damage_repaired', 0) LIKE '%FOR UPDATE%'
  AND pg_temp.fndef('restore_forklift_on_damage_repaired', 0)
    LIKE '%v_previous_rpc%'
  AND pg_temp.fndef('soft_delete_damage_record', 1)
    LIKE '%v_previous_rpc%'
);

SELECT pg_temp.expect_true(
  'cliente, reserva y factura se revalidan en cada relación relevante',
  pg_temp.fndef('guard_damage_record_invoice', 0)
    LIKE '%NEW.customer_id IS DISTINCT FROM v_booking_customer%'
  AND pg_temp.fndef('guard_damage_record_invoice', 0)
    LIKE '%v_invoice_customer IS DISTINCT FROM v_damage_customer%'
  AND EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'damage_records'
       AND t.tgname = 'trg_guard_damage_record_invoice'
       AND pg_get_triggerdef(t.oid) ILIKE '%invoice_id, customer_id, booking_id%'
  )
);

SELECT pg_temp.expect_true(
  'daño archivado es inmutable y sólo se restaura por la RPC',
  pg_temp.fndef('guard_archived_damage_immutable', 0)
    LIKE '%OLD.deleted_at IS NOT NULL%'
  AND pg_temp.fndef('guard_archived_damage_immutable', 0)
    LIKE '%app.damage_restore%'
  AND pg_temp.fndef('restore_damage_record', 1)
    LIKE '%set_config(''app.damage_restore'', ''on''%'
);

SELECT pg_temp.expect_true(
  'cancelar sólo libera daños activos y reabre mantenimiento físico',
  pg_temp.fndef('release_damage_on_invoice_cancel', 0)
    LIKE '%AND deleted_at IS NULL%'
  AND pg_temp.fndef('release_damage_on_invoice_cancel', 0)
    LIKE '%ensure_forklift_maintenance_for_open_damage%'
  AND pg_temp.fndef('ensure_forklift_maintenance_for_open_damage', 2)
    LIKE '%FOR UPDATE%'
  AND pg_temp.fndef('ensure_forklift_maintenance_for_open_damage', 2)
    LIKE '%status IN (''available'', ''rented'')%'
);

SELECT pg_temp.expect_true(
  'restaurar concilia factura cancelada y estado físico pendiente',
  pg_temp.fndef('restore_damage_record', 1)
    LIKE '%cancellation_status = ''accepted''%'
  AND pg_temp.fndef('restore_damage_record', 1)
    LIKE '%THEN ''reported'' ELSE ''repaired''%'
  AND pg_temp.fndef('restore_damage_record', 1)
    LIKE '%ensure_forklift_maintenance_for_open_damage%'
);

ROLLBACK;
