-- Smoke SQL de fix-16 (panel y reportes financieros):
--   N-14 get_dashboard_stats expone utilization / maintenance_alerts
--   N-16 fleet_counts cuenta la ocupación actual y excluye equipos is_e2e
--   N-15 get_financial_kpis excluye fx_missing y expone overdue_fx_missing_count
--   N-19 trg_payment_amount_mxn prioriza el tipo de cambio del pago
--   N-20 report_revenue_by_month sin fallback 1:1 en pagos
--   psql -f supabase/tests/r_fix16_dashboard_finanzas_smoke.sql
-- Las lecturas de catálogo y las fixtures se ejecutan dentro de un ROLLBACK.

\set ON_ERROR_STOP on

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

-- N-14: el panel devuelve las llaves que consume el frontend.
SELECT pg_temp.expect_true(
  'N-14 get_dashboard_stats expone utilization',
  pg_temp.fndef('get_dashboard_stats') LIKE '%''utilization'',%'
);

SELECT pg_temp.expect_true(
  'N-14 get_dashboard_stats expone maintenance_alerts',
  pg_temp.fndef('get_dashboard_stats') LIKE '%''maintenance_alerts'',%'
);

-- N-16: una reserva confirmada hoy cuenta como ocupada, aun sin entrega.
DO $fixture$
DECLARE
  v_org uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_occupied_unit uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Flota del smoke del Panel', 'smoke-dashboard-' || v_org);
  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin, 'dashboard-' || v_admin || '@example.invalid', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org, v_admin, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.forklifts (id, name, model, status, organization_id)
  VALUES (v_occupied_unit, 'Panel ocupado', 'Smoke', 'available', v_org),
         (gen_random_uuid(), 'Panel disponible', 'Smoke', 'available', v_org);
  INSERT INTO public.customers (id, name)
  VALUES (v_customer, 'Cliente smoke del Panel');
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org, v_customer);
  INSERT INTO public.bookings (
    forklift_id, customer_id, start_date, end_date, booking_number, status, organization_id
  ) VALUES (
    v_occupied_unit, v_customer, public.today_mty() - 1, public.today_mty() + 1,
    'RES-SMOKE-PANEL', 'confirmed', v_org
  );

  PERFORM set_config('app.e2e_seed', 'on', true);
  INSERT INTO public.forklifts (name, model, status, organization_id, is_e2e, e2e_scope)
  VALUES ('Panel E2E', 'Smoke', 'available', v_org, true, 'smoke-dashboard');
  PERFORM set_config('app.e2e_seed', 'off', true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
END;
$fixture$;

SET LOCAL ROLE authenticated;
DO $check$
DECLARE
  v_counts jsonb := public.get_dashboard_stats()::jsonb -> 'fleet_counts';
BEGIN
  IF v_counts IS DISTINCT FROM
    '{"total":2,"available":1,"rented":1,"maintenance":0,"retired":0,"sold":0}'::jsonb THEN
    RAISE EXCEPTION 'N-16: se esperaba 1 equipo ocupado y 1 disponible, sin E2E. Resultado: %', v_counts;
  END IF;
END;
$check$;
RESET ROLE;

-- N-16: las agregaciones del panel excluyen documentos de prueba.
SELECT pg_temp.expect_true(
  'N-16 get_dashboard_stats excluye is_e2e',
  pg_temp.fndef('get_dashboard_stats') LIKE '%is_e2e IS NOT TRUE%'
);

-- N-15: cartera vencida sin facturas en divisa sin tipo de cambio.
SELECT pg_temp.expect_true(
  'N-15 get_financial_kpis excluye fx_missing',
  pg_temp.fndef('get_financial_kpis') LIKE '%fx_missing IS NOT TRUE%'
);

SELECT pg_temp.expect_true(
  'N-15 get_financial_kpis expone overdue_fx_missing_count',
  pg_temp.fndef('get_financial_kpis') LIKE '%overdue_fx_missing_count%'
);

-- N-19: precedencia FX — primero el pago, luego la factura.
SELECT pg_temp.expect_true(
  'N-19 trg_payment_amount_mxn prioriza NEW.exchange_rate',
  pg_temp.fndef('trg_payment_amount_mxn')
    LIKE '%COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(v_tipo_cambio, 0))%'
);

-- N-20: el bloque de pagos ya no cae a 1:1.
SELECT pg_temp.expect_true(
  'N-20 report_revenue_by_month sin fallback 1:1 en pagos',
  pg_temp.fndef('report_revenue_by_month')
    NOT LIKE '%COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0), 1)%'
);

SELECT pg_temp.expect_true(
  'N-20 report_revenue_by_month marca fx_missing en pagos',
  pg_temp.fndef('report_revenue_by_month') LIKE '%BOOL_OR(%'
);

-- Guardias de seguridad: las funciones del Panel no admiten EXECUTE para anon.
SELECT pg_temp.expect_true(
  'fix-16 funciones sin EXECUTE para anon',
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_dashboard_stats', 'get_financial_kpis', 'report_revenue_by_month')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  )
);

ROLLBACK;
