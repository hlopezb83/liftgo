-- One invoker-scoped definition for the dashboard count and the paged queue.
CREATE VIEW public.v_overdue_deliveries WITH (security_invoker = true) AS
SELECT d.id, d.organization_id, d.booking_id, d.forklift_id,
  d.delivery_number, d.type, d.address, d.scheduled_date, d.scheduled_time,
  d.status, d.driver_name
FROM public.deliveries d
WHERE d.organization_id = public.current_internal_organization_id()
  AND d.status IN ('scheduled', 'in_transit')
  AND d.scheduled_date < public.today_mty()
  AND NOT EXISTS (
    SELECT 1 FROM public.delivery_historical_reconciliations r
    WHERE r.delivery_id = d.id AND r.organization_id = d.organization_id AND r.revoked_at IS NULL
  );
--> statement-breakpoint
REVOKE ALL ON public.v_overdue_deliveries FROM PUBLIC, anon;
GRANT SELECT ON public.v_overdue_deliveries TO authenticated;
--> statement-breakpoint
-- Preserve every other dashboard field, its role guard, ACLs and invoker RLS.
DO $patch$
DECLARE
  v_definition text := pg_get_functiondef('public.get_dashboard_stats()'::regprocedure);
  v_old text := $old$SELECT count(*) FROM public.deliveries d
      WHERE d.organization_id = public.current_internal_organization_id()
        AND d.status IN ('scheduled', 'in_transit')
        AND d.scheduled_date < public.today_mty()
        AND NOT EXISTS (
          SELECT 1 FROM public.delivery_historical_reconciliations r
          WHERE r.delivery_id = d.id AND r.organization_id = d.organization_id AND r.revoked_at IS NULL
        )$old$;
BEGIN
  IF strpos(v_definition, v_old) = 0 OR EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = 'public.get_dashboard_stats()'::regprocedure AND prosecdef
  ) THEN
    RAISE EXCEPTION 'Unexpected dashboard overdue definition; review before applying 0141';
  END IF;
  EXECUTE replace(v_definition, v_old, 'SELECT count(*) FROM public.v_overdue_deliveries');
END;
$patch$;
--> statement-breakpoint
CREATE FUNCTION public.get_overdue_deliveries_page(
  p_expected_organization_id uuid,
  p_search text DEFAULT NULL,
  p_type text DEFAULT 'all',
  p_status text DEFAULT 'all',
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
  v_sort jsonb;
  v_column text;
  v_order text := '';
  v_seen text[] := ARRAY[]::text[];
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para consultar los transportes.' USING ERRCODE = '42501';
  END IF;
  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR p_expected_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa de los transportes.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid
  ORDER BY array_position(ARRAY['admin','administrativo','auditor','ventas','dispatcher','mechanic','customer']::text[], ur.role::text)
  LIMIT 1;
  IF v_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role::text = v_role AND rp.module = 'Entregas' AND rp.access_level IN ('read', 'full')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar los transportes.' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page < 0 OR p_page > 100000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
    OR p_type IS NULL OR p_type NOT IN ('all','delivery','pickup','return')
    OR p_status IS NULL OR p_status NOT IN ('all','scheduled','in_transit')
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
      OR v_sort->>'id' NOT IN ('delivery_number','type','scheduled_date','forklift_name','driver_name','status')
      OR v_sort->>'id' = ANY(v_seen) THEN
      RAISE EXCEPTION 'Columna de orden inválida.' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_sort->>'id');
    v_column := CASE v_sort->>'id'
      WHEN 'delivery_number' THEN 'f.delivery_number'
      WHEN 'type' THEN 'f.type_label'
      WHEN 'scheduled_date' THEN 'f.scheduled_date'
      WHEN 'forklift_name' THEN 'f.forklift_name'
      WHEN 'driver_name' THEN 'f.driver_name'
      WHEN 'status' THEN 'f.status'
    END;
    v_order := v_order || v_column || CASE WHEN (v_sort->>'desc')::boolean THEN ' DESC' ELSE ' ASC' END || ' NULLS LAST, ';
  END LOOP;
  -- Stable oldest-first order also resolves ties in every user-selected order.
  v_order := v_order || 'f.scheduled_date ASC, f.id ASC';
  EXECUTE format($query$
    WITH filtered AS MATERIALIZED (
      SELECT d.*, unit.name AS forklift_name,
        CASE d.type WHEN 'delivery' THEN 'Entrega' WHEN 'pickup' THEN 'Recolección' ELSE 'Devolución' END AS type_label,
        CASE WHEN unit.id IS NULL THEN NULL ELSE jsonb_build_object('name', unit.name, 'model', unit.model) END AS forklifts
      FROM public.v_overdue_deliveries d
      LEFT JOIN public.forklifts unit ON unit.id = d.forklift_id AND unit.organization_id = d.organization_id
      WHERE d.organization_id = $1
        AND ($2 = 'all' OR d.type = $2)
        AND ($3 = 'all' OR d.status = $3)
        AND ($4 = '' OR strpos(lower(coalesce(d.delivery_number, '')), $4) > 0
          OR strpos(lower(coalesce(d.driver_name, '')), $4) > 0
          OR strpos(lower(coalesce(d.address, '')), $4) > 0)
    ), bounds AS (
      SELECT count(*) AS total, least($5::bigint, greatest(0::bigint, (count(*) - 1) / $6))::integer AS page_index
      FROM filtered
    )
    SELECT jsonb_build_object('totalCount', b.total, 'pageIndex', b.page_index, 'today', public.today_mty(),
      'items', coalesce((SELECT jsonb_agg(to_jsonb(f) - 'forklift_name' - 'type_label' ORDER BY %1$s)
        FROM (SELECT * FROM filtered f ORDER BY %1$s LIMIT $6 OFFSET b.page_index::bigint * $6) f), '[]'::jsonb))
    FROM bounds b
  $query$, v_order)
  INTO v_result USING v_org, p_type, p_status, lower(btrim(coalesce(p_search, ''))), p_page, p_page_size;
  RETURN v_result;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_overdue_deliveries_page(uuid,text,text,text,integer,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overdue_deliveries_page(uuid,text,text,text,integer,integer,jsonb) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
