-- =====================================================================
-- Ecosistema LiftGo · 0046: cimientos de catálogos compartidos.
--
-- Esta migración es deliberadamente ADITIVA:
--   · no cambia las consultas actuales;
--   · no elimina columnas ni policies existentes;
--   · agrega vínculos opcionales desde las tablas locales actuales.
--
-- Semilla inicial aprobada:
--   · la primera organización activa (Org 1, la más antigua) es el machote;
--   · sus modelos y plantillas se copian al catálogo global;
--   · sus SKUs se copian cuando existan y tengan SKU válido;
--   · stock, costos, ubicaciones, tarifas y datos fiscales NO se globalizan.
--
-- Modelo de propiedad:
--   · tablas globales: lectura para personal interno de cualquier empresa,
--     escritura sólo para platform_operators;
--   · asignaciones locales: lectura dentro de la empresa y escritura sólo
--     para admin/administrativo de esa misma empresa;
--   · versiones legales: append-only para usuarios autenticados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identidad visual global de LiftGo.
-- ---------------------------------------------------------------------
CREATE TABLE public.brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key text NOT NULL,
  asset_type text NOT NULL,
  file_url text NOT NULL,
  alt_text text,
  checksum_sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_assets_key_version_unique UNIQUE (asset_key, version),
  CONSTRAINT brand_assets_type_check CHECK (
    asset_type IN ('logo', 'icon', 'document_header', 'document_footer', 'other')
  ),
  CONSTRAINT brand_assets_checksum_check CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX brand_assets_one_active_version
  ON public.brand_assets (asset_key)
  WHERE is_active;

CREATE TRIGGER brand_assets_set_updated_at
  BEFORE UPDATE ON public.brand_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.brand_assets IS
  'Activos visuales globales de la marca LiftGo. No pertenecen a una organización.';

-- ---------------------------------------------------------------------
-- 2. Catálogo global de modelos y configuración local existente.
-- ---------------------------------------------------------------------
CREATE TABLE public.equipment_model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer text NOT NULL,
  model text NOT NULL,
  capacity_kg numeric,
  mast_height_m numeric,
  fuel_type text,
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_url text,
  spec_sheet_url text,
  is_active boolean NOT NULL DEFAULT true,
  source_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  source_record_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_model_catalog_manufacturer_check
    CHECK (btrim(manufacturer) <> ''),
  CONSTRAINT equipment_model_catalog_model_check
    CHECK (btrim(model) <> ''),
  CONSTRAINT equipment_model_catalog_capacity_check
    CHECK (capacity_kg IS NULL OR capacity_kg > 0),
  CONSTRAINT equipment_model_catalog_mast_check
    CHECK (mast_height_m IS NULL OR mast_height_m > 0),
  CONSTRAINT equipment_model_catalog_source_unique
    UNIQUE (source_organization_id, source_record_id)
);

CREATE UNIQUE INDEX equipment_model_catalog_identity_unique
  ON public.equipment_model_catalog (
    lower(btrim(manufacturer)),
    lower(btrim(model))
  );

CREATE TRIGGER equipment_model_catalog_set_updated_at
  BEFORE UPDATE ON public.equipment_model_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.equipment_model_catalog IS
  'Ficha técnica global de modelos de equipo compartida por todo el ecosistema LiftGo.';

ALTER TABLE public.equipment_models
  ADD COLUMN catalog_model_id uuid
  REFERENCES public.equipment_model_catalog(id) ON DELETE RESTRICT;

CREATE INDEX equipment_models_catalog_model_idx
  ON public.equipment_models (catalog_model_id)
  WHERE catalog_model_id IS NOT NULL;

COMMENT ON COLUMN public.equipment_models.catalog_model_id IS
  'Vínculo opcional durante la transición a la ficha global; las tarifas siguen siendo locales.';

-- ---------------------------------------------------------------------
-- 3. Catálogo global de refacciones; stock y costos siguen locales.
-- ---------------------------------------------------------------------
CREATE TABLE public.parts_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  manufacturer text,
  oem_numbers text[] NOT NULL DEFAULT '{}'::text[],
  category text,
  unit_of_measure text NOT NULL DEFAULT 'pieza',
  image_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  source_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  source_record_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parts_catalog_sku_check CHECK (btrim(sku) <> ''),
  CONSTRAINT parts_catalog_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT parts_catalog_unit_check CHECK (btrim(unit_of_measure) <> ''),
  CONSTRAINT parts_catalog_source_unique
    UNIQUE (source_organization_id, source_record_id)
);

