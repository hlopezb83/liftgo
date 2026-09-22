-- SKUs globales LiftGo + inventario local por organización (0048).
BEGIN;

CREATE TEMP TABLE phase2_parts_fixture (
  catalog_id uuid PRIMARY KEY,
  model_id uuid NOT NULL,
  org_a uuid NOT NULL,
  org_b uuid NOT NULL
) ON COMMIT DROP;
GRANT SELECT ON phase2_parts_fixture TO authenticated;

INSERT INTO public.organizations (id, name, slug, is_active) VALUES
  ('48000000-0000-4000-8000-0000000000a0', 'LiftGo Refacciones Norte', 'liftgo-refacciones-norte', true),
  ('48000000-0000-4000-8000-0000000000b0', 'LiftGo Refacciones Bajío', 'liftgo-refacciones-bajio', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_model_catalog (id, manufacturer, model, is_active)
VALUES ('48000000-0000-4000-8000-0000000000e0', 'LiftGo', 'MODELO COMPATIBLE 0048', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.parts_catalog (
  id, sku, name, category, manufacturer, unit_of_measure, is_active
) VALUES (
  '48000000-0000-4000-8000-0000000000c0', 'FLT-0048',
  'Filtro hidráulico LiftGo', 'Filtros', 'LiftGo Parts', 'pieza', true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO phase2_parts_fixture VALUES (
  '48000000-0000-4000-8000-0000000000c0',
  '48000000-0000-4000-8000-0000000000e0',
  '48000000-0000-4000-8000-0000000000a0',
  '48000000-0000-4000-8000-0000000000b0'
);

SELECT set_config('app.organization_id', (SELECT org_a::text FROM phase2_parts_fixture), true);

INSERT INTO auth.users (id, email, created_at, updated_at, raw_user_meta_data) VALUES
  ('48000000-0000-4000-8000-0000000000f0', 'plataforma.refacciones@test.local', now(), now(), jsonb_build_object('organization_id', (SELECT org_a::text FROM phase2_parts_fixture))),
  ('48000000-0000-4000-8000-0000000000a1', 'admin.a.refacciones@test.local', now(), now(), jsonb_build_object('organization_id', (SELECT org_a::text FROM phase2_parts_fixture))),
  ('48000000-0000-4000-8000-0000000000b1', 'admin.b.refacciones@test.local', now(), now(), jsonb_build_object('organization_id', (SELECT org_b::text FROM phase2_parts_fixture)))
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, email, is_active) VALUES
  ('48000000-0000-4000-8000-0000000000f0', 'Operador refacciones', 'plataforma.refacciones@test.local', true),
  ('48000000-0000-4000-8000-0000000000a1', 'Admin refacciones A', 'admin.a.refacciones@test.local', true),
  ('48000000-0000-4000-8000-0000000000b1', 'Admin refacciones B', 'admin.b.refacciones@test.local', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('48000000-0000-4000-8000-0000000000f0', 'admin'),
  ('48000000-0000-4000-8000-0000000000a1', 'admin'),
  ('48000000-0000-4000-8000-0000000000b1', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
SELECT org_a, '48000000-0000-4000-8000-0000000000f0'::uuid, 'internal' FROM phase2_parts_fixture
UNION ALL SELECT org_a, '48000000-0000-4000-8000-0000000000a1'::uuid, 'internal' FROM phase2_parts_fixture
UNION ALL SELECT org_b, '48000000-0000-4000-8000-0000000000b1'::uuid, 'internal' FROM phase2_parts_fixture
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_operators (auth_user_id, notes)
VALUES ('48000000-0000-4000-8000-0000000000f0', 'Prueba refacciones 0048')
ON CONFLICT (auth_user_id) DO NOTHING;

-- A activa el SKU con su propio stock, costo y ubicación.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"48000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT public.activate_parts_catalog(
  (SELECT catalog_id FROM phase2_parts_fixture), 12, 3, 480, 'Pasillo Norte'
);

DO $$
DECLARE v_affected integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_inventory i
    JOIN phase2_parts_fixture f ON f.org_a = i.organization_id
    WHERE i.catalog_part_id = f.catalog_id AND i.stock_quantity = 12
      AND i.unit_cost = 480 AND i.location = 'Pasillo Norte' AND i.is_active
  ) THEN
    RAISE EXCEPTION 'RLS 0048: A no activó su inventario local';
  END IF;

  UPDATE public.parts_catalog SET name = 'Cambio no autorizado'
  WHERE id = (SELECT catalog_id FROM phase2_parts_fixture);
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'RLS 0048: un admin de empresa modificó el maestro global';
  END IF;

  UPDATE public.parts_inventory SET sku = 'SKU-LOCAL-NO-PERMITIDO'
  WHERE catalog_part_id = (SELECT catalog_id FROM phase2_parts_fixture);
  IF EXISTS (
    SELECT 1 FROM public.parts_inventory
    WHERE catalog_part_id = (SELECT catalog_id FROM phase2_parts_fixture)
      AND sku = 'SKU-LOCAL-NO-PERMITIDO'
  ) THEN
    RAISE EXCEPTION 'SYNC 0048: el SKU local se separó del maestro';
  END IF;
END
$$;

-- B activa el mismo SKU con valores locales diferentes.
SET LOCAL request.jwt.claims TO '{"sub":"48000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
SELECT public.activate_parts_catalog(
  (SELECT catalog_id FROM phase2_parts_fixture), 25, 7, 525, 'Almacén Bajío'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_inventory i
    JOIN phase2_parts_fixture f ON f.org_b = i.organization_id
    WHERE i.catalog_part_id = f.catalog_id AND i.stock_quantity = 25
      AND i.unit_cost = 525 AND i.location = 'Almacén Bajío'
  ) THEN
    RAISE EXCEPTION 'RLS 0048: B no activó el mismo SKU global';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.parts_inventory i
    JOIN phase2_parts_fixture f ON f.org_a = i.organization_id
    WHERE i.catalog_part_id = f.catalog_id
  ) THEN
    RAISE EXCEPTION 'AISLAMIENTO 0048: B ve el inventario de A';
  END IF;
END
$$;

-- Un admin local no puede usar el canal de plataforma.
RESET ROLE;
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.platform_set_parts_catalog_active(
      '48000000-0000-4000-8000-0000000000a1',
      (SELECT catalog_id FROM phase2_parts_fixture), false
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ACL 0048: un admin de empresa operó como plataforma';
  END IF;
END
$$;

-- El operador actualiza identidad y compatibilidad; A y B se sincronizan.
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SELECT public.platform_update_parts_catalog(
  '48000000-0000-4000-8000-0000000000f0',
  f.catalog_id, 'FLT-0048-A', 'Filtro hidráulico actualizado',
  'Compatibilidad global', 'LiftGo Parts', ARRAY['OEM-0048'], 'Filtros',
  'pieza', NULL, ARRAY[f.model_id]
)
FROM phase2_parts_fixture f;

DO $$
BEGIN
  IF (
    SELECT count(DISTINCT i.organization_id)
    FROM public.parts_inventory i
    JOIN phase2_parts_fixture f ON f.catalog_id = i.catalog_part_id
    WHERE i.organization_id IN (f.org_a, f.org_b)
      AND i.sku = 'FLT-0048-A'
      AND i.name = 'Filtro hidráulico actualizado'
  ) <> 2 THEN
    RAISE EXCEPTION 'SYNC 0048: la identidad global no llegó a A y B';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_catalog_equipment_models x
    JOIN phase2_parts_fixture f ON f.catalog_id = x.part_catalog_id
      AND f.model_id = x.equipment_model_catalog_id
  ) THEN
    RAISE EXCEPTION 'COMPATIBILIDAD 0048: no se guardó el modelo compatible';
  END IF;
  IF (
    SELECT count(DISTINCT i.unit_cost)
    FROM public.parts_inventory i
    JOIN phase2_parts_fixture f ON f.catalog_id = i.catalog_part_id
    WHERE i.organization_id IN (f.org_a, f.org_b)
  ) <> 2 THEN
    RAISE EXCEPTION 'AISLAMIENTO 0048: se mezclaron los costos locales';
  END IF;
END
$$;

-- Desactivar A no toca B ni el maestro.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"48000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
UPDATE public.parts_inventory SET is_active = false
WHERE catalog_part_id = (SELECT catalog_id FROM phase2_parts_fixture);

SET LOCAL request.jwt.claims TO '{"sub":"48000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_inventory
    WHERE catalog_part_id = (SELECT catalog_id FROM phase2_parts_fixture)
      AND is_active AND stock_quantity = 25
  ) THEN
    RAISE EXCEPTION 'AISLAMIENTO 0048: desactivar A modificó B';
  END IF;
END
$$;

ROLLBACK;
