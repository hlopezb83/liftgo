-- Smoke SQL de fix-11 (conciliación bancaria):
--   N-4  confirm_bank_match convierte el monto del pago a la moneda de la cuenta
--   N-25 confirm_bank_match rechaza si el signo no corresponde al tipo de pago
--   N-5  get_bank_match_candidates convierte los pagos a proveedor con el TC
--   N-23 bank_statement_lines.line_seq existe como discriminador de dedup
--   psql -f supabase/tests/r_fix11_conciliacion_smoke.sql
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
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name
  LIMIT 1;
$$;

-- N-4: la confirmación convierte con el tipo de cambio y avisa si falta.
SELECT pg_temp.expect_true(
  'N-4 confirm_bank_match usa el tipo de cambio del pago de cliente',
  pg_temp.fndef('confirm_bank_match') ILIKE '%p.exchange_rate%'
);
SELECT pg_temp.expect_true(
  'N-4 confirm_bank_match usa el tipo de cambio de la factura del proveedor',
  pg_temp.fndef('confirm_bank_match') ILIKE '%sb.exchange_rate%'
);
SELECT pg_temp.expect_true(
  'N-4 confirm_bank_match lee la moneda de la cuenta bancaria',
  pg_temp.fndef('confirm_bank_match') ILIKE '%bank_accounts%'
);

-- N-25: validación de signo contra el tipo de pago.
SELECT pg_temp.expect_true(
  'N-25 confirm_bank_match valida el signo del movimiento',
  pg_temp.fndef('confirm_bank_match') ILIKE '%no corresponde al tipo de pago%'
);

-- N-5: la rama de proveedores ya convierte moneda.
SELECT pg_temp.expect_true(
  'N-5 get_bank_match_candidates convierte los pagos a proveedor',
  pg_temp.fndef('get_bank_match_candidates') ILIKE '%sb.exchange_rate%'
);

-- Guards de rol y permisos (reglas permanentes).
SELECT pg_temp.expect_true(
  'confirm_bank_match conserva el guard de rol admin/administrativo',
  pg_temp.fndef('confirm_bank_match') ILIKE '%has_role%'
);
SELECT pg_temp.expect_true(
  'anon no puede ejecutar confirm_bank_match',
  NOT has_function_privilege('anon', 'public.confirm_bank_match(uuid,uuid,uuid)', 'EXECUTE')
);
SELECT pg_temp.expect_true(
  'anon no puede ejecutar get_bank_match_candidates',
  NOT has_function_privilege('anon', 'public.get_bank_match_candidates(uuid,text,integer,numeric)', 'EXECUTE')
);

-- N-23: existe el discriminador de deduplicación.
SELECT pg_temp.expect_true(
  'N-23 bank_statement_lines.line_seq existe',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bank_statement_lines'
      AND column_name = 'line_seq'
  )
);

ROLLBACK;
