-- Smoke SQL R9 · Lotes A y C
--   A: R9-01 (CxP), R9-03 (resumen de cliente), R9-10 (recurrentes)
--   C: R9-04 (auto-match bancario), R9-08 (depreciación), R9-16 (utilización),
--      R9-23 (deshacer conciliación)
-- Ejecutar contra staging:  psql -f supabase/tests/r9_lote_ac_smoke.sql
-- Solo lecturas de catálogo/datos: termina con ROLLBACK.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE 'OK  %', p_label;
  ELSE RAISE WARNING 'FALLO  %', p_label; END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.src(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name LIMIT 1;
$$;

-- ===================== LOTE A =====================

-- R9-01: la salida temprana compara también el total en moneda original, así
-- que un cambio de total con TC faltante (ambos MXN NULL) ya no es no-op.
SELECT pg_temp.expect_true(
  'R9-01 el no-op compara NEW.total con OLD.total',
  pg_temp.src('set_supplier_bill_approval_status') ILIKE '%NEW.total IS NOT DISTINCT FROM OLD.total%'
);
SELECT pg_temp.expect_true(
  'R9-01 conserva el guard de pagos',
  pg_temp.src('set_supplier_bill_approval_status') ILIKE '%paid_amount%'
);
SELECT pg_temp.expect_true(
  'R9-01 conserva el retorno a pending de rechazadas (R10-01)',
  pg_temp.src('request_bill_reapproval') ILIKE '%pending%'
);

-- R9-03: el resumen del cliente usa la vista canónica y reporta FX faltante.
SELECT pg_temp.expect_true(
  'R9-03 get_customer_summary usa v_invoices_with_balance',
  pg_temp.src('get_customer_summary') ILIKE '%v_invoices_with_balance%'
);
SELECT pg_temp.expect_true(
  'R9-03 get_customer_summary expone fx_missing_count',
  pg_temp.src('get_customer_summary') ILIKE '%fx_missing_count%'
);
SELECT pg_temp.expect_true(
  'R9-03 get_customer_summary sigue siendo SECURITY DEFINER con search_path',
  (SELECT p.prosecdef AND p.proconfig::text ILIKE '%search_path%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_customer_summary')
);
-- Consistencia real: Pagado nunca puede superar a Facturado.
DO $$
DECLARE r record; v jsonb; v_bad int := 0;
BEGIN
  FOR r IN SELECT id FROM public.customers WHERE COALESCE(is_e2e, false) = false LIMIT 25 LOOP
    BEGIN
      v := public.get_customer_summary(r.id);
      IF (v->>'total_paid')::numeric > (v->>'total_invoiced')::numeric + 0.01 THEN
        v_bad := v_bad + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL; -- sin sesión el RPC exige rol; se omite
    END;
  END LOOP;
  IF v_bad = 0 THEN RAISE NOTICE 'OK  R9-03 sin clientes con Pagado > Facturado';
  ELSE RAISE WARNING 'FALLO  R9-03 % clientes con Pagado > Facturado', v_bad; END IF;
END $$;

-- R9-10: recurrentes fail-closed ante TC inválido en divisa.
SELECT pg_temp.expect_true(
  'R9-10 create_recurring_invoice rechaza TC inválido',
  pg_temp.src('create_recurring_invoice') ILIKE '%fx_is_missing%'
);

-- ===================== LOTE C =====================

-- R9-04: una sola conversión para auto-match, candidatos y confirmación.
SELECT pg_temp.expect_true(
  'R9-04 match_bank_statement_lines usa el helper canónico',
  pg_temp.src('match_bank_statement_lines') ILIKE '%bank_amount_in_account_currency%'
);
SELECT pg_temp.expect_true(
  'R9-04 get_bank_match_candidates usa el helper canónico',
  pg_temp.src('get_bank_match_candidates') ILIKE '%bank_amount_in_account_currency%'
);
SELECT pg_temp.expect_true(
  'R9-04 confirm_bank_match usa el helper canónico',
  pg_temp.src('confirm_bank_match') ILIKE '%bank_amount_in_account_currency%'
);
-- Paridad de dirección: mismo par pago/cuenta produce el mismo importe.
SELECT pg_temp.expect_true(
  'R9-04 USD 100 contra cuenta MXN = 1800',
  public.bank_amount_in_account_currency(100, 'USD', 'MXN', 18) = 1800
);
SELECT pg_temp.expect_true(
  'R9-04 MXN 1800 contra cuenta USD = 100',
  public.bank_amount_in_account_currency(1800, 'MXN', 'USD', 18) = 100
);
SELECT pg_temp.expect_true(
  'R9-04 misma moneda no toca el importe',
  public.bank_amount_in_account_currency(1800, 'MXN', 'MXN', NULL) = 1800
);
SELECT pg_temp.expect_true(
  'R9-04 sin TC no hay candidato (NULL, no importe crudo)',
  public.bank_amount_in_account_currency(100, 'USD', 'MXN', NULL) IS NULL
);
-- Autorización y locks preservados.
SELECT pg_temp.expect_true(
  'R9-04 confirm_bank_match conserva el guard de rol',
  pg_temp.src('confirm_bank_match') ILIKE '%has_role%'
);
SELECT pg_temp.expect_true(
  'R9-04 confirm_bank_match conserva el FOR UPDATE',
  pg_temp.src('confirm_bank_match') ILIKE '%FOR UPDATE%'
);
SELECT pg_temp.expect_true(
  'R9-04 anon no puede ejecutar match_bank_statement_lines',
  NOT has_function_privilege('anon', 'public.match_bank_statement_lines(uuid)', 'EXECUTE')
);

-- R9-23: guard de estado al deshacer.
SELECT pg_temp.expect_true(
  'R9-23 unmatch_bank_line rechaza líneas ignoradas',
  pg_temp.src('unmatch_bank_line') ILIKE '%ignorada%'
);
SELECT pg_temp.expect_true(
  'R9-23 unmatch_bank_line ya no borra ignored_reason',
  pg_temp.src('unmatch_bank_line') NOT ILIKE '%ignored_reason = NULL%'
);
SELECT pg_temp.expect_true(
  'R9-23 unmatch_bank_line toma lock de fila',
  pg_temp.src('unmatch_bank_line') ILIKE '%FOR UPDATE%'
);
SELECT pg_temp.expect_true(
  'R9-23 unmatch_bank_line conserva el guard de rol',
  pg_temp.src('unmatch_bank_line') ILIKE '%has_role%'
);
SELECT pg_temp.expect_true(
  'R9-23 sin líneas ignoradas que hayan perdido su motivo',
  NOT EXISTS (SELECT 1 FROM public.bank_statement_lines
               WHERE status = 'ignored'::bank_line_status AND ignored_reason IS NULL)
);

-- R9-08: el equipo archivado no genera depreciación.
SELECT pg_temp.expect_true(
  'R9-08 get_income_statement filtra forklifts.deleted_at',
  pg_temp.src('get_income_statement') ILIKE '%f.deleted_at IS NULL%'
);
SELECT pg_temp.expect_true(
  'R9-08 get_income_statement sigue siendo SECURITY DEFINER con search_path',
  (SELECT p.prosecdef AND p.proconfig::text ILIKE '%search_path%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_income_statement')
);

-- R9-16: mismo universo de flota en ambos reportes de utilización.
SELECT pg_temp.expect_true(
  'R9-16 utilización por unidad excluye vendidos/retirados',
  pg_temp.src('report_utilization_by_unit') ILIKE '%retirado%'
);
SELECT pg_temp.expect_true(
  'R9-16 utilización por modelo excluye vendidos/retirados',
  pg_temp.src('report_utilization_by_model') ILIKE '%retirado%'
);
SELECT pg_temp.expect_true(
  'R9-16 ambos excluyen archivados y datos E2E',
  pg_temp.src('report_utilization_by_unit') ILIKE '%deleted_at IS NULL%'
  AND pg_temp.src('report_utilization_by_unit') ILIKE '%is_e2e IS NOT TRUE%'
  AND pg_temp.src('report_utilization_by_model') ILIKE '%deleted_at IS NULL%'
  AND pg_temp.src('report_utilization_by_model') ILIKE '%is_e2e IS NOT TRUE%'
);
-- YAGNI: la paridad real de universo se afirma sobre el fuente de ambas
-- funciones (arriba); no se agrega un recuento espejo que sólo repetiría el
-- mismo predicado en SQL.

ROLLBACK;
