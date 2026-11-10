-- Candidate only: read-only quote paging. No business data or policies are changed.
-- Requires PostgreSQL UTF8 + ICU. Never fall back silently to lexical folio order.
DO $migration$
DECLARE c record;
BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Quote search requires UTF8' USING ERRCODE = '0A000';
  END IF;
  IF to_regcollation('public.quotes_natural_order') IS NULL THEN
    CREATE COLLATION public.quotes_natural_order
      (provider = icu, locale = 'und-u-kn-ks-level1', deterministic = false);
  END IF;
  SELECT collprovider, collisdeterministic, collversion, pg_collation_actual_version(oid) AS actual_version,
    coalesce(to_jsonb(pc)->>'colllocale', to_jsonb(pc)->>'colliculocale') AS locale
    INTO c FROM pg_catalog.pg_collation pc
    WHERE oid = 'public.quotes_natural_order'::regcollation;
  IF c.collprovider IS DISTINCT FROM 'i' OR c.collisdeterministic IS DISTINCT FROM false
    OR c.locale IS DISTINCT FROM 'und-u-kn-ks-level1' OR c.collversion IS NULL OR c.actual_version IS NULL
    OR c.collversion IS DISTINCT FROM c.actual_version THEN
    RAISE EXCEPTION 'Unexpected quotes_natural_order definition' USING ERRCODE = '55000';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.normalize_quote_search(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  -- ICU lower handles non-ASCII case even when the database locale is C.
  -- Regex uses deterministic C; PG17 rejects regex on a nondeterministic collation.
  -- Preserve common legacy Latin transliterations not decomposed by NFD.
  SELECT replace(replace(replace(replace(translate(
    regexp_replace(lower(normalize(p_value, NFD) COLLATE public.quotes_natural_order) COLLATE "C",
      U&'[\0300-\036f]', '', 'g'), 'ðøđł', 'dodl'),
    'æ', 'ae'), 'œ', 'oe'), 'ĳ', 'ij'), 'þ', 'th');
$function$;
REVOKE ALL ON FUNCTION public.normalize_quote_search(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_quote_search(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quotes_page(
  p_expected_organization_id uuid,
  p_search text DEFAULT NULL,
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
  v_search text;
  v_digits text;
  v_folio text;
  v_sort jsonb;
  v_column text;
  v_order text := '';
  v_seen text[] := ARRAY[]::text[];
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para consultar las cotizaciones.' USING ERRCODE = '42501';
  END IF;
  v_org := public.current_internal_organization_id();
  -- Expected scope is an assertion only. The caller can never choose the tenant.
  IF v_org IS NULL OR p_expected_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa de las cotizaciones.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid
  ORDER BY array_position(ARRAY['admin','administrativo','auditor','ventas','dispatcher','mechanic','customer']::text[], ur.role::text)
  LIMIT 1;
  IF v_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role::text = v_role AND rp.module = 'Cotizaciones' AND rp.access_level IN ('read', 'full')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar las cotizaciones.' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page < 0 OR p_page > 100000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
    OR p_status IS NULL OR p_status NOT IN ('all','draft','sent','accepted','converted','rejected','expired','cancelled')
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
      OR v_sort->>'id' NOT IN ('quote_number','customer_name','total','status','valid_until')
      OR v_sort->>'id' = ANY(v_seen) THEN
      RAISE EXCEPTION 'Columna de orden inválida.' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_sort->>'id');
    -- Every expression is a literal from the allowlist. No user SQL is interpolated.
    v_column := CASE v_sort->>'id'
      WHEN 'quote_number' THEN 'f.quote_number COLLATE public.quotes_natural_order'
      WHEN 'customer_name' THEN 'f.customer_name COLLATE public.quotes_natural_order'
      WHEN 'status' THEN 'f.status COLLATE public.quotes_natural_order'
      WHEN 'total' THEN 'f.total'
      WHEN 'valid_until' THEN 'f.valid_until'
    END;
    v_order := v_order || v_column || CASE WHEN (v_sort->>'desc')::boolean THEN ' DESC' ELSE ' ASC' END || ' NULLS LAST, ';
  END LOOP;
  v_order := v_order || 'f.created_at DESC, f.id DESC';
  v_search := public.normalize_quote_search(btrim(coalesce(p_search, '')));
  v_digits := (regexp_match(btrim(coalesce(p_search, '')), '^(?:COT-)?([0-9]+)$', 'i'))[1];
  IF v_digits IS NOT NULL THEN
    v_digits := coalesce(nullif(ltrim(v_digits, '0'), ''), '0');
    v_folio := 'COT-' || lpad(v_digits, greatest(4, length(v_digits)), '0');
  END IF;
  EXECUTE format($query$
    WITH filtered AS MATERIALIZED (
      SELECT q.id, q.quote_number, q.customer_id, q.customer_name, q.forklift_id,
        q.start_date, q.end_date, q.subtotal, q.tax_rate, q.tax_amount, q.total,
        q.status, q.valid_until, q.quote_type, q.currency, q.tipo_cambio, q.created_at
      FROM public.quotes q
      WHERE q.organization_id = $1 AND q.is_e2e IS DISTINCT FROM true
        AND ($2 = 'all' OR q.status = $2)
        AND ($3 = '' OR strpos(public.normalize_quote_search(q.quote_number), $3) > 0
          OR strpos(public.normalize_quote_search(q.customer_name), $3) > 0 OR q.quote_number = $4)
    ), numbered AS (
      SELECT f.*, row_number() OVER (ORDER BY %s) AS rn FROM filtered f
    ), bounds AS (
      SELECT count(*) AS total, least($5::bigint, greatest(0::bigint, (count(*) - 1) / $6))::integer AS page_index
      FROM filtered
    )
    SELECT jsonb_build_object('totalCount', b.total, 'pageIndex', b.page_index,
      'items', coalesce((SELECT jsonb_agg(to_jsonb(n) - 'rn' - 'created_at' ORDER BY n.rn)
        FROM numbered n WHERE n.rn > b.page_index::bigint * $6 AND n.rn <= (b.page_index::bigint + 1) * $6), '[]'::jsonb))
    FROM bounds b
  $query$, v_order)
  INTO v_result USING v_org, p_status, v_search, v_folio, p_page, p_page_size;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_quotes_page(uuid,text,text,integer,integer,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_quotes_page(uuid,text,text,integer,integer,jsonb) TO authenticated;
COMMENT ON FUNCTION public.get_quotes_page(uuid,text,text,integer,integer,jsonb) IS
  'Read-only scoped quote page: invoker RLS, internal active organization, effective module permission, literal normalized search, ICU natural order and count/page in one SQL snapshot.';
