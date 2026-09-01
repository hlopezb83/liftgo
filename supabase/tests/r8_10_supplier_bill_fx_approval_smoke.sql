-- Smoke SQL de R8-10: la aprobación de facturas de proveedor falla en seguro
-- cuando falta el tipo de cambio en moneda extranjera.
--   psql -f supabase/tests/r8_10_supplier_bill_fx_approval_smoke.sql
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

-- Inserta una factura simulando un usuario autenticado y devuelve el
-- approval_status resultante.
CREATE OR REPLACE FUNCTION pg_temp.status_of(
  p_currency text, p_rate numeric, p_total numeric
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_status text; v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user)::text, true);

  INSERT INTO public.supplier_bills
    (bill_number, issue_date, subtotal, tax_amount, total, status, currency, exchange_rate)
  VALUES
    ('SMOKE-R8-10-' || gen_random_uuid()::text, public.today_mty(),
     p_total, 0, p_total, 'pending', p_currency, p_rate)
  RETURNING id INTO v_id;

  SELECT approval_status::text INTO v_status FROM public.supplier_bills WHERE id = v_id;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN v_status;
END; $$;

-- El umbral vigente (default 10000).
DO $$
DECLARE
  v_thr numeric;
BEGIN
  SELECT COALESCE((SELECT cxp_approval_threshold_mxn
                     FROM public.company_settings ORDER BY created_at ASC LIMIT 1), 10000)
    INTO v_thr;

  -- 1) MXN conserva el comportamiento por umbral (la columna exchange_rate es
  --    NOT NULL en la tabla, por eso el caso NULL solo se prueba en fx_is_missing).
  PERFORM pg_temp.expect_true('R8-10 MXN bajo umbral => not_required',
    pg_temp.status_of('MXN', 1, v_thr - 1) = 'not_required');
  PERFORM pg_temp.expect_true('R8-10 MXN sobre umbral => pending',
    pg_temp.status_of('MXN', 1, v_thr + 1) = 'pending');

  -- 2) USD con TC válido: usa el total convertido a MXN.
  PERFORM pg_temp.expect_true('R8-10 USD TC=20 bajo umbral => not_required',
    pg_temp.status_of('USD', 20, (v_thr / 20) - 1) = 'not_required');
  PERFORM pg_temp.expect_true('R8-10 USD TC=20 sobre umbral => pending',
    pg_temp.status_of('USD', 20, (v_thr / 20) + 1) = 'pending');

  -- 3) USD sin TC válido: siempre pending (fail closed), aun con montos chicos.
  PERFORM pg_temp.expect_true('R8-10 USD TC 0 => pending',
    pg_temp.status_of('USD', 0, 1) = 'pending');
  PERFORM pg_temp.expect_true('R8-10 USD TC negativo => pending',
    pg_temp.status_of('USD', -18, 1) = 'pending');
  PERFORM pg_temp.expect_true('R8-10 USD TC = 1 (centinela) => pending',
    pg_temp.status_of('USD', 1, 1) = 'pending');
END $$;

-- 4) La regla canónica cubre también el TC nulo.
SELECT pg_temp.expect_true('R8-10 fx_is_missing: matriz canónica',
  public.fx_is_missing('MXN', NULL) = false
  AND public.fx_is_missing('MXN', 1) = false
  AND public.fx_is_missing('USD', NULL) = true
  AND public.fx_is_missing('USD', 0) = true
  AND public.fx_is_missing('USD', -18) = true
  AND public.fx_is_missing('USD', 1) = true
  AND public.fx_is_missing('USD', 20) = false);

-- 5) La regla canónica sigue siendo public.fx_is_missing.
SELECT pg_temp.expect_true(
  'R8-10 el trigger usa public.fx_is_missing',
  pg_get_functiondef(p.oid) ILIKE '%fx_is_missing%'
  AND pg_get_functiondef(p.oid) NOT ILIKE '%COALESCE(NEW.exchange_rate, 1)%'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_supplier_bill_approval_status';

-- 6) No se tocaron las demás transiciones: la factura no puede nacer aprobada.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', (SELECT id FROM auth.users LIMIT 1))::text, true);
  BEGIN
    INSERT INTO public.supplier_bills
      (bill_number, issue_date, subtotal, tax_amount, total, status, approval_status)
    VALUES ('SMOKE-R8-10-APR', public.today_mty(), 100, 16, 116, 'pending', 'approved');
    RAISE WARNING 'FALLO  R8-10 alta pre-aprobada debió fallar';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK  R8-10 alta pre-aprobada sigue bloqueada -> %', SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

ROLLBACK;
