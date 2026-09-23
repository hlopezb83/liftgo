-- Publicación inmutable y adopción controlada de plantillas legales (0050).
BEGIN;

INSERT INTO public.organizations (id, name, slug, is_active) VALUES
  ('50000000-0000-4000-8000-0000000000a0', 'LiftGo Legal Platform A', 'liftgo-legal-platform-a', true),
  ('50000000-0000-4000-8000-0000000000b0', 'LiftGo Legal Platform B', 'liftgo-legal-platform-b', true);

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('50000000-0000-4000-8000-000000000001', 'platform.legal@test.local', now(), now()),
  ('50000000-0000-4000-8000-000000000002', 'regular.legal@test.local', now(), now());

INSERT INTO public.profiles (user_id, full_name, email, is_active) VALUES
  ('50000000-0000-4000-8000-000000000001', 'Operador legal', 'platform.legal@test.local', true),
  ('50000000-0000-4000-8000-000000000002', 'Usuario regular', 'regular.legal@test.local', true);

INSERT INTO public.platform_operators (auth_user_id, notes)
VALUES ('50000000-0000-4000-8000-000000000001', 'Prueba 0050');

INSERT INTO public.legal_template_definitions (
  id, template_key, document_type, name, is_active
) VALUES (
  '50000000-0000-4000-8000-0000000000d0',
  'rental_contract_phase3b_test', 'rental_contract', 'Contrato LiftGo fase 3B', true
);

INSERT INTO public.legal_template_versions (
  id, definition_id, version, content, checksum_sha256, change_summary
) VALUES (
  '50000000-0000-4000-8000-0000000000d1',
  '50000000-0000-4000-8000-0000000000d0', 1,
  '{"intro_text":"Versión uno","declarations_landlord":[],"declarations_tenant":[],"clauses":[{"title":"Primera","body":"Texto inicial"}],"checklist_sections":[],"pagare_text":"Pagaré inicial"}'::jsonb,
  repeat('a', 64), 'Versión inicial de prueba'
);

UPDATE public.legal_template_definitions
SET current_version_id = '50000000-0000-4000-8000-0000000000d1'
WHERE id = '50000000-0000-4000-8000-0000000000d0';

INSERT INTO public.organization_legal_template_assignments (
  organization_id, definition_id, version_id, local_overrides, is_active
) VALUES
  ('50000000-0000-4000-8000-0000000000a0', '50000000-0000-4000-8000-0000000000d0', '50000000-0000-4000-8000-0000000000d1', '{"city":"Monterrey"}', true),
  ('50000000-0000-4000-8000-0000000000b0', '50000000-0000-4000-8000-0000000000d0', '50000000-0000-4000-8000-0000000000d1', '{"city":"Saltillo"}', true);

DO $$
DECLARE v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.platform_list_legal_templates(uuid)'::regprocedure,
    'public.platform_list_legal_template_versions(uuid,uuid)'::regprocedure,
    'public.platform_list_legal_template_assignments(uuid,uuid)'::regprocedure,
    'public.platform_publish_legal_template_version(uuid,uuid,jsonb,text,boolean)'::regprocedure,
    'public.platform_assign_legal_template_version(uuid,uuid,uuid,uuid)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL 0050: una RPC de plataforma es ejecutable desde cliente: %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL 0050: service_role no puede ejecutar %', v_fn;
    END IF;
  END LOOP;
END
$$;

SET LOCAL role = 'service_role';

DO $$
DECLARE
  v_published record;
  v_blocked boolean := false;
BEGIN
  SELECT * INTO v_published
  FROM public.platform_publish_legal_template_version(
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-0000000000d0',
    '{"intro_text":"Versión dos","declarations_landlord":["Declara LiftGo"],"declarations_tenant":["Declara el arrendatario"],"clauses":[{"title":"Primera","body":"Texto actualizado"}],"checklist_sections":[{"title":"Entrega","items":["Revisión visual"]}],"pagare_text":"Pagaré versión dos"}'::jsonb,
    'Actualización controlada de prueba', false
  );

  IF v_published.version <> 2
     OR v_published.checksum_sha256 !~ '^[0-9a-f]{64}$'
     OR NOT EXISTS (
       SELECT 1 FROM public.legal_template_definitions
       WHERE id = '50000000-0000-4000-8000-0000000000d0'
         AND current_version_id = v_published.version_id
     ) THEN
    RAISE EXCEPTION 'PUBLICACIÓN 0050: no creó/promovió correctamente v2';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_legal_template_assignments
    WHERE definition_id = '50000000-0000-4000-8000-0000000000d0'
      AND version_id <> '50000000-0000-4000-8000-0000000000d1'
  ) THEN
    RAISE EXCEPTION 'ADOPCIÓN 0050: publicar sin adopción cambió empresas';
  END IF;

  PERFORM public.platform_assign_legal_template_version(
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-0000000000a0',
    '50000000-0000-4000-8000-0000000000d0',
    v_published.version_id
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_legal_template_assignments
    WHERE organization_id = '50000000-0000-4000-8000-0000000000a0'
      AND version_id = v_published.version_id
      AND local_overrides ->> 'city' = 'Monterrey'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.organization_legal_template_assignments
    WHERE organization_id = '50000000-0000-4000-8000-0000000000b0'
      AND version_id = '50000000-0000-4000-8000-0000000000d1'
  ) THEN
    RAISE EXCEPTION 'ASIGNACIÓN 0050: no aisló adopción A/B o perdió overrides';
  END IF;

  BEGIN
    PERFORM public.platform_publish_legal_template_version(
      '50000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-0000000000d0', '{}'::jsonb,
      'Intento no autorizado', false
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'AUTORIZACIÓN 0050: actor regular publicó una versión';
  END IF;

  v_blocked := false;
  BEGIN
    UPDATE public.legal_template_versions
    SET change_summary = 'Alterado'
    WHERE id = v_published.version_id;
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'INMUTABLE 0050: una versión publicada fue modificada';
  END IF;
END
$$;

DO $$
DECLARE v_published record;
BEGIN
  SELECT * INTO v_published
  FROM public.platform_publish_legal_template_version(
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-0000000000d0',
    '{"intro_text":"Versión tres","declarations_landlord":[],"declarations_tenant":[],"clauses":[{"title":"Primera","body":"Texto definitivo"}],"checklist_sections":[],"pagare_text":"Pagaré versión tres"}'::jsonb,
    'Adopción general de prueba', true
  );
  IF v_published.version <> 3 OR EXISTS (
    SELECT 1 FROM public.organization_legal_template_assignments
    WHERE organization_id IN (
      '50000000-0000-4000-8000-0000000000a0',
      '50000000-0000-4000-8000-0000000000b0'
    ) AND version_id <> v_published.version_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.organization_legal_template_assignments
    WHERE organization_id = '50000000-0000-4000-8000-0000000000b0'
      AND local_overrides ->> 'city' = 'Saltillo'
  ) THEN
    RAISE EXCEPTION 'ADOPCIÓN GENERAL 0050: versión u overrides incorrectos';
  END IF;

  IF (SELECT count(*) FROM public.platform_list_legal_template_versions(
       '50000000-0000-4000-8000-000000000001',
       '50000000-0000-4000-8000-0000000000d0')) <> 3 THEN
    RAISE EXCEPTION 'LISTADO 0050: historial de versiones incompleto';
  END IF;
END
$$;

ROLLBACK;
