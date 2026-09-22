-- RLS + semilla: catálogos globales LiftGo (migración 0046).
-- Verifica que Org 1 alimente el machote global, que ambas empresas puedan
-- leerlo y que sólo platform_operators puedan modificarlo.
BEGIN;

DO $seed_contract$
DECLARE
  v_org_1 uuid;
  v_org_1_models integer;
  v_linked_models integer;
  v_org_1_parts integer;
  v_linked_parts integer;
  v_org_1_templates integer;
  v_linked_templates integer;
BEGIN
  SELECT id INTO v_org_1
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at, id
  LIMIT 1;

  IF v_org_1 IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere Org 1 activa';
  END IF;

  SELECT count(*) INTO v_org_1_models
  FROM public.equipment_models
  WHERE organization_id = v_org_1;
  SELECT count(*) INTO v_linked_models
  FROM public.equipment_models
  WHERE organization_id = v_org_1 AND catalog_model_id IS NOT NULL;

  IF v_linked_models <> v_org_1_models THEN
    RAISE EXCEPTION
      'SEED 0046: modelos enlazados % de %', v_linked_models, v_org_1_models;
  END IF;

  SELECT count(*) INTO v_org_1_parts
  FROM public.parts_inventory
  WHERE organization_id = v_org_1;
  SELECT count(*) INTO v_linked_parts
  FROM public.parts_inventory
  WHERE organization_id = v_org_1 AND catalog_part_id IS NOT NULL;

  IF v_linked_parts <> v_org_1_parts THEN
    RAISE EXCEPTION
      'SEED 0046: refacciones enlazadas % de %', v_linked_parts, v_org_1_parts;
  END IF;

  SELECT count(*) INTO v_org_1_templates
  FROM public.contract_templates
  WHERE organization_id = v_org_1;
  SELECT count(*) INTO v_linked_templates
  FROM public.contract_templates
  WHERE organization_id = v_org_1 AND global_template_version_id IS NOT NULL;

  IF v_linked_templates <> v_org_1_templates THEN
    RAISE EXCEPTION
      'SEED 0046: plantillas enlazadas % de %', v_linked_templates, v_org_1_templates;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.brand_assets
    WHERE asset_key = 'liftgo_main_lockup'
      AND file_url = '/brand/liftgo-montacargas.png'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'SEED 0046: falta el logo global oficial';
  END IF;

  IF v_org_1_templates > 0 AND NOT EXISTS (
    SELECT 1
    FROM public.organization_legal_template_assignments a
    WHERE a.organization_id = v_org_1 AND a.is_active
  ) THEN
    RAISE EXCEPTION 'SEED 0046: Org 1 no recibió la asignación legal inicial';
  END IF;
END
$seed_contract$;

