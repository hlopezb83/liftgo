-- Multi-organización · tramo 4: prospectos y operaciones.
--
-- Comprueba, con dos organizaciones reales, que:
--   1) un usuario interno de A no lee ni modifica registros operativos de B;
--   2) un payload que envía organization_id de B se rechaza (42501) y una
--      inserción sin organización recibe la de A;
--   3) los IDs directos de B no filtran datos (0 filas, sin error de datos);
--   4) una cuenta de portal no alcanza operaciones internas;
--   5) los flujos válidos de A siguen funcionando.
--
-- No modifica policies ni triggers: sólo ejercita el contrato vigente.
BEGIN;

DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid := 'e7000000-0000-4000-8000-0000000000b1';
  v_staff_a uuid := 'e7000000-0000-4000-8000-0000000000a1';
  v_portal_b uuid := 'e7000000-0000-4000-8000-0000000000b2';
  v_customer uuid := 'e7000000-0000-4000-8000-0000000000c1';
BEGIN
  SELECT id INTO v_org_a
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Organización B de operaciones', 'ops-org-b');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_staff_a, 'staff-ops-a@rls.test', now(), now());

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_portal_b, 'portal-ops-b@rls.test', now(), now());

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  )
  VALUES
    (v_org_a, v_staff_a, 'internal'),
    (v_org_b, v_portal_b, 'portal');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_staff_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_portal_b, 'customer'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name)
  VALUES (v_customer, 'Cliente comercial compartido de operaciones');

  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, v_customer), (v_org_b, v_customer)
  ON CONFLICT (organization_id, customer_id) DO NOTHING;

  INSERT INTO public.customer_portal_accounts (
    organization_id, customer_id, auth_user_id, email
  )
  VALUES (v_org_b, v_customer, v_portal_b, 'portal-ops-b@rls.test');

  -- Datos operativos de B: el usuario de A nunca debe alcanzarlos.
  PERFORM set_config('app.organization_id', v_org_b::text, true);

  INSERT INTO public.forklifts (id, name, model, organization_id)
  VALUES ('e7000000-0000-4000-8000-0000000000d1', 'Unidad B', 'MB-1', v_org_b);

  INSERT INTO public.prospects (id, company_name, organization_id)
  VALUES ('e7000000-0000-4000-8000-0000000000d2', 'Prospecto B', v_org_b);

  INSERT INTO public.quotes (
    id, customer_id, quote_number, status, subtotal, tax_amount, total,
    organization_id
  )
  VALUES (
    'e7000000-0000-4000-8000-0000000000d3',
    v_customer, 'OPS-ORG-B', 'draft', 100, 0, 100, v_org_b
  );

  INSERT INTO public.bookings (
    id, customer_id, forklift_id, start_date, end_date, booking_number,
    organization_id
  )
  VALUES (
    'e7000000-0000-4000-8000-0000000000d4',
    v_customer, 'e7000000-0000-4000-8000-0000000000d1'::uuid,
    current_date, current_date + 5, 'OPS-B-0001', v_org_b
  );

  INSERT INTO public.contracts (
    id, booking_id, contract_number, organization_id
  )
  VALUES (
    'e7000000-0000-4000-8000-0000000000d5',
    'e7000000-0000-4000-8000-0000000000d4'::uuid, 'OPS-CTR-B', v_org_b
  );

  INSERT INTO public.damage_records (
    id, forklift_id, description, organization_id
  )
  VALUES (
    'e7000000-0000-4000-8000-0000000000d6',
    'e7000000-0000-4000-8000-0000000000d1'::uuid, 'Daño de B', v_org_b
  );

  INSERT INTO public.maintenance_logs (
    id, forklift_id, service_type, organization_id
  )
  VALUES (
    'e7000000-0000-4000-8000-0000000000d7',
    'e7000000-0000-4000-8000-0000000000d1'::uuid, 'preventivo', v_org_b
  );

  -- Una unidad válida de A para el flujo positivo.
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.forklifts (id, name, model, organization_id)
  VALUES ('e7000000-0000-4000-8000-0000000000e1', 'Unidad A', 'MA-1', v_org_a);
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"e7000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_org_a uuid := public.current_organization_id();
  v_org_b uuid := 'e7000000-0000-4000-8000-0000000000b1';
  v_visible integer;
  v_updated integer;
  v_new_prospect uuid := 'e7000000-0000-4000-8000-0000000000f1';
  v_assigned uuid;