CREATE UNIQUE INDEX parts_catalog_sku_unique
  ON public.parts_catalog (upper(btrim(sku)));

CREATE TRIGGER parts_catalog_set_updated_at
  BEFORE UPDATE ON public.parts_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.parts_catalog IS
  'Maestro global de SKUs y datos técnicos; no contiene existencias, costos ni ubicaciones.';

CREATE TABLE public.parts_catalog_equipment_models (
  part_catalog_id uuid NOT NULL
    REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  equipment_model_catalog_id uuid NOT NULL
    REFERENCES public.equipment_model_catalog(id) ON DELETE CASCADE,
  compatibility_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (part_catalog_id, equipment_model_catalog_id)
);

COMMENT ON TABLE public.parts_catalog_equipment_models IS
  'Compatibilidad global entre SKUs de refacciones y modelos de equipos.';

ALTER TABLE public.parts_inventory
  ADD COLUMN catalog_part_id uuid
  REFERENCES public.parts_catalog(id) ON DELETE RESTRICT;

CREATE INDEX parts_inventory_catalog_part_idx
  ON public.parts_inventory (catalog_part_id)
  WHERE catalog_part_id IS NOT NULL;

COMMENT ON COLUMN public.parts_inventory.catalog_part_id IS
  'Vínculo opcional al SKU global; stock, costo, mínimo y ubicación permanecen por empresa.';

-- ---------------------------------------------------------------------
-- 4. Plantillas legales globales, versionadas y asignadas por empresa.
-- ---------------------------------------------------------------------
CREATE TABLE public.legal_template_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  document_type text NOT NULL,
  name text NOT NULL,
  description text,
  current_version_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  source_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  source_record_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_template_definitions_key_unique UNIQUE (template_key),
  CONSTRAINT legal_template_definitions_key_check CHECK (btrim(template_key) <> ''),
  CONSTRAINT legal_template_definitions_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT legal_template_definitions_type_check CHECK (
    document_type IN (
      'rental_contract', 'promissory_note', 'quote', 'booking',
      'delivery', 'return', 'service_order', 'other'
    )
  ),
  CONSTRAINT legal_template_definitions_source_unique
    UNIQUE (source_organization_id, source_record_id)
);

