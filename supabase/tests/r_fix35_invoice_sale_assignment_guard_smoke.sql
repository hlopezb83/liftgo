-- Smoke del guard P1-B de facturación de ventas:
--   trg_guard_invoice_sale_assignment / public.guard_invoice_sale_assignment()
--   impide crear una factura ligada a una cotización con partidas de venta
--   ("... - Venta de equipo") cuyos equipos no estén completamente asignados,
--   aunque el INSERT venga directo de la base de datos y no de la UI.
--   La cobertura exigida es la misma de useQuoteSaleAssignmentStatus:
--   por cada partida de venta, #quote_assigned_forklifts(line_index) >= quantity.
--   Facturas sin cotización y cotizaciones de renta quedan sin cambios.
--
--   psql -f supabase/tests/r_fix35_invoice_sale_assignment_guard_smoke.sql
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

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name;
$$;

-- ---------------------------------------------------------------------------
-- 1. Contrato del guard (catálogo)
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_true(
  'existe el trigger BEFORE INSERT trg_guard_invoice_sale_assignment',
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'invoices'
      AND t.tgname = 'trg_guard_invoice_sale_assignment'
      AND (t.tgtype & 2) <> 0  -- BEFORE
      AND (t.tgtype & 4) <> 0  -- INSERT
  )
);

SELECT pg_temp.expect_true(
  'guard_invoice_sale_assignment es SECURITY DEFINER con search_path = public',
  pg_temp.fndef('guard_invoice_sale_assignment') LIKE '%SECURITY DEFINER%'
  AND pg_temp.fndef('guard_invoice_sale_assignment') LIKE '%search_path%public%'
);

SELECT pg_temp.expect_true(
  'quote_sale_units_unassigned es SECURITY DEFINER con search_path = public',
  pg_temp.fndef('quote_sale_units_unassigned') LIKE '%SECURITY DEFINER%'
  AND pg_temp.fndef('quote_sale_units_unassigned') LIKE '%search_path%public%'
);

SELECT pg_temp.expect_true(
  'el guard sólo actúa cuando la factura referencia una cotización',
  pg_temp.fndef('guard_invoice_sale_assignment') LIKE '%NEW.quote_id IS NULL%'
);

SELECT pg_temp.expect_true(
  'el guard conserva la convención de sembrado E2E',
  pg_temp.fndef('guard_invoice_sale_assignment') LIKE '%app.e2e_seed%'
);

SELECT pg_temp.expect_true(
  'los helpers no quedan expuestos a anon/authenticated',
  NOT has_function_privilege('anon', 'public.quote_sale_units_unassigned(uuid)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.quote_sale_units_unassigned(uuid)', 'execute')
);

-- ---------------------------------------------------------------------------
-- 2. Semántica de "asignación completa" (multi-partida y multi-unidad)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_cust uuid;
  v_sale uuid;
  v_rent uuid;
  v_f1 uuid; v_f2 uuid; v_f3 uuid;
  v_missing int;
  v_inv uuid;
  v_status_before text;
  v_asg_before int;
  v_ok boolean;