BEGIN
  IF v_org_a IS NULL OR v_org_a = v_org_b THEN
    RAISE EXCEPTION 'CONTEXTO: el staff interno debe resolver la organización A';
  END IF;

  -- 1) y 3) Los IDs directos de B no devuelven datos en ninguna tabla operativa.
  SELECT
    (SELECT count(*) FROM public.forklifts WHERE id = 'e7000000-0000-4000-8000-0000000000d1')
    + (SELECT count(*) FROM public.prospects WHERE id = 'e7000000-0000-4000-8000-0000000000d2')
    + (SELECT count(*) FROM public.quotes WHERE id = 'e7000000-0000-4000-8000-0000000000d3')
    + (SELECT count(*) FROM public.bookings WHERE id = 'e7000000-0000-4000-8000-0000000000d4')
    + (SELECT count(*) FROM public.contracts WHERE id = 'e7000000-0000-4000-8000-0000000000d5')
    + (SELECT count(*) FROM public.damage_records WHERE id = 'e7000000-0000-4000-8000-0000000000d6')
    + (SELECT count(*) FROM public.maintenance_logs WHERE id = 'e7000000-0000-4000-8000-0000000000d7')
  INTO v_visible;

  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'OPS ORG: el staff de A alcanza % registros operativos de B (esperado 0)',
      v_visible;
  END IF;

  -- 1) Tampoco puede modificarlos con un ID directo.
  WITH touched AS (
    UPDATE public.prospects
    SET notes = 'intento cruzado'
    WHERE id = 'e7000000-0000-4000-8000-0000000000d2'
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM touched;

  IF v_updated <> 0 THEN
    RAISE EXCEPTION 'OPS ORG: el staff de A modificó un prospecto de B';
  END IF;

  WITH touched AS (
    UPDATE public.maintenance_logs
    SET description = 'intento cruzado'
    WHERE id = 'e7000000-0000-4000-8000-0000000000d7'
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM touched;

  IF v_updated <> 0 THEN
    RAISE EXCEPTION 'OPS ORG: el staff de A modificó un mantenimiento de B';
  END IF;

  -- 2) Un payload con la organización de B se rechaza sin escribir nada.
  BEGIN
    INSERT INTO public.prospects (id, company_name, organization_id)
    VALUES (
      'e7000000-0000-4000-8000-0000000000f2', 'Prospecto intruso', v_org_b
    );
    RAISE EXCEPTION
      'OPS ORG: un payload con organization_id de B debía rechazarse';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- 5) El flujo válido de A funciona y la empresa la asigna el trigger.
  INSERT INTO public.prospects (id, company_name)
  VALUES (v_new_prospect, 'Prospecto legítimo de A');

  SELECT organization_id INTO v_assigned
  FROM public.prospects
  WHERE id = v_new_prospect;

  IF v_assigned IS DISTINCT FROM v_org_a THEN
    RAISE EXCEPTION
      'OPS ORG: un alta sin organización debe quedar en A (obtuvo %)', v_assigned;
  END IF;

  -- 5) También en operaciones sobre su propia unidad.
  INSERT INTO public.maintenance_logs (id, forklift_id, service_type)
  VALUES (
    'e7000000-0000-4000-8000-0000000000f3',
    'e7000000-0000-4000-8000-0000000000e1'::uuid, 'preventivo'
  );

  SELECT organization_id INTO v_assigned
  FROM public.maintenance_logs
  WHERE id = 'e7000000-0000-4000-8000-0000000000f3';

  IF v_assigned IS DISTINCT FROM v_org_a THEN
    RAISE EXCEPTION
      'OPS ORG: un mantenimiento nuevo debe quedar en A (obtuvo %)', v_assigned;
  END IF;
END;
$$;

-- 4) Una cuenta de portal no alcanza operaciones internas, ni siquiera de su
--    propia organización.
SET LOCAL request.jwt.claims TO
  '{"sub":"e7000000-0000-4000-8000-0000000000b2","role":"authenticated"}';

DO $$
DECLARE
  v_visible integer;
  v_inserted integer;
BEGIN
  SELECT
    (SELECT count(*) FROM public.prospects)
    + (SELECT count(*) FROM public.maintenance_logs)
    + (SELECT count(*) FROM public.damage_records)
    + (SELECT count(*) FROM public.forklifts)
  INTO v_visible;

  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'PORTAL ORG: una cuenta de portal alcanza % registros internos (esperado 0)',
      v_visible;
  END IF;

  BEGIN
    WITH touched AS (
      INSERT INTO public.prospects (id, company_name)
      VALUES ('e7000000-0000-4000-8000-0000000000f4', 'Prospecto desde portal')
      RETURNING 1
    )
    SELECT count(*) INTO v_inserted FROM touched;

    RAISE EXCEPTION
      'PORTAL ORG: una cuenta de portal no debe poder crear prospectos';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
