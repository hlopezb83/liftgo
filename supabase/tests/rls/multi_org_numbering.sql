-- Multi-organización · Fase 6.1: folios y períodos fiscales por organización.
BEGIN;

DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid := 'e6000000-0000-4000-8000-0000000000b1';
  v_staff_a uuid := 'e6000000-0000-4000-8000-0000000000a1';
  v_staff_b uuid := 'e6000000-0000-4000-8000-0000000000a2';
  v_global_sequence_generators text;
BEGIN
  IF to_regclass('public.organization_document_counters') IS NULL THEN
    RAISE EXCEPTION 'NUMBER ORG: falta organization_document_counters';
  END IF;

  IF has_table_privilege(
    'authenticated',
    'public.organization_document_counters',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'NUMBER ORG: authenticated no debe consultar los contadores internos';
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_global_sequence_generators
  FROM pg_proc p
  WHERE p.oid IN (
    'public.next_supplier_bill_number()'::regprocedure,
    'public.next_contract_number()'::regprocedure,
    'public.next_quote_number()'::regprocedure,
    'public.next_invoice_number()'::regprocedure,
    'public.next_credit_note_number()'::regprocedure,
    'public.next_draft_invoice_number()'::regprocedure,
    'public.peek_next_draft_invoice_number()'::regprocedure,
    'public.next_draft_credit_note_number()'::regprocedure,
    'public.peek_next_draft_credit_note_number()'::regprocedure,
    'public.peek_next_invoice_number()'::regprocedure,
    'public.next_booking_number()'::regprocedure,
    'public.next_delivery_number()'::regprocedure,
    'public.next_inspection_number()'::regprocedure,
    'public.generate_feedback_number()'::regprocedure
  )
    AND pg_get_functiondef(p.oid) ~ 'public\.[a-z_]+_seq';

  IF v_global_sequence_generators IS NOT NULL THEN
    RAISE EXCEPTION
      'NUMBER ORG: generadores aún ligados a secuencias globales: %',
      v_global_sequence_generators;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.fiscal_periods'::regclass
      AND c.contype = 'p'
      AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (organization_id, period)'
  ) THEN
    RAISE EXCEPTION
      'FISCAL ORG: fiscal_periods debe usar PK (organization_id, period)';
  END IF;

  SELECT id INTO v_org_a
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'NUMBER ORG: se requiere una organización inicial activa';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Organización B de folios', 'numbering-org-b');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_staff_a, 'numbering-staff-a@rls.test', now(), now());

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_staff_b, 'numbering-staff-b@rls.test', now(), now());

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  )
  VALUES
    (v_org_a, v_staff_a, 'internal'),
    (v_org_b, v_staff_b, 'internal');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_staff_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_staff_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"e6000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_quote_a text;
  v_quote_b text;
BEGIN
  SELECT public.next_quote_number() INTO v_quote_a;
  IF v_quote_a !~ '^COT-[0-9]{4,}$' THEN
    RAISE EXCEPTION
      'NUMBER ORG: el folio de A tiene formato inválido: %',
      v_quote_a;
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"e6000000-0000-4000-8000-0000000000a2","role":"authenticated"}',
    true
  );

  SELECT public.next_quote_number() INTO v_quote_b;
  IF v_quote_b <> 'COT-0101' THEN
    RAISE EXCEPTION
      'NUMBER ORG: B debió iniciar su contador independiente en COT-0101, obtuvo %',
      v_quote_b;
  END IF;

  INSERT INTO public.fiscal_periods (organization_id, period)
  VALUES (
    public.current_organization_id(),
    '2099-01'
  );

  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"e6000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
    true
  );

  -- El mismo período se puede cerrar en ambas organizaciones.
  INSERT INTO public.fiscal_periods (organization_id, period)
  VALUES (
    public.current_organization_id(),
    '2099-01'
  );
END;
$$;

RESET role;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.fiscal_periods fp
    WHERE fp.period = '2099-01'
      AND fp.organization_id IN (
        'e6000000-0000-4000-8000-0000000000b1'::uuid,
        (
          SELECT m.organization_id
          FROM public.organization_memberships m
          WHERE m.auth_user_id = 'e6000000-0000-4000-8000-0000000000a1'::uuid
        )
      )
  ) <> 2 THEN
    RAISE EXCEPTION
      'FISCAL ORG: el mismo período no quedó aislado para ambas organizaciones';
  END IF;
END;
$$;

ROLLBACK;
