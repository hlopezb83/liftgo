-- Low-stock filtering before count/order/paging. The original six-argument RPC remains callable.
CREATE OR REPLACE FUNCTION public.get_inventory_page(
  p_low_stock boolean,
  p_expected_organization_id uuid,
  p_search text DEFAULT NULL,
  p_category text DEFAULT 'all',
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 25,
  p_sort jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
  v_role text;
  v_search text;
  v_sort jsonb;
  v_column text;
  v_order text := '';
  v_seen text[] := ARRAY[]::text[];
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para consultar las refacciones.' USING ERRCODE = '42501';
  END IF;
  v_org := public.current_internal_organization_id();
  -- Expected scope is an assertion only. The caller can never choose the tenant.
  IF v_org IS NULL OR p_expected_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa de las refacciones.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid
  ORDER BY array_position(ARRAY['admin','administrativo','auditor','ventas','dispatcher','mechanic','customer']::text[], ur.role::text)
  LIMIT 1;
  IF v_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role::text = v_role AND rp.module = 'Refacciones' AND rp.access_level IN ('read', 'full')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar las refacciones.' USING ERRCODE = '42501';
  END IF;
  IF p_low_stock IS NULL OR p_page IS NULL OR p_page < 0 OR p_page > 100000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
    OR p_category IS NULL OR length(p_category) > 100
    OR length(coalesce(p_search, '')) > 256
    OR p_sort IS NULL OR jsonb_typeof(p_sort) <> 'array' THEN
    RAISE EXCEPTION 'Parámetros de búsqueda o paginación inválidos.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_sort) > 5 THEN
    RAISE EXCEPTION 'Demasiadas columnas de orden.' USING ERRCODE = '22023';
  END IF;
  FOR v_sort IN SELECT value FROM jsonb_array_elements(p_sort) LOOP
    IF jsonb_typeof(v_sort) <> 'object'
      OR jsonb_typeof(v_sort->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_sort->'desc') IS DISTINCT FROM 'boolean'
      OR v_sort - 'id' - 'desc' <> '{}'::jsonb
      OR v_sort->>'id' NOT IN ('sku','name','category','unit_cost','stock_quantity')
      OR v_sort->>'id' = ANY(v_seen) THEN
      RAISE EXCEPTION 'Columna de orden inválida.' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_sort->>'id');
    -- Every expression is a literal from the allowlist. No user SQL is interpolated.
    v_column := CASE v_sort->>'id'
      WHEN 'sku' THEN 'coalesce(f.sku, '''') COLLATE public.quotes_natural_order'
      WHEN 'name' THEN 'f.name COLLATE public.quotes_natural_order'
      WHEN 'category' THEN 'f.category COLLATE public.quotes_natural_order'
      WHEN 'unit_cost' THEN 'f.unit_cost'
      WHEN 'stock_quantity' THEN 'f.stock_quantity'
    END;
    v_order := v_order || v_column || CASE WHEN (v_sort->>'desc')::boolean THEN ' DESC' ELSE ' ASC' END || ' NULLS LAST, ';
  END LOOP;
  v_order := v_order || 'f.name COLLATE public.quotes_natural_order ASC, f.id ASC';
  v_search := lower(btrim(coalesce(p_search, '')) COLLATE public.quotes_natural_order);
  EXECUTE format($query$
    WITH visible AS MATERIALIZED (
      SELECT q.id, q.organization_id, q.catalog_part_id, q.name, q.sku, q.category, q.stock_quantity,
        q.min_stock_level, q.unit_cost, q.location, q.is_active, q.created_at, q.updated_at
      FROM public.parts_inventory q
      WHERE q.organization_id = $1 AND q.is_active = true
    ), filtered AS MATERIALIZED (
      SELECT * FROM visible q
      WHERE ($2 = 'all' OR q.category = $2)
        AND (NOT $6 OR q.stock_quantity <= q.min_stock_level)
        AND ($3 = '' OR strpos(lower(q.name COLLATE public.quotes_natural_order) COLLATE "C", $3 COLLATE "C") > 0
          OR strpos(lower(coalesce(q.sku, '') COLLATE public.quotes_natural_order) COLLATE "C", $3 COLLATE "C") > 0)
    ), numbered AS (
      SELECT f.*, row_number() OVER (ORDER BY %s) AS rn FROM filtered f
    ), bounds AS (
      SELECT count(*) AS total, least($4::bigint, greatest(0::bigint, (count(*) - 1) / $5))::integer AS page_index
      FROM filtered
    )
    SELECT jsonb_build_object('totalCount', b.total, 'pageIndex', b.page_index,
      'lowStockCount', (SELECT count(*) FROM visible WHERE stock_quantity <= min_stock_level),
      'items', coalesce((SELECT jsonb_agg(to_jsonb(n) - 'rn' ORDER BY n.rn)
        FROM numbered n WHERE n.rn > b.page_index::bigint * $5 AND n.rn <= (b.page_index::bigint + 1) * $5), '[]'::jsonb))
    FROM bounds b
  $query$, v_order)
  INTO v_result USING v_org, p_category, v_search, p_page, p_page_size, p_low_stock;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_inventory_page(boolean,uuid,text,text,integer,integer,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_page(boolean,uuid,text,text,integer,integer,jsonb) TO authenticated;
COMMENT ON FUNCTION public.get_inventory_page(boolean,uuid,text,text,integer,integer,jsonb) IS
  'Read-only inventory page and global active low-stock count in one snapshot; session tenant, effective Refacciones permission and invoker RLS. Filters apply before paging, not to the global indicator.';

-- A required first argument avoids ambiguous PostgREST overloads for existing callers.
CREATE OR REPLACE FUNCTION public.get_inventory_page(
  p_expected_organization_id uuid,
  p_search text DEFAULT NULL,
  p_category text DEFAULT 'all',
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 25,
  p_sort jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT public.get_inventory_page(false, p_expected_organization_id, p_search, p_category, p_page, p_page_size, p_sort);
$function$;
REVOKE ALL ON FUNCTION public.get_inventory_page(uuid,text,text,integer,integer,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_page(uuid,text,text,integer,integer,jsonb) TO authenticated;
COMMENT ON FUNCTION public.get_inventory_page(uuid,text,text,integer,integer,jsonb) IS
  'Compatibility entry point: unchanged inventory listing, using the same invoker-RLS implementation as the low-stock filter.';
