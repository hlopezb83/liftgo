-- Modelos globales LiftGo + configuración y tarifas locales (0047).
BEGIN;

CREATE TEMP TABLE phase1_fixture (
  catalog_id uuid PRIMARY KEY,
  org_a uuid NOT NULL,
  org_b uuid NOT NULL
) ON COMMIT DROP;
GRANT SELECT ON phase1_fixture TO authenticated;

INSERT INTO public.organizations (id, name, slug, is_active)
VALUES
  (
    '47000000-0000-4000-8000-0000000000a0',
    'LiftGo Modelos A',
    'liftgo-modelos-a',
    true
  ),
  (
    '47000000-0000-4000-8000-0000000000b2',
    'LiftGo Modelos B',
    'liftgo-modelos-b',
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_model_catalog (
  id, manufacturer, model, capacity_kg, mast_height_m, fuel_type,
  source_organization_id
) VALUES (
  '47000000-0000-4000-8000-0000000000e1',
  'LiftGo', 'MODELO GLOBAL 0047', 2500, 4.5, 'Diesel',
  '47000000-0000-4000-8000-0000000000a0'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO phase1_fixture (catalog_id, org_a, org_b)
VALUES (
  '47000000-0000-4000-8000-0000000000e1',
  '47000000-0000-4000-8000-0000000000a0',
  '47000000-0000-4000-8000-0000000000b2'
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM phase1_fixture) THEN
    RAISE EXCEPTION 'SETUP 0047: no se creó el fixture de modelo global';
  END IF;
END
$$;

SELECT set_config(
  'app.organization_id',
  (SELECT org_a::text FROM phase1_fixture),
  true
);

INSERT INTO auth.users (id, email, created_at, updated_at, raw_user_meta_data) VALUES
  (
    '47000000-0000-4000-8000-0000000000f0',
    'plataforma.modelos@test.local', now(), now(),
    jsonb_build_object('organization_id', (SELECT org_a::text FROM phase1_fixture))
  ),
  (
    '47000000-0000-4000-8000-0000000000a1',
    'admin.a.modelos@test.local', now(), now(),
    jsonb_build_object('organization_id', (SELECT org_a::text FROM phase1_fixture))
  ),
  (
    '47000000-0000-4000-8000-0000000000a2',
    'admin.b.modelos@test.local', now(), now(),
    jsonb_build_object('organization_id', (SELECT org_b::text FROM phase1_fixture))
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, email, is_active) VALUES
  ('47000000-0000-4000-8000-0000000000f0', 'Operador modelos', 'plataforma.modelos@test.local', true),
  ('47000000-0000-4000-8000-0000000000a1', 'Admin modelos A', 'admin.a.modelos@test.local', true),
  ('47000000-0000-4000-8000-0000000000a2', 'Admin modelos B', 'admin.b.modelos@test.local', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('47000000-0000-4000-8000-0000000000f0', 'admin'),
  ('47000000-0000-4000-8000-0000000000a1', 'admin'),
  ('47000000-0000-4000-8000-0000000000a2', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (
  organization_id, auth_user_id, member_type
)
SELECT org_a, '47000000-0000-4000-8000-0000000000f0', 'internal'
FROM phase1_fixture
UNION ALL
SELECT org_a, '47000000-0000-4000-8000-0000000000a1', 'internal'
FROM phase1_fixture
UNION ALL
SELECT org_b, '47000000-0000-4000-8000-0000000000a2', 'internal'
FROM phase1_fixture
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_operators (auth_user_id, notes)
VALUES ('47000000-0000-4000-8000-0000000000f0', 'Prueba modelos 0047')
ON CONFLICT (auth_user_id) DO NOTHING;

-- A y B activan el mismo maestro con tarifas distintas.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"47000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT public.activate_equipment_model_catalog(
  (SELECT catalog_id FROM phase1_fixture), 'Modelo local A', 10, 20, 30
);

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.equipment_models m
    JOIN phase1_fixture f ON f.org_a = m.organization_id
    WHERE m.catalog_model_id = f.catalog_id
      AND m.default_daily_rate = 10
      AND m.local_alias = 'Modelo local A'
      AND m.is_active
  ) THEN
    RAISE EXCEPTION 'RLS 0047: Admin A no activó su configuración local';
  END IF;

  BEGIN
    UPDATE public.equipment_model_catalog
    SET model = 'CAMBIO NO AUTORIZADO'
    WHERE id = (SELECT catalog_id FROM phase1_fixture);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS 0047: Admin A modificó el maestro global';
  END IF;

  -- El trigger descarta intentos de cambiar la ficha técnica local enlazada.
  UPDATE public.equipment_models
  SET manufacturer = 'FABRICANTE LOCAL NO PERMITIDO'
  WHERE catalog_model_id = (SELECT catalog_id FROM phase1_fixture);
  IF EXISTS (
    SELECT 1 FROM public.equipment_models
    WHERE catalog_model_id = (SELECT catalog_id FROM phase1_fixture)
      AND manufacturer = 'FABRICANTE LOCAL NO PERMITIDO'
  ) THEN
    RAISE EXCEPTION 'RLS 0047: la ficha técnica local se separó del maestro';
  END IF;
END
$$;

SET LOCAL request.jwt.claims TO
  '{"sub":"47000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

SELECT public.activate_equipment_model_catalog(
  (SELECT catalog_id FROM phase1_fixture), 'Modelo local B', 100, 200, 300
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.equipment_models m
    JOIN phase1_fixture f ON f.org_b = m.organization_id
    WHERE m.catalog_model_id = f.catalog_id
      AND m.default_daily_rate = 100
      AND m.local_alias = 'Modelo local B'
      AND m.is_active
  ) THEN
    RAISE EXCEPTION 'RLS 0047: Admin B no activó el mismo maestro global';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.equipment_models m
    JOIN phase1_fixture f ON f.org_a = m.organization_id
    WHERE m.catalog_model_id = f.catalog_id
  ) THEN
    RAISE EXCEPTION 'RLS 0047: Admin B ve la configuración local de A';
  END IF;
END
$$;

-- Las funciones de plataforma vuelven a verificar al actor en la base.
RESET ROLE;
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.platform_set_equipment_model_catalog_active(
      '47000000-0000-4000-8000-0000000000a1',
      (SELECT catalog_id FROM phase1_fixture),
      false
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ACL 0047: un admin de empresa operó como plataforma';
  END IF;
END
$$;

SELECT public.platform_update_equipment_model_catalog(
  '47000000-0000-4000-8000-0000000000f0',
  c.id,
  c.manufacturer,
  c.model,
  coalesce(c.capacity_kg, 1000) + 1,
  c.mast_height_m,
  c.fuel_type,
  c.specifications,
  c.image_url,
  c.spec_sheet_url
)
FROM public.equipment_model_catalog c
WHERE c.id = (SELECT catalog_id FROM phase1_fixture);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.equipment_models m
    JOIN public.equipment_model_catalog c ON c.id = m.catalog_model_id
    JOIN phase1_fixture f ON f.catalog_id = c.id
    WHERE m.organization_id IN (f.org_a, f.org_b)
      AND m.default_capacity_kg IS DISTINCT FROM c.capacity_kg
  ) THEN
    RAISE EXCEPTION 'SYNC 0047: la actualización global no llegó a A y B';
  END IF;

  IF (
    SELECT count(DISTINCT m.organization_id)
    FROM public.equipment_models m
    JOIN phase1_fixture f ON f.catalog_id = m.catalog_model_id
    WHERE m.organization_id IN (f.org_a, f.org_b)
  ) <> 2 THEN
    RAISE EXCEPTION 'UNIQUE 0047: dos organizaciones no pudieron usar el mismo modelo';
  END IF;
END
$$;

-- Desactivar localmente A no toca B.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"47000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
UPDATE public.equipment_models
SET is_active = false
WHERE catalog_model_id = (SELECT catalog_id FROM phase1_fixture);

SET LOCAL request.jwt.claims TO
  '{"sub":"47000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.equipment_models
    WHERE catalog_model_id = (SELECT catalog_id FROM phase1_fixture)
      AND is_active
      AND default_daily_rate = 100
  ) THEN
    RAISE EXCEPTION 'AISLAMIENTO 0047: desactivar A modificó B';
  END IF;
END
$$;

ROLLBACK;

