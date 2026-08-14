-- Smoke SQL del Sprint 3 (triggers de dinero: NCs, sobrepago, moneda y TZ Monterrey).
-- Ejecutar manualmente:
--   psql -f supabase/tests/sprint3_dinero_smoke.sql
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

-- ---------------------------------------------------------------------------
-- Fix 3.1 — TZ Monterrey: ninguna función de dinero puede usar CURRENT_DATE.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'S3-3.1 guard_invoice_overdue_due_date usa today_mty() y no CURRENT_DATE',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'guard_invoice_overdue_due_date'
       AND p.prosrc ILIKE '%today_mty()%'
       AND p.prosrc !~* '(current_date|now\(\)::date)'
  )
);

SELECT pg_temp.expect_true(
  'S3-3.1 recalc_supplier_bill usa today_mty() y no CURRENT_DATE',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'recalc_supplier_bill'
       AND p.prosrc ILIKE '%today_mty()%'
       AND p.prosrc !~* '(current_date|now\(\)::date)'
  )
);

-- ---------------------------------------------------------------------------
-- Fix 3.2 — la rama 'sent' del sync de pagos respeta la fecha de vencimiento.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'S3-3.2 sync_invoice_status_from_payments considera NCs timbradas',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sync_invoice_status_from_payments'
       AND p.prosrc ILIKE '%credit_notes%'
       AND p.prosrc ILIKE '%stamped%'
  )
);

SELECT pg_temp.expect_true(
  'S3-3.2 rama sin pagos evalúa due_date contra today_mty()',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sync_invoice_status_from_payments'
       AND p.prosrc ILIKE '%overdue%'
       AND p.prosrc ILIKE '%today_mty()%'
       AND p.prosrc !~* '(current_date|now\(\)::date)'
  )
);

-- ---------------------------------------------------------------------------
-- Fix 3.3 — pruebas de comportamiento sobre datos efímeros.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_inv_nc   uuid := '3f000000-0000-4000-8000-000000000001';
  v_inv_pay  uuid := '3f000000-0000-4000-8000-000000000002';
  v_inv_due  uuid := '3f000000-0000-4000-8000-000000000003';
  v_bill     uuid := '3f000000-0000-4000-8000-000000000004';
  v_pay      uuid := '3f000000-0000-4000-8000-000000000005';
  v_status   text;
  v_bstatus  text;
  v_blocked  boolean;
BEGIN
  -- Caso A: factura con NC timbrada por el total → 'paid', nunca 'overdue'.
  INSERT INTO public.invoices (id, invoice_number, customer_name, subtotal, tax_rate,
                               tax_amount, total, status, due_date)
  VALUES (v_inv_nc, 'S3-NC-001', 'Cliente Sprint 3', 1000, 0, 0, 1000, 'sent',
          public.today_mty() - 5);

  INSERT INTO public.credit_notes (invoice_id, credit_note_number, motive, reason_text,
                                   subtotal, tax_rate, tax_amount, total, status)
  VALUES (v_inv_nc, 'S3-NC-CN-001', '01', 'Cancelación total de la factura',
          1000, 0, 0, 1000, 'stamped');

  SELECT status INTO v_status FROM public.invoices WHERE id = v_inv_nc;
  PERFORM pg_temp.expect_true(
    format('S3-3.3 NC timbrada total deja la factura en paid (obtuvo %s)', v_status),
    v_status = 'paid'
  );

  -- Caso B: sobrepago bloqueado.
  INSERT INTO public.invoices (id, invoice_number, customer_name, subtotal, tax_rate,
                               tax_amount, total, status, due_date)
  VALUES (v_inv_pay, 'S3-PAY-001', 'Cliente Sprint 3', 1000, 0, 0, 1000, 'sent',
          public.today_mty() + 5);

  v_blocked := false;
  BEGIN
    INSERT INTO public.payments (invoice_id, amount, payment_date, currency)
    VALUES (v_inv_pay, 1500, public.today_mty(), 'MXN');
  EXCEPTION WHEN others THEN
    v_blocked := true;
  END;
  PERFORM pg_temp.expect_true('S3-3.3 sobrepago rechazado', v_blocked);

  -- Caso C: pago en moneda distinta a la factura bloqueado.
  v_blocked := false;
  BEGIN
    INSERT INTO public.payments (invoice_id, amount, payment_date, currency)
    VALUES (v_inv_pay, 100, public.today_mty(), 'USD');
  EXCEPTION WHEN others THEN
    v_blocked := true;
  END;
  PERFORM pg_temp.expect_true('S3-3.3 pago en moneda distinta rechazado', v_blocked);

  -- Caso D: borrar el único pago de una factura vencida la deja en 'overdue'.
  INSERT INTO public.invoices (id, invoice_number, customer_name, subtotal, tax_rate,
                               tax_amount, total, status, due_date)
  VALUES (v_inv_due, 'S3-DUE-001', 'Cliente Sprint 3', 1000, 0, 0, 1000, 'sent',
          public.today_mty() - 3);

  INSERT INTO public.payments (id, invoice_id, amount, payment_date, currency)
  VALUES (v_pay, v_inv_due, 400, public.today_mty(), 'MXN');

  DELETE FROM public.payments WHERE id = v_pay;

  SELECT status INTO v_status FROM public.invoices WHERE id = v_inv_due;
  PERFORM pg_temp.expect_true(
    format('S3-3.3 borrar el pago deja la factura vencida en overdue (obtuvo %s)', v_status),
    v_status = 'overdue'
  );

  -- Caso E: CxP que vence mañana (hora Monterrey) no se marca vencida hoy.
  INSERT INTO public.supplier_bills (id, bill_number, issue_date, subtotal, tax_amount,
                                     total, due_date, status)
  VALUES (v_bill, 'S3-BILL-001', public.today_mty(), 1000, 0, 1000,
          public.today_mty() + 1, 'pending');

  PERFORM public.recalc_supplier_bill(v_bill);

  SELECT status::text INTO v_bstatus FROM public.supplier_bills WHERE id = v_bill;
  PERFORM pg_temp.expect_true(
    format('S3-3.3 CxP que vence mañana sigue pending (obtuvo %s)', v_bstatus),
    v_bstatus = 'pending'
  );
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALLO  S3-3.3 pruebas de comportamiento abortadas: %', SQLERRM;
END $$;

ROLLBACK;