BEGIN
  INSERT INTO public.customers (name) VALUES ('ZZ Smoke fix35') RETURNING id INTO v_cust;

  INSERT INTO public.forklifts (name, model, status)
  VALUES ('ZZ-F1 fix35','M1','available') RETURNING id INTO v_f1;
  INSERT INTO public.forklifts (name, model, status)
  VALUES ('ZZ-F2 fix35','M1','available') RETURNING id INTO v_f2;
  INSERT INTO public.forklifts (name, model, status)
  VALUES ('ZZ-F3 fix35','M1','available') RETURNING id INTO v_f3;

  -- Cotización de venta: partida 0 con 2 unidades + partida 1 con 1 unidad
  -- (+ una partida de servicio que NO exige asignación).
  INSERT INTO public.quotes (quote_number, customer_id, customer_name, line_items)
  VALUES ('ZZ-COT-VENTA-fix35', v_cust, 'ZZ Smoke fix35', '[
    {"description":"LIFT GO FD50 - Venta de equipo","quantity":2,"unit_price":100,"total":200},
    {"description":"LIFT GO FB25 - Venta de equipo","quantity":1,"unit_price":100,"total":100},
    {"description":"Servicio de Logística","quantity":1,"unit_price":50,"total":50}
  ]'::jsonb)
  RETURNING id INTO v_sale;

  -- Cotización de renta: sin partidas de venta.
  INSERT INTO public.quotes (quote_number, customer_id, customer_name, line_items)
  VALUES ('ZZ-COT-RENTA-fix35', v_cust, 'ZZ Smoke fix35', '[
    {"description":"Renta mensual LIFT GO FD50","quantity":1,"unit_price":100,"total":100}
  ]'::jsonb)
  RETURNING id INTO v_rent;

  -- 2.1 sin asignación: faltan 3 unidades
  v_missing := public.quote_sale_units_unassigned(v_sale);
  PERFORM pg_temp.expect_true(
    'cotización de venta sin asignación: faltan 3 unidades (2+1)', v_missing = 3);

  PERFORM pg_temp.expect_true(
    'cotización de renta: no exige asignación',
    public.quote_sale_units_unassigned(v_rent) = 0);

  -- 3.1 INSERT directo rechazado sin asignación
  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_id, customer_name, quote_id)
    VALUES ('ZZ-F-fix35-a', v_cust, 'ZZ Smoke fix35', v_sale);
    v_ok := false;
  EXCEPTION WHEN sqlstate 'P0001' THEN
    v_ok := true;
  END;
  PERFORM pg_temp.expect_true(
    'INSERT directo de factura con cotización de venta sin asignar: rechazado P0001', v_ok);

  -- 2.2 asignación parcial (multi-unidad): 1 de 2 en la partida 0, 0 de 1 en la 1
  INSERT INTO public.quote_assigned_forklifts (quote_id, forklift_id, line_index)
  VALUES (v_sale, v_f1, 0);
  PERFORM pg_temp.expect_true(
    'asignación parcial multi-unidad: siguen faltando 2',
    public.quote_sale_units_unassigned(v_sale) = 2);

  v_status_before := (SELECT status FROM public.forklifts WHERE id = v_f1);
  v_asg_before := (SELECT count(*) FROM public.quote_assigned_forklifts WHERE quote_id = v_sale);

  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_id, customer_name, quote_id)
    VALUES ('ZZ-F-fix35-b', v_cust, 'ZZ Smoke fix35', v_sale);
    v_ok := false;
  EXCEPTION WHEN sqlstate 'P0001' THEN
    v_ok := true;
  END;
  PERFORM pg_temp.expect_true(
    'cotización de venta parcialmente asignada: factura rechazada', v_ok);

  -- 7. el guard no muta asignaciones ni estatus de unidades
  PERFORM pg_temp.expect_true(
    'el guard no modifica asignaciones ni el estatus del montacargas',
    v_asg_before = (SELECT count(*) FROM public.quote_assigned_forklifts WHERE quote_id = v_sale)
    AND v_status_before = (SELECT status FROM public.forklifts WHERE id = v_f1));

  -- 3.2 factura sin cotización: sin cambios
  INSERT INTO public.invoices (invoice_number, customer_id, customer_name)
  VALUES ('ZZ-F-fix35-c', v_cust, 'ZZ Smoke fix35') RETURNING id INTO v_inv;
  PERFORM pg_temp.expect_true('factura sin cotización: permitida', v_inv IS NOT NULL);

  -- 3.3 factura de cotización de renta: sin cambios
  INSERT INTO public.invoices (invoice_number, customer_id, customer_name, quote_id)
  VALUES ('ZZ-F-fix35-d', v_cust, 'ZZ Smoke fix35', v_rent) RETURNING id INTO v_inv;
  PERFORM pg_temp.expect_true('factura de cotización de renta: permitida', v_inv IS NOT NULL);

  -- 3.4 sembrado E2E exento (convención del repo)
  PERFORM set_config('app.e2e_seed', 'on', true);
  INSERT INTO public.invoices (invoice_number, customer_id, customer_name, quote_id)
  VALUES ('ZZ-F-fix35-e2e', v_cust, 'ZZ Smoke fix35', v_sale) RETURNING id INTO v_inv;
  PERFORM pg_temp.expect_true('sembrado E2E conserva su comportamiento', v_inv IS NOT NULL);
  PERFORM set_config('app.e2e_seed', '', true);

  -- 2.3 asignación completa -> factura permitida
  INSERT INTO public.quote_assigned_forklifts (quote_id, forklift_id, line_index)
  VALUES (v_sale, v_f2, 0), (v_sale, v_f3, 1);
  PERFORM pg_temp.expect_true(
    'cotización de venta totalmente asignada: 0 pendientes',
    public.quote_sale_units_unassigned(v_sale) = 0);

  INSERT INTO public.invoices (invoice_number, customer_id, customer_name, quote_id)
  VALUES ('ZZ-F-fix35-f', v_cust, 'ZZ Smoke fix35', v_sale) RETURNING id INTO v_inv;
  PERFORM pg_temp.expect_true(
    'cotización de venta completa: factura creada igual que antes', v_inv IS NOT NULL);
END $$;

ROLLBACK;
