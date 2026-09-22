-- =====================================================================
-- Ecosistema LiftGo · 0048: SKUs globales e inventario local.
--
-- El maestro global es dueño de SKU, nombre, categoría, fabricante,
-- descripción, unidad de medida y compatibilidad con modelos. Cada empresa
-- conserva existencias, mínimo, costo, ubicación y habilitación.
-- =====================================================================

ALTER TABLE public.parts_inventory
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX parts_inventory_org_catalog_unique
  ON public.parts_inventory (organization_id, catalog_part_id)
  WHERE organization_id IS NOT NULL AND catalog_part_id IS NOT NULL;

COMMENT ON COLUMN public.parts_inventory.is_active IS
  'Habilitación local del SKU; no modifica el estado del maestro LiftGo.';

-- Mantiene las columnas heredadas sincronizadas mientras los consumidores
-- actuales terminan de migrar al catálogo global.
CREATE OR REPLACE FUNCTION public.sync_parts_inventory_from_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_catalog public.parts_catalog%ROWTYPE;
BEGIN
  IF NEW.catalog_part_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_catalog
  FROM public.parts_catalog
  WHERE id = NEW.catalog_part_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU global no encontrado' USING ERRCODE = '23503';
  END IF;

  NEW.sku := v_catalog.sku;
  NEW.name := v_catalog.name;
  NEW.category := coalesce(v_catalog.category, 'Otros');
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.sync_parts_inventory_from_catalog() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER parts_inventory_sync_catalog
  BEFORE INSERT OR UPDATE OF catalog_part_id, sku, name, category
  ON public.parts_inventory
  FOR EACH ROW EXECUTE FUNCTION public.sync_parts_inventory_from_catalog();

CREATE OR REPLACE FUNCTION public.propagate_parts_catalog_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.parts_inventory
  SET sku = NEW.sku,
      name = NEW.name,
      category = coalesce(NEW.category, 'Otros'),
      updated_at = now()
  WHERE catalog_part_id = NEW.id;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.propagate_parts_catalog_to_inventory() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER parts_catalog_propagate_inventory
  AFTER UPDATE OF sku, name, category ON public.parts_catalog
  FOR EACH ROW EXECUTE FUNCTION public.propagate_parts_catalog_to_inventory();

-- Activación local por los mismos roles que hoy administran refacciones.
CREATE OR REPLACE FUNCTION public.activate_parts_catalog(
  p_catalog_part_id uuid,
  p_stock_quantity integer DEFAULT 0,
  p_min_stock_level integer DEFAULT 0,
  p_unit_cost numeric DEFAULT 0,
  p_location text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org uuid;
  v_user uuid := auth.uid();
  v_catalog public.parts_catalog%ROWTYPE;
  v_local_id uuid;
BEGIN
  v_org := public.current_internal_organization_id();
  IF v_user IS NULL OR v_org IS NULL
     OR NOT public.is_internal_member(v_user)
     OR NOT public.is_parts_writer() THEN
    RAISE EXCEPTION 'No autorizado para configurar el inventario de la empresa'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_stock_quantity, 0) < 0
     OR coalesce(p_min_stock_level, 0) < 0
     OR coalesce(p_unit_cost, 0) < 0 THEN
    RAISE EXCEPTION 'Existencias, mínimo y costo no pueden ser negativos'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_catalog
  FROM public.parts_catalog
  WHERE id = p_catalog_part_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU global no encontrado o inactivo' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_local_id
  FROM public.parts_inventory
  WHERE organization_id = v_org
    AND (
      catalog_part_id = p_catalog_part_id
      OR (
        catalog_part_id IS NULL
        AND sku IS NOT NULL
        AND upper(btrim(sku)) = upper(btrim(v_catalog.sku))
      )
    )
  ORDER BY (catalog_part_id = p_catalog_part_id) DESC, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF v_local_id IS NULL THEN
    INSERT INTO public.parts_inventory (
      organization_id, catalog_part_id, sku, name, category,
      stock_quantity, min_stock_level, unit_cost, location, is_active
    ) VALUES (
      v_org, p_catalog_part_id, v_catalog.sku, v_catalog.name,
      coalesce(v_catalog.category, 'Otros'), coalesce(p_stock_quantity, 0),
      coalesce(p_min_stock_level, 0), coalesce(p_unit_cost, 0),
      nullif(btrim(p_location), ''), true
    ) RETURNING id INTO v_local_id;
  ELSE
    UPDATE public.parts_inventory
    SET catalog_part_id = p_catalog_part_id,
        stock_quantity = coalesce(p_stock_quantity, 0),
        min_stock_level = coalesce(p_min_stock_level, 0),
        unit_cost = coalesce(p_unit_cost, 0),
        location = nullif(btrim(p_location), ''),
        is_active = true,
        updated_at = now()
    WHERE id = v_local_id AND organization_id = v_org;
  END IF;

  RETURN v_local_id;
END
$function$;