CREATE TRIGGER legal_template_definitions_set_updated_at
  BEFORE UPDATE ON public.legal_template_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.legal_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL
    REFERENCES public.legal_template_definitions(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  checksum_sha256 text NOT NULL,
  change_summary text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_template_versions_definition_version_unique
    UNIQUE (definition_id, version),
  CONSTRAINT legal_template_versions_definition_id_unique
    UNIQUE (definition_id, id),
  CONSTRAINT legal_template_versions_checksum_check
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.legal_template_definitions
  ADD CONSTRAINT legal_template_definitions_current_version_fkey
  FOREIGN KEY (id, current_version_id)
  REFERENCES public.legal_template_versions(definition_id, id)
  ON DELETE RESTRICT;

CREATE TABLE public.organization_legal_template_assignments (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  version_id uuid NOT NULL,
  local_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, definition_id),
  CONSTRAINT organization_legal_template_version_fkey
    FOREIGN KEY (definition_id, version_id)
    REFERENCES public.legal_template_versions(definition_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX organization_legal_template_version_idx
  ON public.organization_legal_template_assignments (version_id);

CREATE TRIGGER organization_legal_template_assignments_set_updated_at
  BEFORE UPDATE ON public.organization_legal_template_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.legal_template_definitions IS
  'Definiciones globales de documentos legales aprobados por LiftGo.';
COMMENT ON TABLE public.legal_template_versions IS
  'Versiones append-only de contenido legal; authenticated no recibe UPDATE ni DELETE.';
COMMENT ON TABLE public.organization_legal_template_assignments IS
  'Versión legal adoptada por cada empresa y campos locales expresamente permitidos.';

ALTER TABLE public.contract_templates
  ADD COLUMN global_template_version_id uuid
  REFERENCES public.legal_template_versions(id) ON DELETE RESTRICT;

CREATE INDEX contract_templates_global_version_idx
  ON public.contract_templates (global_template_version_id)
  WHERE global_template_version_id IS NOT NULL;

COMMENT ON COLUMN public.contract_templates.global_template_version_id IS
  'Versión maestra de LiftGo de la cual deriva esta plantilla local.';

-- ---------------------------------------------------------------------
-- 5. Semilla global desde Org 1 y enlaces de procedencia.
-- ---------------------------------------------------------------------
DO $seed$
DECLARE
  v_source_org uuid;
  v_invalid_parts integer;
  v_duplicate_models integer;
BEGIN
  SELECT id
    INTO v_source_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at, id
  LIMIT 1;

  IF v_source_org IS NULL THEN
    RAISE EXCEPTION 'SEED 0046: no existe una organización activa para usar como Org 1';
  END IF;

  SELECT count(*) INTO v_duplicate_models
  FROM (
    SELECT lower(btrim(manufacturer)), lower(btrim(model))
    FROM public.equipment_models
    WHERE organization_id = v_source_org
    GROUP BY lower(btrim(manufacturer)), lower(btrim(model))
    HAVING count(*) > 1
  ) duplicates;

  IF v_duplicate_models > 0 THEN
    RAISE EXCEPTION
      'SEED 0046: Org 1 contiene % modelos duplicados por fabricante/modelo',
      v_duplicate_models;
  END IF;

  SELECT count(*) INTO v_invalid_parts
  FROM public.parts_inventory
  WHERE organization_id = v_source_org
    AND (sku IS NULL OR btrim(sku) = '');

  IF v_invalid_parts > 0 THEN
    RAISE EXCEPTION
      'SEED 0046: Org 1 contiene % refacciones sin SKU; deben corregirse antes de globalizar',
      v_invalid_parts;
  END IF;

  -- El logo oficial ya está versionado en Git y es el mismo para todas las
  -- empresas. La fila permite que los futuros formatos globales lo descubran
  -- sin volver a introducir logo por organización.
  INSERT INTO public.brand_assets (
    asset_key, asset_type, file_url, alt_text, metadata, version, is_active
  ) VALUES (
    'liftgo_main_lockup',
    'logo',
    '/brand/liftgo-montacargas.png',
    'LiftGo Montacargas',
    jsonb_build_object('source', 'repository', 'tenant_overridable', false),
    1,
    true
  );

  INSERT INTO public.equipment_model_catalog (
    manufacturer, model, capacity_kg, mast_height_m, fuel_type,
    source_organization_id, source_record_id, created_at, updated_at
  )
  SELECT
    btrim(e.manufacturer),
    btrim(e.model),
    e.default_capacity_kg,
    e.default_mast_height_m,
    e.default_fuel_type,
    v_source_org,
    e.id,
    e.created_at,
    e.updated_at
  FROM public.equipment_models e
  WHERE e.organization_id = v_source_org;

  UPDATE public.equipment_models e
     SET catalog_model_id = c.id
    FROM public.equipment_model_catalog c
   WHERE e.organization_id = v_source_org
     AND c.source_organization_id = v_source_org
     AND c.source_record_id = e.id;

  INSERT INTO public.parts_catalog (
    sku, name, category, source_organization_id, source_record_id,
    created_at, updated_at
  )
  SELECT
    upper(btrim(p.sku)),
    p.name,
    p.category,
    v_source_org,
    p.id,
    p.created_at,
    p.updated_at
  FROM public.parts_inventory p
  WHERE p.organization_id = v_source_org;

  UPDATE public.parts_inventory p
     SET catalog_part_id = c.id
    FROM public.parts_catalog c
   WHERE p.organization_id = v_source_org
     AND c.source_organization_id = v_source_org
     AND c.source_record_id = p.id;

  INSERT INTO public.legal_template_definitions (
    template_key, document_type, name, description,
    source_organization_id, source_record_id, created_at, updated_at
  )
  SELECT
    'rental_contract_' || left(replace(t.id::text, '-', ''), 12),
    'rental_contract',
    t.name,
    'Machote inicial promovido desde Org 1',
    v_source_org,
    t.id,
    t.created_at,
    t.updated_at
  FROM public.contract_templates t
  WHERE t.organization_id = v_source_org;

  WITH template_content AS (
    SELECT
      d.id AS definition_id,
      d.source_record_id,
      jsonb_strip_nulls(jsonb_build_object(
        'body_text', t.body_text,
        'intro_text', t.intro_text,
        'declarations_landlord', t.declarations_landlord,
        'declarations_tenant', t.declarations_tenant,
        'clauses', t.clauses,
        'checklist_sections', t.checklist_sections,
        'pagare_text', t.pagare_text
      )) AS content,
      t.created_at
    FROM public.legal_template_definitions d
    JOIN public.contract_templates t ON t.id = d.source_record_id
    WHERE d.source_organization_id = v_source_org
  )
  INSERT INTO public.legal_template_versions (
    definition_id, version, content, checksum_sha256, change_summary, created_at
  )
  SELECT
    definition_id,
    1,
    content,
    encode(extensions.digest(content::text, 'sha256'), 'hex'),
    'Versión inicial promovida desde Org 1',
    created_at
  FROM template_content;

  UPDATE public.legal_template_definitions d
     SET current_version_id = v.id
    FROM public.legal_template_versions v
   WHERE d.source_organization_id = v_source_org
     AND v.definition_id = d.id
     AND v.version = 1;

  INSERT INTO public.organization_legal_template_assignments (
    organization_id, definition_id, version_id, local_overrides, is_active
  )
  SELECT
    v_source_org,
    d.id,
    d.current_version_id,
    '{}'::jsonb,
    true
  FROM public.legal_template_definitions d
  WHERE d.source_organization_id = v_source_org
    AND d.current_version_id IS NOT NULL;

  UPDATE public.contract_templates t
     SET global_template_version_id = d.current_version_id
    FROM public.legal_template_definitions d
   WHERE t.organization_id = v_source_org
     AND d.source_organization_id = v_source_org
     AND d.source_record_id = t.id;
END
$seed$;

-- ---------------------------------------------------------------------
-- 6. Grants y RLS de los catálogos globales.
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.brand_assets,
  public.equipment_model_catalog,
  public.parts_catalog,
  public.parts_catalog_equipment_models,
  public.legal_template_definitions,
  public.legal_template_versions,
  public.organization_legal_template_assignments
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.brand_assets,
  public.equipment_model_catalog,
  public.parts_catalog,
  public.parts_catalog_equipment_models,
  public.legal_template_definitions
TO authenticated;

GRANT SELECT, INSERT ON TABLE public.legal_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.organization_legal_template_assignments
TO authenticated;

GRANT ALL ON TABLE
  public.brand_assets,
  public.equipment_model_catalog,
  public.parts_catalog,
  public.parts_catalog_equipment_models,
  public.legal_template_definitions,
  public.legal_template_versions,
  public.organization_legal_template_assignments
TO service_role;

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_model_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE public.parts_catalog_equipment_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_catalog_equipment_models FORCE ROW LEVEL SECURITY;
ALTER TABLE public.legal_template_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_template_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.legal_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_template_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_legal_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_legal_template_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY brand_assets_read
  ON public.brand_assets FOR SELECT TO authenticated
  USING (
    (SELECT public.is_platform_operator())
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );
CREATE POLICY brand_assets_platform_insert
  ON public.brand_assets FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_operator()));
