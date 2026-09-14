-- Multi-organización · Fase 6.2: configuración fiscal y credenciales por organización.
BEGIN;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'company_settings',
    'billing_secrets',
    'invoice_number_settings'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table
        AND c.column_name = 'organization_id'
        AND c.data_type = 'uuid'
        AND c.is_nullable = 'NO'
    ) THEN
      RAISE EXCEPTION
        'BILLING ORG: %.organization_id debe ser uuid NOT NULL',
        v_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.tablename = 'billing_secrets'
      AND i.indexname = 'billing_secrets_organization_id_key'
      AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND i.indexdef ILIKE '%(organization_id)%'
  ) THEN
    RAISE EXCEPTION
      'BILLING ORG: billing_secrets requiere unicidad por organización';
  END IF;

  IF has_column_privilege(
    'authenticated',
    'public.billing_secrets',
    'facturapi_live_key',
    'SELECT'
  ) OR has_column_privilege(
    'authenticated',
    'public.billing_secrets',
    'facturapi_test_key',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'BILLING ORG: authenticated no debe leer llaves de Facturapi';
  END IF;
END;
$$;

DO $$
DECLARE
  v_org_a uuid := 'e7000000-0000-4000-8000-0000000000a1';
  v_org_b uuid := 'e7000000-0000-4000-8000-0000000000b1';
  v_staff_a uuid := 'e7000000-0000-4000-8000-0000000000a2';
  v_staff_b uuid := 'e7000000-0000-4000-8000-0000000000b2';
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (v_org_a, 'Organización A de billing', 'billing-org-a'),
    (v_org_b, 'Organización B de billing', 'billing-org-b');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_staff_a, 'billing-staff-a@rls.test', now(), now());

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_staff_b, 'billing-staff-b@rls.test', now(), now());

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  )
  VALUES
    (v_org_a, v_staff_a, 'internal'),
    (v_org_b, v_staff_b, 'internal');

  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_staff_a, 'admin'::public.app_role),
    (v_staff_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"e7000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

DO $$
DECLARE
  v_a_id uuid;
  v_b_id uuid;
  v_status_id uuid;
  v_has_test boolean;
  v_has_live boolean;
  v_cross_org_blocked boolean := false;
BEGIN
  SELECT public.upsert_billing_secret(
    NULL,
    'test-key-a',
    NULL
  ) INTO v_a_id;

  SELECT id, has_test_key, has_live_key
    INTO v_status_id, v_has_test, v_has_live
  FROM public.get_billing_secrets_status();

  IF v_status_id <> v_a_id OR NOT v_has_test OR v_has_live THEN
    RAISE EXCEPTION
      'BILLING ORG: A no recibió el estado de sus propias llaves';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"e7000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
    true
  );

  SELECT public.upsert_billing_secret(
    NULL,
    NULL,
    'live-key-b'
  ) INTO v_b_id;

  SELECT id, has_test_key, has_live_key
    INTO v_status_id, v_has_test, v_has_live
  FROM public.get_billing_secrets_status();

  IF v_status_id <> v_b_id OR v_has_test OR NOT v_has_live THEN
    RAISE EXCEPTION
      'BILLING ORG: B no recibió el estado de sus propias llaves';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"e7000000-0000-4000-8000-0000000000a2","role":"authenticated"}',
    true
  );

  BEGIN
    PERFORM public.upsert_billing_secret(v_b_id, 'intento-de-cruce', NULL);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_cross_org_blocked := true;
  END;

  IF NOT v_cross_org_blocked THEN
    RAISE EXCEPTION
      'BILLING ORG: A pudo modificar las credenciales de B';
  END IF;

END;
$$;

RESET role;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.billing_secrets
    WHERE organization_id IN (
      'e7000000-0000-4000-8000-0000000000a1'::uuid,
      'e7000000-0000-4000-8000-0000000000b1'::uuid
    )
  ) <> 2 THEN
    RAISE EXCEPTION
      'BILLING ORG: se esperaban dos configuraciones aisladas';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.billing_secrets
    WHERE organization_id = 'e7000000-0000-4000-8000-0000000000b1'::uuid
      AND facturapi_test_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'BILLING ORG: el intento cruzado alteró la llave de B';
  END IF;
END;
$$;

ROLLBACK;
