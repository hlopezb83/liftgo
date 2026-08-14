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

-- Fix 4.4 (semántica): "renta activa" = entrega completada sin devolución.
SELECT pg_temp.expect_true(
  'S4-4.4 existe has_open_rental() con semántica entrega/devolución',
  (SELECT prosrc FROM pg_proc WHERE proname = 'has_open_rental') ILIKE '%deliveries%'
  AND (SELECT prosrc FROM pg_proc WHERE proname = 'has_open_rental') ILIKE '%return%'
);

SELECT pg_temp.expect_true(
  'S4-4.4 el trigger de flota usa has_open_rental()',
  (SELECT prosrc FROM pg_proc WHERE proname = 'guard_forklift_status_change')
    ILIKE '%has_open_rental%'
);

SELECT pg_temp.expect_true(
  'S4-4.4 change_forklift_status usa has_open_rental()',
  (SELECT prosrc FROM pg_proc WHERE proname = 'change_forklift_status')
    ILIKE '%has_open_rental%'
);

SELECT pg_temp.expect_true(
  'S4-4.4 la RPC de venta usa has_open_rental()',
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_forklift_to_sale_quote')
    ILIKE '%has_open_rental%'
);

-- Comportamiento: CxP pagada con pagos no puede salir de 'paid'.
DO $$
DECLARE
  v_bill uuid := '4f000000-0000-4000-8000-000000000001';
  v_blocked boolean := false;
BEGIN
  INSERT INTO public.supplier_bills (id, bill_number, issue_date, subtotal, tax_amount,
                                     total, due_date, status)
  VALUES (v_bill, 'S4-BILL-001', public.today_mty(), 1000, 0, 1000,
          public.today_mty() + 10, 'pending');

  INSERT INTO public.supplier_payments (bill_id, amount, payment_date)
  VALUES (v_bill, 1000, public.today_mty());

  PERFORM pg_temp.expect_true(
    'S4-4.3 la CxP con pago total queda en paid',
    (SELECT status::text FROM public.supplier_bills WHERE id = v_bill) = 'paid'
  );

  BEGIN
    UPDATE public.supplier_bills SET status = 'cancelled' WHERE id = v_bill;
  EXCEPTION WHEN others THEN
    v_blocked := true;
  END;
  PERFORM pg_temp.expect_true('S4-4.3 CxP pagada con pagos no se cancela', v_blocked);
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALLO  S4-4.3 prueba de comportamiento abortada: %', SQLERRM;
END $$;


ROLLBACK;
