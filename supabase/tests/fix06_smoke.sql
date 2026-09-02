-- fix-06 — M-1 (periodos fiscales), M-2 (tipo_cambio inmutable + amount_mxn)
-- y M-4 (ventana de payment_date).
-- Ejecutar manualmente:
--   psql -f supabase/tests/fix06_smoke.sql
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
-- M-1 estático: tabla, RLS y policies
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'M-1 fiscal_periods existe con RLS y FORCE RLS',
  EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'fiscal_periods'
       AND c.relrowsecurity AND c.relforcerowsecurity
  )
);

SELECT pg_temp.expect_true(
  'M-1 fiscal_periods sin policies USING (true)',
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'fiscal_periods'
       AND replace(coalesce(qual, ''), ' ', '') = 'true'
  )
);

SELECT pg_temp.expect_true(
  'M-1 anon sin privilegios sobre fiscal_periods',
  NOT has_table_privilege('anon', 'public.fiscal_periods', 'SELECT')
);

-- ---------------------------------------------------------------------------
-- Datos base
-- ---------------------------------------------------------------------------
INSERT INTO public.customers (id, name) VALUES
  ('66666666-0000-4000-8000-000000000001', 'Cliente FIX06');

INSERT INTO public.invoices (id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, issued_at, line_items)
VALUES
  ('66666666-0000-4000-8000-000000000010', 'FAC-FIX06-A', '66666666-0000-4000-8000-000000000001',
   'Cliente FIX06', 1000, 0, 1000, 'sent', public.today_mty() - 10,
   '[{"description":"Renta","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb);

-- ---------------------------------------------------------------------------
-- M-1 conducta: periodo cerrado bloquea facturas y pagos
-- ---------------------------------------------------------------------------
INSERT INTO public.fiscal_periods (period, closed_at) VALUES ('2020-01', now());

DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, subtotal, tax_amount, total, status, issued_at, line_items)
    VALUES ('FAC-FIX06-CERRADO', 'Cliente FIX06', 100, 0, 100, 'draft', DATE '2020-01-15',
            '[{"description":"x","quantity":1,"unit_price":100,"amount":100}]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM ILIKE '%periodo fiscal%cerrado%';
  END;
  PERFORM pg_temp.expect_true('M-1 factura en periodo cerrado es rechazada', v_ok);
END $$;

DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (invoice_id, amount, payment_date)
    VALUES ('66666666-0000-4000-8000-000000000010', 10, DATE '2020-01-20');
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM ILIKE '%periodo fiscal%cerrado%';
  END;
  PERFORM pg_temp.expect_true('M-1 pago en periodo cerrado es rechazado', v_ok);
END $$;

DELETE FROM public.fiscal_periods WHERE period = '2020-01';

-- ---------------------------------------------------------------------------
-- M-4 conducta: ventana de payment_date
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (invoice_id, amount, payment_date)
    VALUES ('66666666-0000-4000-8000-000000000010', 10, public.today_mty() + 30);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM ILIKE '%7 días en el futuro%';
  END;
  PERFORM pg_temp.expect_true('M-4 pago a más de 7 días en el futuro es rechazado', v_ok);
END $$;

DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (invoice_id, amount, payment_date)
    VALUES ('66666666-0000-4000-8000-000000000010', 10, public.today_mty() - 60);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM ILIKE '%anterior a la fecha de emisión%';
  END;
  PERFORM pg_temp.expect_true('M-4 pago anterior a la emisión es rechazado', v_ok);
END $$;

DO $$
DECLARE v_ok boolean := true;
BEGIN
  BEGIN
    INSERT INTO public.payments (id, invoice_id, amount, payment_date)
    VALUES ('66666666-0000-4000-8000-000000000020', '66666666-0000-4000-8000-000000000010', 10,
            public.today_mty() + 3);
  EXCEPTION WHEN others THEN
    v_ok := false;
    RAISE NOTICE 'detalle: %', SQLERRM;
  END;
  PERFORM pg_temp.expect_true('M-4 pago dentro de la ventana (+3 días) se acepta', v_ok);
END $$;

-- ---------------------------------------------------------------------------
-- M-2 conducta: amount_mxn y tipo_cambio inmutable
-- ---------------------------------------------------------------------------
INSERT INTO public.invoices (id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, issued_at, moneda, tipo_cambio, line_items)
VALUES
  ('66666666-0000-4000-8000-000000000030', 'FAC-FIX06-USD', '66666666-0000-4000-8000-000000000001',
   'Cliente FIX06', 100, 0, 100, 'sent', public.today_mty() - 5, 'USD', 20,
   '[{"description":"Renta USD","quantity":1,"unit_price":100,"amount":100}]'::jsonb);

INSERT INTO public.payments (id, invoice_id, amount, payment_date, currency, exchange_rate)
VALUES ('66666666-0000-4000-8000-000000000031', '66666666-0000-4000-8000-000000000030', 50,
        public.today_mty(), 'USD', 18);

SELECT pg_temp.expect_true(
  'M-2 amount_mxn usa el tipo_cambio del pago cuando existe (50 x 18 = 900)',
  (SELECT amount_mxn FROM public.payments WHERE id = '66666666-0000-4000-8000-000000000031') = 900
);

UPDATE public.payments SET amount = 25 WHERE id = '66666666-0000-4000-8000-000000000031';

SELECT pg_temp.expect_true(
  'M-2 amount_mxn se recalcula al editar el importe (25 x 18 = 450)',
  (SELECT amount_mxn FROM public.payments WHERE id = '66666666-0000-4000-8000-000000000031') = 450
);

-- Canon vigente (trg_invoice_tipo_cambio_inmutable): el tipo_cambio sólo se
-- congela cuando la factura ya está timbrada (cfdi_uuid) o tiene pagos con REP
-- timbrado. Sin timbre, corregir el TC es una edición válida.
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.invoices SET tipo_cambio = 21
     WHERE id = '66666666-0000-4000-8000-000000000030';
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
    RAISE NOTICE 'detalle: %', SQLERRM;
  END;
  PERFORM pg_temp.expect_true('M-2 tipo_cambio editable sin timbre ni REP', v_ok);

  -- Con un REP timbrado el candado sí aplica.
  UPDATE public.payments
     SET rep_cfdi_status = 'stamped', rep_cfdi_uuid = gen_random_uuid()
   WHERE id = '66666666-0000-4000-8000-000000000031';
  v_ok := false;
  BEGIN
    UPDATE public.invoices SET tipo_cambio = 22
     WHERE id = '66666666-0000-4000-8000-000000000030';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM ILIKE '%tipo_cambio es inmutable%';
  END;
  PERFORM pg_temp.expect_true('M-2 tipo_cambio inmutable con REP timbrado', v_ok);
END $$;

ROLLBACK;
