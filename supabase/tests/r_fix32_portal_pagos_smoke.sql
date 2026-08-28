-- Smoke SQL de fix-32 (ronda R6):
--   R6-04 approve_payment_intent: FOR UPDATE, conversión FX, intents pendientes, NC canónicas
--   R6-09 validate_payment_intent_amount: conversión FX de pagos
--   R6-10 conciliación bancaria con fallback a invoices.tipo_cambio
--   R6-15 policy INSERT de customer_payment_intents (facturas vigentes + carpeta de factura)
--   R6-14 DELETE de comprobantes bloqueado para intents ya procesados (todos los roles)
--   R6-24 mimetype declarado obligatorio en la subida
--   R6-05 bucket payment-proofs privado y con límite de tamaño
--   psql -f supabase/tests/r_fix32_portal_pagos_smoke.sql
-- Solo lecturas de catálogo: no toca datos.

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

CREATE OR REPLACE FUNCTION pg_temp.poldef(p_schema text, p_table text, p_policy text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(coalesce(qual, '') || ' | ' || coalesce(with_check, ''), '')
  FROM pg_policies
  WHERE schemaname = p_schema AND tablename = p_table AND policyname = p_policy;
$$;

-- R6-04
SELECT pg_temp.expect_true(
  'R6-04 approve_payment_intent bloquea la factura (FOR UPDATE)',
  pg_temp.fndef('approve_payment_intent') ILIKE '%FROM public.invoices WHERE id = v_intent.invoice_id%FOR UPDATE%'
);
SELECT pg_temp.expect_true(
  'R6-04 approve_payment_intent convierte pagos con tipo de cambio',
  pg_temp.fndef('approve_payment_intent') ILIKE '%NULLIF(p.exchange_rate, 0), NULLIF(v_invoice_exchange, 0)%'
);
SELECT pg_temp.expect_true(
  'R6-04 approve_payment_intent descuenta intents pending_review',
  pg_temp.fndef('approve_payment_intent') ILIKE '%v_invoice_total - v_paid - v_credited - v_pending%'
);
SELECT pg_temp.expect_true(
  'R6-04 approve_payment_intent usa criterio canónico de notas de crédito',
  pg_temp.fndef('approve_payment_intent') ILIKE '%cancellation_status IS DISTINCT FROM ''accepted''%'
    AND pg_temp.fndef('approve_payment_intent') ILIKE '%status <> ''cancelled''%'
);
SELECT pg_temp.expect_true(
  'R6-04 el pago generado no falsea el tipo de cambio',
  pg_temp.fndef('approve_payment_intent') ILIKE '%v_invoice_currency, NULL%'
);

-- R6-09
SELECT pg_temp.expect_true(
  'R6-09 validate_payment_intent_amount lee moneda y tipo de cambio',
  pg_temp.fndef('validate_payment_intent_amount') ILIKE '%upper(COALESCE(i.moneda, ''MXN''))%'
);
SELECT pg_temp.expect_true(
  'R6-09 validate_payment_intent_amount convierte los pagos',
  pg_temp.fndef('validate_payment_intent_amount') ILIKE '%NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)%'
);

-- R6-10
SELECT pg_temp.expect_true(
  'R6-10 confirm_bank_match usa el TC de la factura como fallback',
  pg_temp.fndef('confirm_bank_match') ILIKE '%NULLIF(i.tipo_cambio, 0)%'
    AND pg_temp.fndef('confirm_bank_match') ILIKE '%LEFT JOIN public.invoices i%'
);
SELECT pg_temp.expect_true(
  'R6-10 get_bank_match_candidates usa el TC de la factura como fallback',
  pg_temp.fndef('get_bank_match_candidates') ILIKE '%NULLIF(i.tipo_cambio, 0)%'
);

-- R6-15
SELECT pg_temp.expect_true(
  'R6-15 la policy INSERT excluye facturas canceladas/borrador',
  pg_temp.poldef('public', 'customer_payment_intents', 'Customers create own payment intents')
    ILIKE '%cancelled%draft%'
);
SELECT pg_temp.expect_true(
  'R6-15 la policy INSERT exige la carpeta de la factura',
  pg_temp.poldef('public', 'customer_payment_intents', 'Customers create own payment intents')
    ILIKE '%foldername(proof_url))[2]%'
);

-- R6-14
SELECT pg_temp.expect_true(
  'R6-14 el DELETE de comprobantes procesados no depende del rol',
  pg_temp.poldef('storage', 'objects', 'Customers delete own pending proofs')
    NOT ILIKE '%cpi.customer_id = get_customer_id_for_user%'
);
SELECT pg_temp.expect_true(
  'R6-14 el DELETE sigue protegiendo intents fuera de pending_review',
  pg_temp.poldef('storage', 'objects', 'Customers delete own pending proofs')
    ILIKE '%status <> ''pending_review''%'
);

-- R6-24
SELECT pg_temp.expect_true(
  'R6-24 la subida ya no acepta mimetype ausente',
  pg_temp.poldef('storage', 'objects', 'Customers upload own proofs') NOT ILIKE '%COALESCE((metadata ->> ''mimetype''%'
);

-- R6-05
SELECT pg_temp.expect_true(
  'R6-05 bucket payment-proofs privado y con límite de tamaño',
  EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'payment-proofs' AND public = false AND file_size_limit IS NOT NULL
  )
);

ROLLBACK;
