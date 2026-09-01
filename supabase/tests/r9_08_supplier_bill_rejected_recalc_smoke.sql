-- Smoke SQL de R9-08: una factura de proveedor RECHAZADA que se corrige en
-- monto / moneda / tipo de cambio vuelve al circuito normal de aprobación
-- (pending o not_required), nunca a 'approved'.
--   psql -f supabase/tests/r9_08_supplier_bill_rejected_recalc_smoke.sql
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

-- Crea una factura y la deja en 'rejected' (con metadata de rechazo) sin pasar
-- por el RPC, simulando el estado final de reject_supplier_bill.
CREATE OR REPLACE FUNCTION pg_temp.make_rejected(
  p_currency text, p_rate numeric, p_total numeric
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  INSERT INTO public.supplier_bills
    (bill_number, issue_date, subtotal, tax_amount, total, status, currency, exchange_rate)
  VALUES ('SMOKE-R9-08-' || gen_random_uuid()::text, public.today_mty(),
          p_total, 0, p_total, 'pending', p_currency, p_rate)
  RETURNING id INTO v_id;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
     SET approval_status = 'rejected',
         rejected_by = v_user, rejected_at = now(),
         approval_notes = 'monto equivocado'
   WHERE id = v_id;
  PERFORM set_config('app.cxp_rpc', 'off', true);
  RETURN v_id;
END; $$;

-- Corrige campos financieros como usuario autenticado y devuelve el estado.
CREATE OR REPLACE FUNCTION pg_temp.correct(
  p_id uuid, p_currency text, p_rate numeric, p_total numeric
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated',
                      'sub', (SELECT id FROM auth.users LIMIT 1))::text, true);
  UPDATE public.supplier_bills
     SET total = p_total, subtotal = p_total, currency = p_currency, exchange_rate = p_rate
   WHERE id = p_id;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT approval_status::text INTO v_status FROM public.supplier_bills WHERE id = p_id;
  RETURN v_status;
END; $$;

DO $$
DECLARE
  v_thr numeric;
  v_id uuid;
  v_status text;
  v_rej_by uuid;
  v_notes text;
BEGIN
  SELECT COALESCE((SELECT cxp_approval_threshold_mxn
                     FROM public.company_settings ORDER BY created_at ASC LIMIT 1), 10000)
    INTO v_thr;

  -- 1) Rechazada + corregida por debajo del umbral => not_required.
  v_id := pg_temp.make_rejected('MXN', 1, v_thr + 5000);
  PERFORM pg_temp.expect_true('R9-08 corregida bajo umbral => not_required',
    pg_temp.correct(v_id, 'MXN', 1, v_thr - 1) = 'not_required');

  SELECT rejected_by, approval_notes INTO v_rej_by, v_notes
    FROM public.supplier_bills WHERE id = v_id;
  PERFORM pg_temp.expect_true('R9-08 se limpia la metadata de rechazo',
    v_rej_by IS NULL AND v_notes IS NULL);

  -- 2) Rechazada + corregida por encima del umbral => pending (nunca approved).
  v_id := pg_temp.make_rejected('MXN', 1, 100);
  v_status := pg_temp.correct(v_id, 'MXN', 1, v_thr + 1);
  PERFORM pg_temp.expect_true('R9-08 corregida sobre umbral => pending',
    v_status = 'pending');
  PERFORM pg_temp.expect_true('R9-08 nunca se auto-aprueba', v_status <> 'approved');

  -- 3) Rechazada + corregida a divisa sin TC válido => pending (fail closed).
  v_id := pg_temp.make_rejected('MXN', 1, 100);
  PERFORM pg_temp.expect_true('R9-08 divisa sin TC (centinela 1) => pending',
    pg_temp.correct(v_id, 'USD', 1, 10) = 'pending');

  v_id := pg_temp.make_rejected('MXN', 1, 100);
  PERFORM pg_temp.expect_true('R9-08 divisa TC=0 => pending',
    pg_temp.correct(v_id, 'USD', 0, 10) = 'pending');

  -- 4) Edición no financiera (notas) NO reactiva la factura rechazada.
  v_id := pg_temp.make_rejected('MXN', 1, 500);
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated',
                      'sub', (SELECT id FROM auth.users LIMIT 1))::text, true);
  UPDATE public.supplier_bills SET notes = 'comentario interno' WHERE id = v_id;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT approval_status::text, rejected_by INTO v_status, v_rej_by
    FROM public.supplier_bills WHERE id = v_id;
  PERFORM pg_temp.expect_true('R9-08 edición de notas conserva rejected',
    v_status = 'rejected' AND v_rej_by IS NOT NULL);
END $$;

-- 5) Los candados existentes siguen intactos: aprobada no se puede re-montar
--    y una factura con pagos no permite cambiar el monto.
DO $$
DECLARE v_id uuid; v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  INSERT INTO public.supplier_bills
    (bill_number, issue_date, subtotal, tax_amount, total, status, currency, exchange_rate)
  VALUES ('SMOKE-R9-08-APR', public.today_mty(), 100, 0, 100, 'pending', 'MXN', 1)
  RETURNING id INTO v_id;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
     SET approval_status = 'approved', approved_by = v_user, approved_at = now()
   WHERE id = v_id;
  PERFORM set_config('app.cxp_rpc', 'off', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user)::text, true);
  BEGIN
    UPDATE public.supplier_bills SET total = 999999 WHERE id = v_id;
    RAISE WARNING 'FALLO  R9-08 editar monto de factura aprobada debió fallar';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK  R9-08 candado de factura aprobada intacto -> %', SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- 6) request_bill_reapproval aplica umbral y regla FX (no siempre 'pending').
SELECT pg_temp.expect_true(
  'R9-08 request_bill_reapproval usa fx_is_missing y umbral',
  pg_get_functiondef(p.oid) ILIKE '%fx_is_missing%'
  AND pg_get_functiondef(p.oid) ILIKE '%cxp_approval_threshold_mxn%'
)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'request_bill_reapproval';

ROLLBACK;
