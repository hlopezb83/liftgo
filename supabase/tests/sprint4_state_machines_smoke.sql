-- Smoke SQL del Sprint 4 (máquinas de estado endurecidas).
-- Ejecutar manualmente contra staging:
--   psql -f supabase/tests/sprint4_state_machines_smoke.sql
-- Solo lecturas: inspecciona el cuerpo de los triggers, no modifica datos.

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

-- Fix 4.1: contrato completed bloqueado en enforce_signed_contract_lock.
SELECT pg_temp.expect_true(
  'S4-4.1 completed dentro de la lista bloqueada de contratos',
  (SELECT prosrc FROM pg_proc WHERE proname = 'enforce_signed_contract_lock')
    ILIKE '%''signed'',''active'',''cancelled'',''completed''%'
);

SELECT pg_temp.expect_true(
  'S4-4.1 completed es final salvo service_role',
  (SELECT prosrc FROM pg_proc WHERE proname = 'enforce_signed_contract_lock')
    ILIKE '%Un contrato completado es final%'
);

-- Fix 4.2: draft ya no puede ir a overdue en facturas.
SELECT pg_temp.expect_true(
  'S4-4.2 invoices draft -> [sent, cancelled]',
  (SELECT prosrc FROM pg_proc WHERE proname = 'validate_transition')
    ILIKE '%WHEN ''draft''    THEN ARRAY[''sent'',''cancelled'']%'
);

-- Fix 4.3: salir de paid en CxP exige cero pagos o service_role.
SELECT pg_temp.expect_true(
  'S4-4.3 guard de pagos en supplier_bills',
  (SELECT prosrc FROM pg_proc WHERE proname = 'validate_transition')
    ILIKE '%elimina o reversa los pagos primero%'
);

-- Fix 4.4: unidad rentada no puede venderse/retirarse con renta activa.
SELECT pg_temp.expect_true(
  'S4-4.4 guard de renta activa en forklifts',
  (SELECT prosrc FROM pg_proc WHERE proname = 'validate_transition')
    ILIKE '%completa la devolución antes de venderla%'
);

ROLLBACK;