CREATE POLICY brand_assets_platform_update
  ON public.brand_assets FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_operator()))
  WITH CHECK ((SELECT public.is_platform_operator()));

CREATE POLICY equipment_model_catalog_read
  ON public.equipment_model_catalog FOR SELECT TO authenticated
  USING (
    (SELECT public.is_platform_operator())
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );
CREATE POLICY equipment_model_catalog_platform_insert
  ON public.equipment_model_catalog FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_operator()));
CREATE POLICY equipment_model_catalog_platform_update
  ON public.equipment_model_catalog FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_operator()))
  WITH CHECK ((SELECT public.is_platform_operator()));

CREATE POLICY parts_catalog_read
  ON public.parts_catalog FOR SELECT TO authenticated
  USING (
    (SELECT public.is_platform_operator())
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );
CREATE POLICY parts_catalog_platform_insert
  ON public.parts_catalog FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_operator()));
CREATE POLICY parts_catalog_platform_update
  ON public.parts_catalog FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_operator()))
  WITH CHECK ((SELECT public.is_platform_operator()));

CREATE POLICY parts_catalog_models_read
  ON public.parts_catalog_equipment_models FOR SELECT TO authenticated
  USING (
    (SELECT public.is_platform_operator())
    OR (SELECT public.is_internal_member((SELECT auth.uid())))
  );
