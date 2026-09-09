-- Regresión C-01: una factura con cualquier pago, pero saldo pendiente, no
-- puede pasar manualmente a paid. El pago final sí activa el sync canónico.
-- Ejecutar contra staging/local ya migrado:
--   psql -f supabase/tests/financial_integrity_smoke.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN
    RAISE NOTICE 'OK  %', p_label;
  ELSE
    RAISE EXCEPTION 'FALLO  %', p_label;
  END IF;
END; $$;

SELECT pg_temp.expect_true(
  'C-01 guard calcula saldo con pagos y NC timbradas',
  (SELECT p.prosrc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'guard_invoice_status_integrity')
    ILIKE '%v_remaining%'
  AND
  (SELECT p.prosrc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'guard_invoice_status_integrity')
    ILIKE '%cfdi_status = ''stamped''%'
);

SELECT pg_temp.expect_true(
  'C-01 guard cubre INSERT y cambios de total/divisa',
  EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'invoices'
       AND t.tgname = 'trg_guard_invoice_status_integrity'
       AND NOT t.tgisinternal
       AND pg_get_triggerdef(t.oid) ILIKE '%BEFORE INSERT OR UPDATE OF status, total, moneda, tipo_cambio%'
  )
);

SELECT pg_temp.expect_true(
  'A-02 proyección usa tarifa maestra e historial real',
  (SELECT p.prosrc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_cash_flow_recurring_bookings')
    ILIKE '%COALESCE(b.monthly_rate, f.monthly_rate)%'
  AND
  (SELECT p.prosrc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_cash_flow_recurring_bookings')
    ILIKE '%max(i.billing_period_end)%'
);

SELECT pg_temp.expect_true(
  'A-01 claim bloquea y devuelve el snapshot fiscal autoritativo',
  (SELECT p.prosrc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_credit_note_for_stamping')
    ILIKE '%FOR UPDATE%'
  AND
  (SELECT p.prosrc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_credit_note_for_stamping')
    ILIKE '%RETURN to_jsonb(v_note)%'
);

SELECT pg_temp.expect_true(
  'A-01 contenido fiscal queda congelado mientras stamping',
  EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'credit_notes'
       AND t.tgname = 'trg_credit_note_stamping_snapshot'
       AND NOT t.tgisinternal
       AND (t.tgtype & 2) <> 0
  )
  AND
  (SELECT p.prosrc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'guard_credit_note_stamping_snapshot')
    ILIKE '%OLD.cfdi_status = ''stamping''%'
);

DO $$
DECLARE
  v_customer uuid := gen_random_uuid();
  v_invoice uuid := gen_random_uuid();
  v_legacy_invoice uuid := gen_random_uuid();
  v_blocked boolean := false;
  v_status text;
  v_balance numeric;
BEGIN
  INSERT INTO public.customers (id, name)
  VALUES (v_customer, 'C-01 Smoke');

  INSERT INTO public.invoices (
    id, invoice_number, customer_id, customer_name, subtotal, tax_amount,
    total, status, issued_at, due_date, moneda, tipo_cambio, line_items
  ) VALUES (
    v_invoice, 'C01-' || left(v_invoice::text, 8), v_customer, 'C-01 Smoke',
    1000, 0, 1000, 'sent', public.today_mty(), public.today_mty() + 30,
    'MXN', 1,
    '[{"description":"Renta","quantity":1,"unit_price":1000,"total":1000}]'::jsonb
  );

  INSERT INTO public.payments (invoice_id, amount, payment_date, currency)
  VALUES (v_invoice, 1, public.today_mty(), 'MXN');

  BEGIN
    UPDATE public.invoices
       SET status = 'paid', paid_at = public.today_mty()
     WHERE id = v_invoice;
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM ILIKE '%saldo pendiente%';
  END;

  SELECT status::text INTO v_status FROM public.invoices WHERE id = v_invoice;
  SELECT balance INTO v_balance FROM public.v_invoices_with_balance WHERE id = v_invoice;
  PERFORM pg_temp.expect_true(
    'C-01 $1 de $1000 no permite paid y conserva saldo $999',
    v_blocked AND v_status = 'partial' AND v_balance = 999
  );

  INSERT INTO public.payments (invoice_id, amount, payment_date, currency)
  VALUES (v_invoice, 999, public.today_mty(), 'MXN');

  SELECT status::text INTO v_status FROM public.invoices WHERE id = v_invoice;
  SELECT balance INTO v_balance FROM public.v_invoices_with_balance WHERE id = v_invoice;
  PERFORM pg_temp.expect_true(
    'C-01 el pago final deja paid con saldo cero mediante sync',
    v_status = 'paid' AND v_balance = 0
  );

  v_blocked := false;
  BEGIN
    UPDATE public.invoices SET total = 1001 WHERE id = v_invoice;
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM ILIKE '%saldo pendiente%';
  END;
  SELECT total INTO v_balance FROM public.invoices WHERE id = v_invoice;
  PERFORM pg_temp.expect_true(
    'C-01 una factura paid no puede aumentar su total y conservar saldo',
    v_blocked AND v_balance = 1000
  );

  v_blocked := false;
  BEGIN
    INSERT INTO public.invoices (
      id, invoice_number, customer_id, customer_name, subtotal, tax_amount,
      total, status, issued_at, due_date, moneda, tipo_cambio, line_items
    ) VALUES (
      gen_random_uuid(), 'C01-PAID-' || left(v_invoice::text, 8), v_customer, 'C-01 Smoke',
      100, 0, 100, 'paid', public.today_mty(), public.today_mty() + 30,
      'MXN', 1,
      '[{"description":"Renta","quantity":1,"unit_price":100,"total":100}]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM ILIKE '%saldo pendiente%';
  END;
  PERFORM pg_temp.expect_true(
    'C-01 una factura con saldo no puede insertarse directamente como paid',
    v_blocked
  );

  -- Simula una fila persistida antes de instalar el guard. La reconciliación
  -- de la migración llama exactamente al mismo helper para cada paid histórica.
  PERFORM set_config('app.e2e_seed', 'on', true);
  INSERT INTO public.invoices (
    id, invoice_number, customer_id, customer_name, subtotal, tax_amount,
    total, status, paid_at, issued_at, due_date, moneda, tipo_cambio, line_items
  ) VALUES (
    v_legacy_invoice, 'C01-LEGACY-' || left(v_legacy_invoice::text, 8),
    v_customer, 'C-01 Smoke', 250, 0, 250, 'paid', public.today_mty(),
    public.today_mty(), public.today_mty() + 30, 'MXN', 1,
    '[{"description":"Renta histórica","quantity":1,"unit_price":250,"total":250}]'::jsonb
  );
  PERFORM set_config('app.e2e_seed', 'off', true);

  PERFORM public.sync_invoice_status(v_legacy_invoice);
  SELECT status::text INTO v_status
    FROM public.invoices WHERE id = v_legacy_invoice;
  PERFORM pg_temp.expect_true(
    'C-01 reconciliación degrada paid histórica con saldo pendiente',
    v_status = 'sent'
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.e2e_seed', 'off', true);
  RAISE WARNING 'FALLO  C-01 escenario funcional: %', SQLERRM;
  RAISE;
END $$;

ROLLBACK;
