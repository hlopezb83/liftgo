-- =====================================================================
-- Ecosistema LiftGo · 0047: modelos globales y configuración local.
--
-- El catálogo global es dueño de fabricante, modelo y ficha técnica.
-- Cada organización conserva alias, habilitación y tarifas. La tabla local
-- sigue duplicando la ficha durante la transición para no romper consultas,
-- pero un trigger la sincroniza desde el catálogo.
-- =====================================================================

-- La unicidad histórica era global e impedía que dos organizaciones usaran
-- el mismo modelo. La identidad local ahora se acota por organización.
DROP INDEX IF EXISTS public.equipment_models_mfr_model_unique;

CREATE UNIQUE INDEX equipment_models_org_mfr_model_unique
  ON public.equipment_models (
    organization_id,
    lower(btrim(manufacturer)),
    lower(btrim(model))
  )
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX equipment_models_org_catalog_unique
  ON public.equipment_models (organization_id, catalog_model_id)
  WHERE organization_id IS NOT NULL AND catalog_model_id IS NOT NULL;

ALTER TABLE public.equipment_models
  ADD COLUMN local_alias text,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.equipment_models.local_alias IS
  'Nombre interno opcional de la organización; no modifica el maestro global.';
COMMENT ON COLUMN public.equipment_models.is_active IS
  'Habilitación local del modelo para formularios y cotizaciones.';

CREATE OR REPLACE FUNCTION public.sync_local_equipment_model_from_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_catalog public.equipment_model_catalog%ROWTYPE;
BEGIN
  IF NEW.catalog_model_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_catalog
  FROM public.equipment_model_catalog
  WHERE id = NEW.catalog_model_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo global no encontrado' USING ERRCODE = '23503';
  END IF;

  NEW.manufacturer := v_catalog.manufacturer;
  NEW.model := v_catalog.model;
  NEW.default_capacity_kg := v_catalog.capacity_kg;
  NEW.default_mast_height_m := v_catalog.mast_height_m;
  NEW.default_fuel_type := coalesce(v_catalog.fuel_type, 'Diesel');
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.sync_local_equipment_model_from_catalog() FROM PUBLIC, anon;

CREATE TRIGGER trg_sync_local_equipment_model_from_catalog
  BEFORE INSERT OR UPDATE OF
    catalog_model_id, manufacturer, model, default_capacity_kg,
    default_mast_height_m, default_fuel_type
  ON public.equipment_models
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_local_equipment_model_from_catalog();

-- Normaliza las filas ya vinculadas con la ficha que acaba de promover Org 1.
UPDATE public.equipment_models m
SET manufacturer = c.manufacturer,
    model = c.model,
    default_capacity_kg = c.capacity_kg,
    default_mast_height_m = c.mast_height_m,
    default_fuel_type = coalesce(c.fuel_type, 'Diesel')
FROM public.equipment_model_catalog c
WHERE c.id = m.catalog_model_id;