REVOKE ALL ON FUNCTION public.activate_parts_catalog(uuid, integer, integer, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_parts_catalog(uuid, integer, integer, numeric, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Administración del maestro global: canal servidor + operador.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_list_parts_catalog(p_actor uuid)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  description text,
  manufacturer text,
  oem_numbers text[],
  category text,
  unit_of_measure text,
  image_url text,
  is_active boolean,
  equipment_model_ids uuid[],
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
  SELECT c.id, c.sku, c.name, c.description, c.manufacturer,
         c.oem_numbers, c.category, c.unit_of_measure, c.image_url, c.is_active,
         coalesce(array_agg(DISTINCT x.equipment_model_catalog_id)
           FILTER (WHERE x.equipment_model_catalog_id IS NOT NULL), '{}'::uuid[]),
         count(DISTINCT i.organization_id), c.created_at, c.updated_at
  FROM public.parts_catalog c
  LEFT JOIN public.parts_catalog_equipment_models x ON x.part_catalog_id = c.id
  LEFT JOIN public.parts_inventory i ON i.catalog_part_id = c.id AND i.is_active
  GROUP BY c.id
  ORDER BY c.sku, c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_create_parts_catalog(
  p_actor uuid,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_oem_numbers text[] DEFAULT '{}'::text[],
  p_category text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'pieza',
  p_image_url text DEFAULT NULL,
  p_equipment_model_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_missing integer;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF nullif(btrim(p_sku), '') IS NULL OR nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'SKU y nombre son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_unit_of_measure), '') IS NULL THEN
    RAISE EXCEPTION 'La unidad de medida es obligatoria' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_missing
  FROM unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) model_id
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_model_catalog m WHERE m.id = model_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Uno o más modelos compatibles no existen' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.parts_catalog (
    sku, name, description, manufacturer, oem_numbers, category,
    unit_of_measure, image_url, created_by, updated_by
  ) VALUES (
    upper(btrim(p_sku)), btrim(p_name), nullif(btrim(p_description), ''),
    nullif(btrim(p_manufacturer), ''), coalesce(p_oem_numbers, '{}'::text[]),
    nullif(btrim(p_category), ''), btrim(p_unit_of_measure),
    nullif(btrim(p_image_url), ''), p_actor, p_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.parts_catalog_equipment_models (
    part_catalog_id, equipment_model_catalog_id, created_by
  )
  SELECT v_id, model_id, p_actor
  FROM (SELECT DISTINCT unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) AS model_id) ids;

  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_parts_catalog(
  p_actor uuid,
  p_id uuid,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_oem_numbers text[] DEFAULT '{}'::text[],
  p_category text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'pieza',
  p_image_url text DEFAULT NULL,
  p_equipment_model_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_missing integer;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF nullif(btrim(p_sku), '') IS NULL OR nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'SKU y nombre son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_unit_of_measure), '') IS NULL THEN
    RAISE EXCEPTION 'La unidad de medida es obligatoria' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_missing
  FROM unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) model_id
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_model_catalog m WHERE m.id = model_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Uno o más modelos compatibles no existen' USING ERRCODE = '23503';
  END IF;

  UPDATE public.parts_catalog
  SET sku = upper(btrim(p_sku)), name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      manufacturer = nullif(btrim(p_manufacturer), ''),
      oem_numbers = coalesce(p_oem_numbers, '{}'::text[]),
      category = nullif(btrim(p_category), ''),
      unit_of_measure = btrim(p_unit_of_measure),
      image_url = nullif(btrim(p_image_url), ''),
      updated_by = p_actor, updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU global no encontrado' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.parts_catalog_equipment_models WHERE part_catalog_id = p_id;
  INSERT INTO public.parts_catalog_equipment_models (
    part_catalog_id, equipment_model_catalog_id, created_by
  )
  SELECT p_id, model_id, p_actor
  FROM (SELECT DISTINCT unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) AS model_id) ids;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_set_parts_catalog_active(
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
  UPDATE public.parts_catalog
  SET is_active = p_active, updated_by = p_actor, updated_at = now()
  WHERE id = p_id AND is_active IS DISTINCT FROM p_active;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.parts_catalog WHERE id = p_id) THEN
    RAISE EXCEPTION 'SKU global no encontrado' USING ERRCODE = 'P0002';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.platform_list_parts_catalog(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_create_parts_catalog(uuid, text, text, text, text, text[], text, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_update_parts_catalog(uuid, uuid, text, text, text, text, text[], text, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_set_parts_catalog_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_list_parts_catalog(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_create_parts_catalog(uuid, text, text, text, text, text[], text, text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_update_parts_catalog(uuid, uuid, text, text, text, text, text[], text, text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_parts_catalog_active(uuid, uuid, boolean) TO service_role;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'parts_inventory_org_catalog_unique'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT 0048: falta unicidad local por SKU global';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parts_inventory' AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT 0048: falta parts_inventory.is_active';
  END IF;
END
$verify$;
