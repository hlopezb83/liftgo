-- Plantilla legal global versionada + snapshot inmutable por organización (0049).
BEGIN;

INSERT INTO public.organizations (id, name, slug, is_active) VALUES
  ('49000000-0000-4000-8000-0000000000a0', 'LiftGo Legal A', 'liftgo-legal-a', true),
  ('49000000-0000-4000-8000-0000000000b0', 'LiftGo Legal B', 'liftgo-legal-b', true)
ON CONFLICT (id) DO NOTHING;

SELECT set_config('app.organization_id', '49000000-0000-4000-8000-0000000000a0', true);

INSERT INTO auth.users (id, email, created_at, updated_at, raw_user_meta_data) VALUES
  ('49000000-0000-4000-8000-0000000000a1', 'admin.a.legal@test.local', now(), now(), '{"organization_id":"49000000-0000-4000-8000-0000000000a0"}'::jsonb),
  ('49000000-0000-4000-8000-0000000000b1', 'admin.b.legal@test.local', now(), now(), '{"organization_id":"49000000-0000-4000-8000-0000000000b0"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, email, is_active) VALUES
  ('49000000-0000-4000-8000-0000000000a1', 'Admin legal A', 'admin.a.legal@test.local', true),
  ('49000000-0000-4000-8000-0000000000b1', 'Admin legal B', 'admin.b.legal@test.local', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('49000000-0000-4000-8000-0000000000a1', 'admin'),
  ('49000000-0000-4000-8000-0000000000b1', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('49000000-0000-4000-8000-0000000000a0', '49000000-0000-4000-8000-0000000000a1', 'internal'),
  ('49000000-0000-4000-8000-0000000000b0', '49000000-0000-4000-8000-0000000000b1', 'internal')
ON CONFLICT DO NOTHING;

INSERT INTO public.legal_template_definitions (id, template_key, document_type, name, is_active)
VALUES ('49000000-0000-4000-8000-0000000000d0', 'rental_contract_phase3_test', 'rental_contract', 'Contrato LiftGo fase 3', true);

INSERT INTO public.legal_template_versions (id, definition_id, version, content, checksum_sha256, change_summary) VALUES
  (
    '49000000-0000-4000-8000-0000000000d1', '49000000-0000-4000-8000-0000000000d0', 1,
    '{"intro_text":"Versión global uno","declarations_landlord":[],"declarations_tenant":[],"clauses":[],"checklist_sections":[],"pagare_text":"Pagaré global uno"}'::jsonb,
    repeat('a', 64), 'Versión inicial RLS'
  ),
  (
    '49000000-0000-4000-8000-0000000000d2', '49000000-0000-4000-8000-0000000000d0', 2,
    '{"intro_text":"Versión global dos","declarations_landlord":[],"declarations_tenant":[],"clauses":[],"checklist_sections":[],"pagare_text":"Pagaré global dos"}'::jsonb,
    repeat('b', 64), 'Nueva versión RLS'
  );

UPDATE public.legal_template_definitions
SET current_version_id = '49000000-0000-4000-8000-0000000000d2'
WHERE id = '49000000-0000-4000-8000-0000000000d0';

UPDATE public.organization_legal_template_assignments a
SET is_active = false
FROM public.legal_template_definitions d
WHERE d.id = a.definition_id
  AND a.organization_id IN ('49000000-0000-4000-8000-0000000000a0', '49000000-0000-4000-8000-0000000000b0')
  AND d.document_type = 'rental_contract';

INSERT INTO public.organization_legal_template_assignments (
  organization_id, definition_id, version_id, local_overrides, is_active
) VALUES
  ('49000000-0000-4000-8000-0000000000a0', '49000000-0000-4000-8000-0000000000d0', '49000000-0000-4000-8000-0000000000d1', '{"city":"Monterrey"}'::jsonb, true),
  ('49000000-0000-4000-8000-0000000000b0', '49000000-0000-4000-8000-0000000000d0', '49000000-0000-4000-8000-0000000000d1', '{"city":"Saltillo"}'::jsonb, true);

INSERT INTO public.customers (id, name) VALUES
  ('49000000-0000-4000-8000-0000000000c1', 'Cliente Legal A'),
  ('49000000-0000-4000-8000-0000000000c2', 'Cliente Legal B');
INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('49000000-0000-4000-8000-0000000000a0', '49000000-0000-4000-8000-0000000000c1'),
  ('49000000-0000-4000-8000-0000000000b0', '49000000-0000-4000-8000-0000000000c2');
INSERT INTO public.forklifts (id, name, model, organization_id) VALUES
  ('49000000-0000-4000-8000-0000000000f1', 'Unidad Legal A', 'A-1', '49000000-0000-4000-8000-0000000000a0'),
  ('49000000-0000-4000-8000-0000000000f2', 'Unidad Legal B', 'B-1', '49000000-0000-4000-8000-0000000000b0');
INSERT INTO public.contracts (
  id, contract_number, customer_id, forklift_id, organization_id,
  start_date, end_date, monthly_rate
) VALUES
  (
    '49000000-0000-4000-8000-0000000000e1', 'CTR-LEGAL-A',
    '49000000-0000-4000-8000-0000000000c1', '49000000-0000-4000-8000-0000000000f1',
    '49000000-0000-4000-8000-0000000000a0', DATE '2026-09-01', DATE '2026-09-30', 1000
  ),
  (
    '49000000-0000-4000-8000-0000000000e2', 'CTR-LEGAL-B',
    '49000000-0000-4000-8000-0000000000c2', '49000000-0000-4000-8000-0000000000f2',
    '49000000-0000-4000-8000-0000000000b0', DATE '2026-09-01', DATE '2026-09-30', 1000
  );

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.contracts
    SET customer_id = '49000000-0000-4000-8000-0000000000c2',
        status = 'signed', signed_at = now(), signed_by = 'Cruce inválido'
    WHERE id = '49000000-0000-4000-8000-0000000000e1';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'AISLAMIENTO 0049: se firmó A con el cliente de B';
  END IF;
END
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"49000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.get_effective_legal_template('rental_contract');
  IF v_row.version_id <> '49000000-0000-4000-8000-0000000000d1'::uuid
     OR v_row.local_overrides ->> 'city' <> 'Monterrey' THEN
    RAISE EXCEPTION 'RUNTIME 0049: A no resolvió su versión/override';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_legal_template_assignments
    WHERE organization_id = '49000000-0000-4000-8000-0000000000b0'
  ) THEN
    RAISE EXCEPTION 'RLS 0049: A ve la asignación privada de B';
  END IF;
END
$$;

UPDATE public.contracts
SET status = 'signed', signed_at = now(), signed_by = 'Firmante A'
WHERE id = '49000000-0000-4000-8000-0000000000e1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contracts
    WHERE id = '49000000-0000-4000-8000-0000000000e1'
      AND legal_template_version_id = '49000000-0000-4000-8000-0000000000d1'
      AND signed_snapshot ->> 'legal_template_checksum_sha256' = repeat('a', 64)
      AND signed_snapshot #>> '{template,intro_text}' = 'Versión global uno'
      AND signed_snapshot #>> '{template_local_overrides,city}' = 'Monterrey'
  ) THEN
    RAISE EXCEPTION 'SNAPSHOT 0049: A no congeló versión, checksum y override';
  END IF;
END
$$;

UPDATE public.organization_legal_template_assignments
SET version_id = '49000000-0000-4000-8000-0000000000d2'
WHERE definition_id = '49000000-0000-4000-8000-0000000000d0';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contracts
    WHERE id = '49000000-0000-4000-8000-0000000000e1'
      AND legal_template_version_id = '49000000-0000-4000-8000-0000000000d1'
      AND signed_snapshot #>> '{template,intro_text}' = 'Versión global uno'
  ) THEN
    RAISE EXCEPTION 'INMUTABLE 0049: adoptar v2 alteró el contrato firmado con v1';
  END IF;

  BEGIN
    UPDATE public.contracts
    SET legal_template_version_id = '49000000-0000-4000-8000-0000000000d2'
    WHERE id = '49000000-0000-4000-8000-0000000000e1';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'INMUTABLE 0049: se cambió la versión de un contrato firmado';
  END IF;
END
$$;

SET LOCAL request.jwt.claims TO '{"sub":"49000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.get_effective_legal_template('rental_contract');
  IF v_row.version_id <> '49000000-0000-4000-8000-0000000000d1'::uuid
     OR v_row.local_overrides ->> 'city' <> 'Saltillo' THEN
    RAISE EXCEPTION 'RUNTIME 0049: B no conservó su versión/override privado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.contracts
    WHERE id = '49000000-0000-4000-8000-0000000000e1'
  ) THEN
    RAISE EXCEPTION 'RLS 0049: B ve el contrato firmado de A';
  END IF;
END
$$;

ROLLBACK;
