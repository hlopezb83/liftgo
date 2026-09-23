-- Edición segura de datos legales locales por organización (0051).
BEGIN;

INSERT INTO public.organizations (id, name, slug, is_active) VALUES
  ('51000000-0000-4000-8000-0000000000a0', 'LiftGo Legal Local A', 'liftgo-legal-local-a', true),
  ('51000000-0000-4000-8000-0000000000b0', 'LiftGo Legal Local B', 'liftgo-legal-local-b', true);

SELECT set_config('app.organization_id', '51000000-0000-4000-8000-0000000000a0', true);

INSERT INTO auth.users (id, email, created_at, updated_at, raw_user_meta_data) VALUES
  ('51000000-0000-4000-8000-0000000000a1', 'admin.a.local@test.local', now(), now(), '{"organization_id":"51000000-0000-4000-8000-0000000000a0"}'::jsonb),
  ('51000000-0000-4000-8000-0000000000a2', 'ventas.a.local@test.local', now(), now(), '{"organization_id":"51000000-0000-4000-8000-0000000000a0"}'::jsonb),
  ('51000000-0000-4000-8000-0000000000b1', 'admin.b.local@test.local', now(), now(), '{"organization_id":"51000000-0000-4000-8000-0000000000b0"}'::jsonb);

INSERT INTO public.profiles (user_id, full_name, email, is_active) VALUES
  ('51000000-0000-4000-8000-0000000000a1', 'Admin local A', 'admin.a.local@test.local', true),
  ('51000000-0000-4000-8000-0000000000a2', 'Ventas local A', 'ventas.a.local@test.local', true),
  ('51000000-0000-4000-8000-0000000000b1', 'Admin local B', 'admin.b.local@test.local', true)
ON CONFLICT (user_id) DO UPDATE
SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, is_active = true;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('51000000-0000-4000-8000-0000000000a1', 'admin'),
  ('51000000-0000-4000-8000-0000000000a2', 'ventas'),
  ('51000000-0000-4000-8000-0000000000b1', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('51000000-0000-4000-8000-0000000000a0', '51000000-0000-4000-8000-0000000000a1', 'internal'),
  ('51000000-0000-4000-8000-0000000000a0', '51000000-0000-4000-8000-0000000000a2', 'internal'),
  ('51000000-0000-4000-8000-0000000000b0', '51000000-0000-4000-8000-0000000000b1', 'internal');

INSERT INTO public.legal_template_definitions (id, template_key, document_type, name, is_active)
VALUES ('51000000-0000-4000-8000-0000000000d0', 'rental_contract_phase3c_test', 'rental_contract', 'Contrato LiftGo fase 3C', true);

INSERT INTO public.legal_template_versions (
  id, definition_id, version, content, checksum_sha256, change_summary
) VALUES (
  '51000000-0000-4000-8000-0000000000d1',
  '51000000-0000-4000-8000-0000000000d0',
  1,
  '{"intro_text":"Contrato local","declarations_landlord":[],"declarations_tenant":[],"clauses":[],"checklist_sections":[],"pagare_text":"Pagaré"}'::jsonb,
  repeat('c', 64),
  'Versión local de prueba'
);

UPDATE public.legal_template_definitions
SET current_version_id = '51000000-0000-4000-8000-0000000000d1'
WHERE id = '51000000-0000-4000-8000-0000000000d0';

INSERT INTO public.organization_legal_template_assignments (
  organization_id, definition_id, version_id, local_overrides, is_active
) VALUES
  ('51000000-0000-4000-8000-0000000000a0', '51000000-0000-4000-8000-0000000000d0', '51000000-0000-4000-8000-0000000000d1', '{}'::jsonb, true),
  ('51000000-0000-4000-8000-0000000000b0', '51000000-0000-4000-8000-0000000000d0', '51000000-0000-4000-8000-0000000000d1', '{}'::jsonb, true);

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"51000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_result jsonb;
  v_blocked boolean := false;
BEGIN
  v_result := public.update_current_organization_legal_template_overrides(
    '51000000-0000-4000-8000-0000000000d0',
    '{"city":" Monterrey, N.L. ","jurisdiction":"Monterrey, Nuevo León","legal_representative":"Ana Pérez","witness_1":"Luis Uno","witness_2":"María Dos"}'::jsonb
  );
  IF v_result ->> 'city' <> 'Monterrey, N.L.'
     OR v_result ->> 'legal_representative' <> 'Ana Pérez' THEN
    RAISE EXCEPTION 'RPC 0051: no normalizó los datos de A';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_legal_template_assignments
    WHERE organization_id = '51000000-0000-4000-8000-0000000000b0'
  ) THEN
    RAISE EXCEPTION 'RLS 0051: A puede ver la asignación de B';
  END IF;

  BEGIN
    UPDATE public.organization_legal_template_assignments
    SET version_id = '51000000-0000-4000-8000-0000000000d1'
    WHERE organization_id = '51000000-0000-4000-8000-0000000000a0';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ACL 0051: authenticated conserva escritura directa';
  END IF;
END
$$;

SET LOCAL request.jwt.claims TO '{"sub":"51000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.update_current_organization_legal_template_overrides(
      '51000000-0000-4000-8000-0000000000d0',
      '{"city":"Ciudad alterada"}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ROL 0051: ventas modificó datos legales';
  END IF;
END
$$;

SET LOCAL request.jwt.claims TO '{"sub":"51000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
SELECT public.update_current_organization_legal_template_overrides(
  '51000000-0000-4000-8000-0000000000d0',
  '{"city":"Saltillo, Coah.","jurisdiction":"Saltillo, Coahuila"}'::jsonb
);

RESET ROLE;
DO $$
BEGIN
  IF (SELECT local_overrides ->> 'city'
      FROM public.organization_legal_template_assignments
      WHERE organization_id = '51000000-0000-4000-8000-0000000000a0'
        AND definition_id = '51000000-0000-4000-8000-0000000000d0') <> 'Monterrey, N.L.' THEN
    RAISE EXCEPTION 'AISLAMIENTO 0051: B alteró los datos de A';
  END IF;
  IF (SELECT local_overrides ->> 'city'
      FROM public.organization_legal_template_assignments
      WHERE organization_id = '51000000-0000-4000-8000-0000000000b0'
        AND definition_id = '51000000-0000-4000-8000-0000000000d0') <> 'Saltillo, Coah.' THEN
    RAISE EXCEPTION 'AISLAMIENTO 0051: B no guardó sus propios datos';
  END IF;
END
$$;

SET LOCAL role = 'anon';
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.update_current_organization_legal_template_overrides(
      '51000000-0000-4000-8000-0000000000d0', '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ACL 0051: anon ejecutó la RPC';
  END IF;
END
$$;

ROLLBACK;