INSERT INTO public.organizations (id, name, slug, is_active)
VALUES (
  '46000000-0000-4000-8000-0000000000b2',
  'LiftGo Catálogos B',
  'liftgo-catalogos-b',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Los triggers de alta de auth.users escriben perfiles y bitácora. Con dos
-- empresas activas, el writer de sistema debe declarar la empresa de contexto.
SELECT set_config(
  'app.organization_id',
  (
    SELECT id::text
    FROM public.organizations
    WHERE is_active AND id <> '46000000-0000-4000-8000-0000000000b2'
    ORDER BY created_at, id
    LIMIT 1
  ),
  true
);

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('46000000-0000-4000-8000-0000000000f0', 'plataforma.catalogos@test.local', now(), now()),
  ('46000000-0000-4000-8000-0000000000a1', 'admin.a.catalogos@test.local', now(), now()),
  ('46000000-0000-4000-8000-0000000000a2', 'admin.b.catalogos@test.local', now(), now()),
  ('46000000-0000-4000-8000-0000000000c1', 'portal.catalogos@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, email, is_active) VALUES
  ('46000000-0000-4000-8000-0000000000f0', 'Operador de catálogos', 'plataforma.catalogos@test.local', true),
  ('46000000-0000-4000-8000-0000000000a1', 'Admin catálogos A', 'admin.a.catalogos@test.local', true),
  ('46000000-0000-4000-8000-0000000000a2', 'Admin catálogos B', 'admin.b.catalogos@test.local', true),
  ('46000000-0000-4000-8000-0000000000c1', 'Portal catálogos', 'portal.catalogos@test.local', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('46000000-0000-4000-8000-0000000000f0', 'admin'),
  ('46000000-0000-4000-8000-0000000000a1', 'admin'),
  ('46000000-0000-4000-8000-0000000000a2', 'admin'),
  ('46000000-0000-4000-8000-0000000000c1', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.platform_operators (auth_user_id, notes)
VALUES ('46000000-0000-4000-8000-0000000000f0', 'Prueba RLS 0046')
ON CONFLICT (auth_user_id) DO NOTHING;

DO $memberships$
DECLARE
  v_org_1 uuid;
BEGIN
  SELECT id INTO v_org_1
  FROM public.organizations
  WHERE is_active AND id <> '46000000-0000-4000-8000-0000000000b2'
  ORDER BY created_at, id
  LIMIT 1;

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  ) VALUES
    (v_org_1, '46000000-0000-4000-8000-0000000000a1', 'internal'),
    ('46000000-0000-4000-8000-0000000000b2', '46000000-0000-4000-8000-0000000000a2', 'internal'),
    (v_org_1, '46000000-0000-4000-8000-0000000000c1', 'portal')
  ON CONFLICT DO NOTHING;
END
$memberships$;

-- Anon y portal no ven catálogos internos.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    IF (SELECT count(*) FROM public.equipment_model_catalog) <> 0
       OR (SELECT count(*) FROM public.parts_catalog) <> 0
       OR (SELECT count(*) FROM public.legal_template_definitions) <> 0 THEN
      RAISE EXCEPTION 'RLS 0046: anon leyó catálogos globales';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS 0046: anon conservó SELECT sobre catálogos globales';
  END IF;
END
$$;

RESET ROLE;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"46000000-0000-4000-8000-0000000000c1","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.equipment_model_catalog) <> 0
     OR (SELECT count(*) FROM public.parts_catalog) <> 0
     OR (SELECT count(*) FROM public.legal_template_definitions) <> 0 THEN
    RAISE EXCEPTION 'RLS 0046: el portal leyó catálogos internos';
  END IF;
END
$$;

-- El operador de plataforma crea el maestro global.
SET LOCAL request.jwt.claims TO
  '{"sub":"46000000-0000-4000-8000-0000000000f0","role":"authenticated"}';

INSERT INTO public.equipment_model_catalog (
  id, manufacturer, model, capacity_kg, fuel_type
) VALUES (
  '46000000-0000-4000-8000-0000000000e1',
  'LiftGo', 'MODELO GLOBAL RLS', 2500, 'Electric'
);

INSERT INTO public.parts_catalog (id, sku, name, category)
VALUES (
  '46000000-0000-4000-8000-0000000000d1',
  'SKU-GLOBAL-RLS', 'Refacción global RLS', 'Pruebas'
);

INSERT INTO public.legal_template_definitions (
  id, template_key, document_type, name
) VALUES (
  '46000000-0000-4000-8000-0000000000d2',
  'rental_contract_rls', 'rental_contract', 'Contrato global RLS'
);

INSERT INTO public.legal_template_versions (
  id, definition_id, version, content, checksum_sha256, change_summary
) VALUES (
  '46000000-0000-4000-8000-0000000000d3',
  '46000000-0000-4000-8000-0000000000d2',
  1,
  '{"clauses":[]}'::jsonb,
  repeat('a', 64),
  'Prueba RLS'
);

UPDATE public.legal_template_definitions
SET current_version_id = '46000000-0000-4000-8000-0000000000d3'
WHERE id = '46000000-0000-4000-8000-0000000000d2';

-- Las versiones son append-only incluso para un platform_operator autenticado.
DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.legal_template_versions
    SET content = '{"clauses":["alterada"]}'::jsonb
    WHERE id = '46000000-0000-4000-8000-0000000000d3';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS 0046: una versión legal publicada pudo editarse';
  END IF;
END
$$;

-- Admin A y Admin B leen el mismo catálogo global.
SET LOCAL request.jwt.claims TO
  '{"sub":"46000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.equipment_model_catalog
    WHERE id = '46000000-0000-4000-8000-0000000000e1'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.parts_catalog WHERE sku = 'SKU-GLOBAL-RLS'
  ) THEN
    RAISE EXCEPTION 'RLS 0046: Admin A no ve el catálogo global';
  END IF;

  BEGIN
    INSERT INTO public.parts_catalog (sku, name)
    VALUES ('SKU-PIRATA-A', 'No permitido');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS 0046: Admin A modificó el catálogo global';
  END IF;
END
$$;

INSERT INTO public.organization_legal_template_assignments (
  organization_id, definition_id, version_id
)
SELECT
  public.current_internal_organization_id(),
  '46000000-0000-4000-8000-0000000000d2',
  '46000000-0000-4000-8000-0000000000d3';

SET LOCAL request.jwt.claims TO
  '{"sub":"46000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.equipment_model_catalog
    WHERE id = '46000000-0000-4000-8000-0000000000e1'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.parts_catalog WHERE sku = 'SKU-GLOBAL-RLS'
  ) THEN
    RAISE EXCEPTION 'RLS 0046: Admin B no ve el catálogo global';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_legal_template_assignments
    WHERE definition_id = '46000000-0000-4000-8000-0000000000d2'
  ) THEN
    RAISE EXCEPTION 'RLS 0046: Admin B ve la asignación privada de A';
  END IF;
END
$$;

ROLLBACK;

