-- Multiempresa · Tramos 6-8: unicidad de catálogos por organización.
--
-- Verifica el contrato que deja la migración Drizzle 0029, con DOS empresas
-- reales (A = la organización inicial, B = una organización creada aquí):
--   1) Positivo A/B: la misma clave se registra en A y en B sin error.
--   2) Negativo dentro de A: repetir la clave en la misma empresa sigue
--      fallando con unique_violation.
--   3) Aislamiento: un administrador interno de A no lee ni modifica las
--      filas de B (las policies org_scope_isolation no cambian).
--   4) Soft delete: en flota y proveedores, borrar lógicamente libera la
--      clave dentro de la misma empresa.
--   5) Folios: REP de pagos y folio de reportes admiten el mismo valor en
--      A y en B, y lo siguen rechazando dentro de la misma empresa.
--   6) Los índices/constraints globales ya no existen y los nuevos sí.
--
-- No cambia policies, grants ni funciones: solo ejercita el contrato.
BEGIN;

-- ── 0. Estado esperado del catálogo tras 0029 ────────────────────────
DO $$
DECLARE
  v_nombre text;
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_nombre IN ARRAY ARRAY[
    'forklifts_org_name_unique',
    'forklifts_org_serial_number_unique',
    'mechanics_org_name_unique',
    'drivers_org_name_unique',
    'parts_inventory_org_sku_unique',
    'prospects_org_stage_order_uniq',
    'payments_org_rep_number_uidx',
    'suppliers_org_rfc_unique_idx'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_nombre
        AND i.indisunique AND i.indisvalid
    ) THEN
      v_fallas := v_fallas || (v_nombre || ' -> falta el índice único por empresa');
    END IF;
  END LOOP;

  FOREACH v_nombre IN ARRAY ARRAY[
    'forklifts_name_unique',
    'forklifts_serial_number_unique',
    'mechanics_name_unique',
    'drivers_name_unique',
    'parts_inventory_sku_unique',
    'prospects_stage_order_uniq',
    'payments_rep_number_uidx',
    'suppliers_rfc_unique_idx',
    'feedback_reports_folio_key'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_nombre
    ) THEN
      v_fallas := v_fallas || (v_nombre || ' -> el objeto global sigue presente');
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.feedback_reports'::regclass
      AND conname = 'feedback_reports_organization_folio_key'
  ) THEN
    v_fallas := v_fallas || 'feedback_reports_organization_folio_key -> falta el par por empresa';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'UNICIDAD 0029: catálogo de índices inesperado:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;

-- ── 1. Alta de las dos empresas y sus datos base ─────────────────────
DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid := '29000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '29000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '29000000-0000-4000-8000-0000000000b1';
  v_cust_a uuid := '29000000-0000-4000-8000-0000000000c1';
  v_cust_b uuid := '29000000-0000-4000-8000-0000000000c2';