CREATE POLICY parts_catalog_models_platform_insert
  ON public.parts_catalog_equipment_models FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_operator()));
CREATE POLICY parts_catalog_models_platform_update
  ON public.parts_catalog_equipment_models FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_operator()))
  WITH CHECK ((SELECT public.is_platform_operator()));

CREATE POLICY legal_template_definitions_read
  ON public.legal_template_definitions FOR SELECT TO authenticated
  USING (
    (SELECT public.is_platform_operator())
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );
CREATE POLICY legal_template_definitions_platform_insert
  ON public.legal_template_definitions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_operator()));
CREATE POLICY legal_template_definitions_platform_update
  ON public.legal_template_definitions FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_operator()))
  WITH CHECK ((SELECT public.is_platform_operator()));

CREATE POLICY legal_template_versions_read
  ON public.legal_template_versions FOR SELECT TO authenticated
  USING (
    (SELECT public.is_platform_operator())
    OR (
      (SELECT public.is_internal_member((SELECT auth.uid())))
      AND EXISTS (
        SELECT 1
        FROM public.legal_template_definitions d
        WHERE d.id = definition_id AND d.is_active
      )
    )
  );
CREATE POLICY legal_template_versions_platform_insert
  ON public.legal_template_versions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_operator()));

CREATE POLICY organization_legal_templates_read
  ON public.organization_legal_template_assignments FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_internal_organization_id())
    AND (SELECT public.is_internal_member((SELECT auth.uid())))
  );
CREATE POLICY organization_legal_templates_insert
  ON public.organization_legal_template_assignments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT public.current_internal_organization_id())
    AND (SELECT public.is_internal_member((SELECT auth.uid())))
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'administrativo'::app_role))
    )
  );
CREATE POLICY organization_legal_templates_update
  ON public.organization_legal_template_assignments FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_internal_organization_id())
    AND (SELECT public.is_internal_member((SELECT auth.uid())))
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'administrativo'::app_role))
    )
  )
  WITH CHECK (
    organization_id = (SELECT public.current_internal_organization_id())
    AND (SELECT public.is_internal_member((SELECT auth.uid())))
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'administrativo'::app_role))
    )
  );
CREATE POLICY organization_legal_templates_delete
  ON public.organization_legal_template_assignments FOR DELETE TO authenticated
  USING (
    organization_id = (SELECT public.current_internal_organization_id())
    AND (SELECT public.is_internal_member((SELECT auth.uid())))
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'administrativo'::app_role))
    )
  );

-- ---------------------------------------------------------------------
-- 7. Verificación fail-closed dentro de la transacción del migrador.
-- ---------------------------------------------------------------------
DO $verify$
DECLARE
  v_table text;
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'brand_assets',
    'equipment_model_catalog',
    'parts_catalog',
    'parts_catalog_equipment_models',
    'legal_template_definitions',
    'legal_template_versions',
    'organization_legal_template_assignments'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      v_fallas := v_fallas || format('%s no existe', v_table);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      v_fallas := v_fallas || format('%s no tiene RLS forzada', v_table);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_models'
      AND column_name = 'catalog_model_id'
  ) THEN
    v_fallas := v_fallas || 'equipment_models.catalog_model_id no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parts_inventory'
      AND column_name = 'catalog_part_id'
  ) THEN
    v_fallas := v_fallas || 'parts_inventory.catalog_part_id no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_templates'
      AND column_name = 'global_template_version_id'
  ) THEN
    v_fallas := v_fallas || 'contract_templates.global_template_version_id no existe';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'POSTFLIGHT 0046:\n%', array_to_string(v_fallas, E'\n');
  END IF;
END
$verify$;