-- ---------------------------------------------------------------------
-- Activación local: sólo admin/administrativo de la propia organización.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_equipment_model_catalog(
  p_catalog_model_id uuid,
  p_local_alias text DEFAULT NULL,
  p_daily_rate numeric DEFAULT 0,
  p_weekly_rate numeric DEFAULT 0,
  p_monthly_rate numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org uuid;
  v_user uuid := auth.uid();
  v_catalog public.equipment_model_catalog%ROWTYPE;
  v_local_id uuid;
BEGIN
  v_org := public.current_internal_organization_id();
  IF v_user IS NULL OR v_org IS NULL
     OR NOT public.is_internal_member(v_user)
     OR NOT (
       public.has_role(v_user, 'admin'::public.app_role)
       OR public.has_role(v_user, 'administrativo'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'No autorizado para configurar modelos de la empresa'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_daily_rate, 0) < 0
     OR coalesce(p_weekly_rate, 0) < 0
     OR coalesce(p_monthly_rate, 0) < 0 THEN
    RAISE EXCEPTION 'Las tarifas no pueden ser negativas' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_catalog
  FROM public.equipment_model_catalog
  WHERE id = p_catalog_model_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo global no encontrado o inactivo' USING ERRCODE = 'P0002';
  END IF;

  -- Reconcilia una fila heredada que ya tenga el mismo fabricante/modelo.
  SELECT id INTO v_local_id
  FROM public.equipment_models
  WHERE organization_id = v_org
    AND (
      catalog_model_id = p_catalog_model_id
      OR (
        catalog_model_id IS NULL
        AND lower(btrim(manufacturer)) = lower(btrim(v_catalog.manufacturer))
        AND lower(btrim(model)) = lower(btrim(v_catalog.model))
      )
    )
  ORDER BY (catalog_model_id = p_catalog_model_id) DESC, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF v_local_id IS NULL THEN
    INSERT INTO public.equipment_models (
      organization_id, catalog_model_id, manufacturer, model,
      default_capacity_kg, default_mast_height_m, default_fuel_type,
      default_daily_rate, default_weekly_rate, default_monthly_rate,
      local_alias, is_active
    ) VALUES (
      v_org, p_catalog_model_id, v_catalog.manufacturer, v_catalog.model,
      v_catalog.capacity_kg, v_catalog.mast_height_m,
      coalesce(v_catalog.fuel_type, 'Diesel'),
      coalesce(p_daily_rate, 0), coalesce(p_weekly_rate, 0),
      coalesce(p_monthly_rate, 0), nullif(btrim(p_local_alias), ''), true
    )
    RETURNING id INTO v_local_id;
  ELSE
    UPDATE public.equipment_models
    SET catalog_model_id = p_catalog_model_id,
        local_alias = nullif(btrim(p_local_alias), ''),
        default_daily_rate = coalesce(p_daily_rate, 0),
        default_weekly_rate = coalesce(p_weekly_rate, 0),
        default_monthly_rate = coalesce(p_monthly_rate, 0),
        is_active = true,
        updated_at = now()
    WHERE id = v_local_id AND organization_id = v_org;
  END IF;

  RETURN v_local_id;
END
$function$;

REVOKE ALL ON FUNCTION public.activate_equipment_model_catalog(uuid, text, numeric, numeric, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_equipment_model_catalog(uuid, text, numeric, numeric, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Administración del maestro global: sólo por servidor y con operador.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_list_equipment_model_catalog(p_actor uuid)
RETURNS TABLE (
  id uuid,
  manufacturer text,
  model text,
  capacity_kg numeric,
  mast_height_m numeric,
  fuel_type text,
  specifications jsonb,
  image_url text,
  spec_sheet_url text,
  is_active boolean,
  organization_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  RETURN QUERY
  SELECT c.id, c.manufacturer, c.model, c.capacity_kg, c.mast_height_m,
         c.fuel_type, c.specifications, c.image_url, c.spec_sheet_url,
         c.is_active,
         (SELECT count(DISTINCT m.organization_id)
          FROM public.equipment_models m
          WHERE m.catalog_model_id = c.id AND m.is_active),
         c.created_at, c.updated_at
  FROM public.equipment_model_catalog c
  ORDER BY c.manufacturer, c.model, c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_create_equipment_model_catalog(
  p_actor uuid,
  p_manufacturer text,
  p_model text,
  p_capacity_kg numeric DEFAULT NULL,
  p_mast_height_m numeric DEFAULT NULL,
  p_fuel_type text DEFAULT NULL,
  p_specifications jsonb DEFAULT '{}'::jsonb,
  p_image_url text DEFAULT NULL,
  p_spec_sheet_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF nullif(btrim(p_manufacturer), '') IS NULL OR nullif(btrim(p_model), '') IS NULL THEN
    RAISE EXCEPTION 'Fabricante y modelo son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_capacity_kg IS NOT NULL AND p_capacity_kg <= 0 THEN
    RAISE EXCEPTION 'La capacidad debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;
  IF p_mast_height_m IS NOT NULL AND p_mast_height_m <= 0 THEN
    RAISE EXCEPTION 'La altura de mástil debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.equipment_model_catalog (
    manufacturer, model, capacity_kg, mast_height_m, fuel_type,
    specifications, image_url, spec_sheet_url, created_by, updated_by
  ) VALUES (
    btrim(p_manufacturer), btrim(p_model), p_capacity_kg, p_mast_height_m,
    nullif(btrim(p_fuel_type), ''), coalesce(p_specifications, '{}'::jsonb),
    nullif(btrim(p_image_url), ''), nullif(btrim(p_spec_sheet_url), ''),
    p_actor, p_actor
  ) RETURNING equipment_model_catalog.id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_equipment_model_catalog(
  p_actor uuid,
  p_id uuid,
  p_manufacturer text,
  p_model text,
  p_capacity_kg numeric DEFAULT NULL,
  p_mast_height_m numeric DEFAULT NULL,
  p_fuel_type text DEFAULT NULL,
  p_specifications jsonb DEFAULT '{}'::jsonb,
  p_image_url text DEFAULT NULL,
  p_spec_sheet_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF nullif(btrim(p_manufacturer), '') IS NULL OR nullif(btrim(p_model), '') IS NULL THEN
    RAISE EXCEPTION 'Fabricante y modelo son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_capacity_kg IS NOT NULL AND p_capacity_kg <= 0 THEN
    RAISE EXCEPTION 'La capacidad debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;
  IF p_mast_height_m IS NOT NULL AND p_mast_height_m <= 0 THEN
    RAISE EXCEPTION 'La altura de mástil debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;

  UPDATE public.equipment_model_catalog
  SET manufacturer = btrim(p_manufacturer), model = btrim(p_model),
      capacity_kg = p_capacity_kg, mast_height_m = p_mast_height_m,
      fuel_type = nullif(btrim(p_fuel_type), ''),
      specifications = coalesce(p_specifications, '{}'::jsonb),
      image_url = nullif(btrim(p_image_url), ''),
      spec_sheet_url = nullif(btrim(p_spec_sheet_url), ''),
      updated_by = p_actor, updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo global no encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Mantiene las columnas de compatibilidad sincronizadas. Las tarifas,
  -- alias y habilitación local no aparecen en este UPDATE.
  UPDATE public.equipment_models m
  SET manufacturer = c.manufacturer,
      model = c.model,
      default_capacity_kg = c.capacity_kg,
      default_mast_height_m = c.mast_height_m,
      default_fuel_type = coalesce(c.fuel_type, 'Diesel'),
      updated_at = now()
  FROM public.equipment_model_catalog c
  WHERE c.id = p_id AND m.catalog_model_id = c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_set_equipment_model_catalog_active(
  p_actor uuid,
  p_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Se requiere el estado deseado' USING ERRCODE = '22023';
  END IF;
  UPDATE public.equipment_model_catalog
  SET is_active = p_active, updated_by = p_actor, updated_at = now()
  WHERE id = p_id AND is_active IS DISTINCT FROM p_active;
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.equipment_model_catalog WHERE id = p_id
  ) THEN
    RAISE EXCEPTION 'Modelo global no encontrado' USING ERRCODE = 'P0002';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.platform_list_equipment_model_catalog(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_create_equipment_model_catalog(uuid, text, text, numeric, numeric, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_update_equipment_model_catalog(uuid, uuid, text, text, numeric, numeric, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_set_equipment_model_catalog_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_list_equipment_model_catalog(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_create_equipment_model_catalog(uuid, text, text, numeric, numeric, text, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_update_equipment_model_catalog(uuid, uuid, text, text, numeric, numeric, text, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_equipment_model_catalog_active(uuid, uuid, boolean) TO service_role;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'equipment_models_mfr_model_unique'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT 0047: sigue activo el índice global heredado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'equipment_models_org_catalog_unique'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT 0047: falta unicidad local por catálogo';
  END IF;
END
$verify$;