BEGIN
  SELECT id INTO v_org_a
  FROM public.organizations WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;
  PERFORM set_config('app.unique_ab.org_a', v_org_a::text, true);

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Organización B de unicidad', 'uniq-org-b');

  -- Con DOS organizaciones activas ya no hay empresa "única" que adivinar:
  -- toda escritura sin membresía (incluidos profiles y audit_logs que crea
  -- handle_new_user) necesita app.organization_id explícito. Por eso cada
  -- alta de usuario se hace dentro del contexto de su propia empresa.
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_a, 'admin-a@uniq.test', now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_admin_a, 'internal');

  INSERT INTO public.profiles (user_id, full_name, is_active)
  VALUES (v_admin_a, 'Admin A unicidad', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  PERFORM set_config('app.organization_id', v_org_b::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'admin-b@uniq.test', now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_admin_b, 'internal');

  INSERT INTO public.profiles (user_id, full_name, is_active)
  VALUES (v_admin_b, 'Admin B unicidad', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Clientes: identidad global (no cambia en este tramo), con relación
  -- comercial en cada empresa.
  INSERT INTO public.customers (id, name)
  VALUES (v_cust_a, 'Cliente unicidad A'), (v_cust_b, 'Cliente unicidad B');
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, v_cust_a), (v_org_b, v_cust_b)
  ON CONFLICT (organization_id, customer_id) DO NOTHING;
END;
$$;

-- ── 2. Positivo A/B: la misma clave convive en dos empresas ──────────
DO $$
DECLARE
  v_org_a uuid := current_setting('app.unique_ab.org_a')::uuid;
  v_org_b uuid := '29000000-0000-4000-8000-0000000000b0';
BEGIN
  INSERT INTO public.forklifts (id, organization_id, name, model, serial_number, status) VALUES
    ('29000000-0000-4000-8000-0000000000f1', v_org_a, 'MC-UNICO-01', 'M1', 'SER-UNICO-01', 'available'),
    ('29000000-0000-4000-8000-0000000000f2', v_org_b, 'MC-UNICO-01', 'M1', 'SER-UNICO-01', 'available');

  INSERT INTO public.mechanics (id, organization_id, name) VALUES
    ('29000000-0000-4000-8000-0000000000m1', v_org_a, 'Mecánico Unicidad'),
    ('29000000-0000-4000-8000-0000000000m2', v_org_b, 'Mecánico Unicidad');

  INSERT INTO public.drivers (id, organization_id, name) VALUES
    ('29000000-0000-4000-8000-0000000000d1', v_org_a, 'Operador Unicidad'),
    ('29000000-0000-4000-8000-0000000000d2', v_org_b, 'Operador Unicidad');

  INSERT INTO public.parts_inventory (id, organization_id, name, sku) VALUES
    ('29000000-0000-4000-8000-0000000000e1', v_org_a, 'Filtro unicidad', 'SKU-UNICO-01'),
    ('29000000-0000-4000-8000-0000000000e2', v_org_b, 'Filtro unicidad', 'SKU-UNICO-01');

  INSERT INTO public.prospects (id, organization_id, company_name, stage, stage_order) VALUES
    ('29000000-0000-4000-8000-0000000000p1', v_org_a, 'Prospecto unicidad A', 'unicidad-ab', 900),
    ('29000000-0000-4000-8000-0000000000p2', v_org_b, 'Prospecto unicidad B', 'unicidad-ab', 900);

  INSERT INTO public.suppliers (id, organization_id, name, rfc) VALUES
    ('29000000-0000-4000-8000-0000000000s1', v_org_a, 'Proveedor unicidad A', ' aaa010101aaa '),
    ('29000000-0000-4000-8000-0000000000s2', v_org_b, 'Proveedor unicidad B', 'AAA010101AAA');

  RAISE NOTICE 'OK: catálogos operativos y proveedores admiten la misma clave en A y B';
END;
$$;

-- ── 3. Negativo dentro de A: la clave sigue siendo única por empresa ──
DO $$
DECLARE
  v_org_a uuid := current_setting('app.unique_ab.org_a')::uuid;
  v_fallas text[] := '{}';

BEGIN
  BEGIN
    INSERT INTO public.forklifts (organization_id, name, model, status)
    VALUES (v_org_a, 'MC-UNICO-01', 'M1', 'available');
    v_fallas := v_fallas || 'forklifts(name): se aceptó un duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.forklifts (organization_id, name, model, serial_number, status)
    VALUES (v_org_a, 'MC-UNICO-02', 'M1', 'SER-UNICO-01', 'available');
    v_fallas := v_fallas || 'forklifts(serial_number): se aceptó un duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.mechanics (organization_id, name) VALUES (v_org_a, 'Mecánico Unicidad');
    v_fallas := v_fallas || 'mechanics(name): se aceptó un duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.drivers (organization_id, name) VALUES (v_org_a, 'Operador Unicidad');
    v_fallas := v_fallas || 'drivers(name): se aceptó un duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.parts_inventory (organization_id, name, sku)
    VALUES (v_org_a, 'Filtro unicidad bis', 'SKU-UNICO-01');
    v_fallas := v_fallas || 'parts_inventory(sku): se aceptó un duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.prospects (organization_id, company_name, stage, stage_order)
    VALUES (v_org_a, 'Prospecto duplicado', 'unicidad-ab', 900);
    v_fallas := v_fallas || 'prospects(stage,stage_order): se aceptó un duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    -- Mismo RFC normalizado (mayúsculas y espacios) dentro de la misma empresa.
    INSERT INTO public.suppliers (organization_id, name, rfc)
    VALUES (v_org_a, 'Proveedor duplicado A', 'AAA010101AAA');
    v_fallas := v_fallas || 'suppliers(rfc): se aceptó un duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'UNICIDAD 0029: la clave dejó de ser única dentro de una empresa:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: duplicados dentro de la misma empresa siguen rechazados';
END;
$$;

-- ── 4. Soft delete libera la clave dentro de la misma empresa ────────
DO $$
DECLARE
  v_org_a uuid := current_setting('app.unique_ab.org_a')::uuid;
BEGIN
  UPDATE public.forklifts SET deleted_at = now()
  WHERE id = '29000000-0000-4000-8000-0000000000f1';
  INSERT INTO public.forklifts (organization_id, name, model, serial_number, status)
  VALUES (v_org_a, 'MC-UNICO-01', 'M1', 'SER-UNICO-01', 'available');

  UPDATE public.suppliers SET deleted_at = now()
  WHERE id = '29000000-0000-4000-8000-0000000000s1';
  INSERT INTO public.suppliers (organization_id, name, rfc)
  VALUES (v_org_a, 'Proveedor unicidad A bis', 'AAA010101AAA');

  RAISE NOTICE 'OK: el borrado lógico libera la clave en flota y proveedores';
END;
$$;

-- ── 5. Folios: REP de pagos y folio de reportes ──────────────────────
DO $$
DECLARE
  v_org_a uuid := current_setting('app.unique_ab.org_a')::uuid;
  v_org_b uuid := '29000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '29000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '29000000-0000-4000-8000-0000000000b1';
  v_fallas text[] := '{}';
BEGIN
  INSERT INTO public.invoices
    (id, organization_id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, line_items)
  VALUES
    ('29000000-0000-4000-8000-0000000000i1', v_org_a, 'FAC-UNIQ-A',
     '29000000-0000-4000-8000-0000000000c1', 'Cliente unicidad A', 1000, 0, 1000, 'sent',
     '[{"description":"Renta unicidad A","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb),
    ('29000000-0000-4000-8000-0000000000i2', v_org_b, 'FAC-UNIQ-B',
     '29000000-0000-4000-8000-0000000000c2', 'Cliente unicidad B', 1000, 0, 1000, 'sent',
     '[{"description":"Renta unicidad B","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb);

  -- Positivo A/B: el mismo folio REP en dos empresas.
  INSERT INTO public.payments (id, organization_id, invoice_id, amount, rep_number) VALUES
    ('29000000-0000-4000-8000-00000000000a', v_org_a, '29000000-0000-4000-8000-0000000000i1', 100, 'CP-0001'),
    ('29000000-0000-4000-8000-00000000000b', v_org_b, '29000000-0000-4000-8000-0000000000i2', 100, 'CP-0001');

  -- Negativo dentro de A.
  BEGIN
    INSERT INTO public.payments (organization_id, invoice_id, amount, rep_number)
    VALUES (v_org_a, '29000000-0000-4000-8000-0000000000i1', 50, 'CP-0001');
    v_fallas := v_fallas || 'payments(rep_number): se aceptó un folio REP duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- Reportes: mismo folio en A y B, duplicado rechazado dentro de A.
  INSERT INTO public.feedback_reports
    (id, organization_id, reporter_id, reporter_type, type, title, description, folio)
  VALUES
    ('29000000-0000-4000-8000-0000000000r1', v_org_a, v_admin_a, 'internal', 'bug',
     'Reporte unicidad A', 'Descripción A', 'RPT-0001'),
    ('29000000-0000-4000-8000-0000000000r2', v_org_b, v_admin_b, 'internal', 'bug',
     'Reporte unicidad B', 'Descripción B', 'RPT-0001');

  BEGIN
    INSERT INTO public.feedback_reports
      (organization_id, reporter_id, reporter_type, type, title, description, folio)
    VALUES (v_org_a, v_admin_a, 'internal', 'bug', 'Reporte duplicado', 'Descripción', 'RPT-0001');
    v_fallas := v_fallas || 'feedback_reports(folio): se aceptó un folio duplicado dentro de A';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'UNICIDAD 0029: los folios dejaron de ser únicos dentro de una empresa:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: folio REP y folio de reportes son propios de cada empresa';
END;
$$;

-- ── 6. Aislamiento: el administrador de A no alcanza las filas de B ──
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"29000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_visibles integer;
  v_tocadas integer;
BEGIN
  IF public.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'CONTEXTO: el admin interno debe resolver la organización A';
  END IF;

  SELECT
      (SELECT count(*) FROM public.forklifts WHERE id = '29000000-0000-4000-8000-0000000000f2')
    + (SELECT count(*) FROM public.mechanics WHERE id = '29000000-0000-4000-8000-0000000000m2')
    + (SELECT count(*) FROM public.drivers   WHERE id = '29000000-0000-4000-8000-0000000000d2')
    + (SELECT count(*) FROM public.parts_inventory WHERE id = '29000000-0000-4000-8000-0000000000e2')
    + (SELECT count(*) FROM public.prospects WHERE id = '29000000-0000-4000-8000-0000000000p2')
    + (SELECT count(*) FROM public.suppliers WHERE id = '29000000-0000-4000-8000-0000000000s2')
    + (SELECT count(*) FROM public.payments  WHERE id = '29000000-0000-4000-8000-00000000000b')
    + (SELECT count(*) FROM public.feedback_reports WHERE id = '29000000-0000-4000-8000-0000000000r2')
  INTO v_visibles;

  IF v_visibles <> 0 THEN
    RAISE EXCEPTION 'AISLAMIENTO: el admin de A alcanza % filas de B (esperado 0)', v_visibles;
  END IF;

  BEGIN
    WITH tocadas AS (
      UPDATE public.forklifts SET name = 'INTENTO CRUZADO'
      WHERE id = '29000000-0000-4000-8000-0000000000f2'
      RETURNING 1
    )
    SELECT count(*) INTO v_tocadas FROM tocadas;
  EXCEPTION WHEN insufficient_privilege THEN
    v_tocadas := 0;
  END;

  IF v_tocadas <> 0 THEN
    RAISE EXCEPTION 'AISLAMIENTO: el admin de A modificó la flota de B';
  END IF;

  -- Y sigue viendo lo suyo.
  IF NOT EXISTS (SELECT 1 FROM public.mechanics WHERE id = '29000000-0000-4000-8000-0000000000m1') THEN
    RAISE EXCEPTION 'AISLAMIENTO: el admin de A dejó de ver su propio catálogo';
  END IF;

  RAISE NOTICE 'OK: A no lee ni altera los catálogos de B';
END;
$$;

ROLLBACK;
