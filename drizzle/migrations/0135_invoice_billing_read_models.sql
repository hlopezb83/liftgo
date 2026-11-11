-- Bounded invoice-editor reads with complete relevant billing evidence.
CREATE OR REPLACE FUNCTION public.get_invoice_booking_candidate_page(
  p_expected_organization_id uuid,
  p_search text DEFAULT '',
  p_customer_id uuid DEFAULT NULL,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_linked_ids uuid[] DEFAULT '{}'::uuid[],
  p_include_e2e boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_org uuid := public.current_internal_organization_id();
  v_uid uuid := (SELECT auth.uid());
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_role text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR p_expected_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa de las reservas.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid
    ORDER BY array_position(ARRAY['admin','administrativo','auditor','ventas','dispatcher','mechanic','customer']::text[], ur.role::text) LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'administrativo', 'auditor') OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp WHERE rp.role::text = v_role
      AND rp.module = 'Facturas' AND rp.access_level IN ('read', 'full')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar las reservas facturables.' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page < 0 OR p_page > 100000 OR p_page_size IS NULL
    OR p_page_size < 0 OR p_page_size > 100 OR length(coalesce(p_search, '')) > 256
    OR p_linked_ids IS NULL OR array_position(p_linked_ids, NULL) IS NOT NULL
    OR p_include_e2e IS NULL THEN
    RAISE EXCEPTION 'Parámetros de reservas inválidos.' USING ERRCODE = '22023';
  END IF;
  WITH matched AS MATERIALIZED (
    SELECT b.*, CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('name', f.name, 'model', f.model) END AS forklifts
    FROM public.bookings b LEFT JOIN public.forklifts f ON f.id = b.forklift_id AND f.organization_id = v_org
    WHERE b.organization_id = v_org AND (p_include_e2e OR b.is_e2e IS NOT TRUE)
      AND p_page_size > 0 AND b.status IN ('confirmed', 'completed')
      AND (p_customer_id IS NULL OR b.customer_id = p_customer_id)
      AND (v_search = '' OR strpos(lower(concat_ws(' ', b.booking_number, f.name, b.customer_name, b.id::text)), v_search) > 0)
    ORDER BY b.start_date DESC, b.id ASC
    LIMIT p_page_size + 1 OFFSET p_page::bigint * p_page_size
  ), page_rows AS (
    SELECT m.* FROM matched m ORDER BY m.start_date DESC, m.id ASC LIMIT p_page_size
  ), linked_rows AS (
    SELECT b.*, CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('name', f.name, 'model', f.model) END AS forklifts
    FROM public.bookings b LEFT JOIN public.forklifts f ON f.id = b.forklift_id AND f.organization_id = v_org
    WHERE b.organization_id = v_org AND (p_include_e2e OR b.is_e2e IS NOT TRUE) AND b.id = ANY(p_linked_ids)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.start_date DESC, p.id ASC) FROM page_rows p), '[]'::jsonb),
    'linked', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.start_date DESC, v.id ASC) FROM linked_rows v), '[]'::jsonb),
    'hasMore', (SELECT count(*) > p_page_size FROM matched), 'pageIndex', p_page
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_invoice_booking_candidate_page(uuid,text,uuid,integer,integer,uuid[],boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_booking_candidate_page(uuid,text,uuid,integer,integer,uuid[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_invoice_booking_billing_evidence(
  p_expected_organization_id uuid,
  p_booking_ids uuid[],
  p_include_e2e boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_org uuid := public.current_internal_organization_id();
  v_uid uuid := (SELECT auth.uid());
  v_role text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR p_expected_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa del historial.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid
    ORDER BY array_position(ARRAY['admin','administrativo','auditor','ventas','dispatcher','mechanic','customer']::text[], ur.role::text) LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'administrativo', 'auditor') OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp WHERE rp.role::text = v_role
      AND rp.module = 'Facturas' AND rp.access_level IN ('read', 'full')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el historial de facturación.' USING ERRCODE = '42501';
  END IF;
  -- Preserve historical invoices with any number of linked bookings in one snapshot.
  IF p_booking_ids IS NULL OR array_position(p_booking_ids, NULL) IS NOT NULL OR p_include_e2e IS NULL THEN
    RAISE EXCEPTION 'Reservas de historial inválidas.' USING ERRCODE = '22023';
  END IF;
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT b.id FROM public.bookings b WHERE b.organization_id = v_org AND b.id = ANY(p_booking_ids)
      AND (p_include_e2e OR b.is_e2e IS NOT TRUE)
  ), relevant_ids AS (
    SELECT i.id FROM requested r JOIN public.invoices i ON i.booking_id = r.id WHERE i.organization_id = v_org
    UNION
    SELECT ib.invoice_id FROM requested r JOIN public.invoice_bookings ib ON ib.booking_id = r.id
  ), relevant_invoices AS MATERIALIZED (
    SELECT i.id, i.booking_id, i.status, i.line_items, i.moneda, i.billing_period_start, i.billing_period_end
    FROM relevant_ids r JOIN public.invoices i ON i.id = r.id
    WHERE i.organization_id = v_org AND i.status <> 'cancelled'
  ), claims AS (
    SELECT i.id AS invoice_id, i.booking_id
    FROM relevant_invoices i JOIN public.bookings b ON b.id = i.booking_id AND b.organization_id = v_org
    UNION ALL
    SELECT i.id, ib.booking_id
    FROM relevant_invoices i JOIN public.invoice_bookings ib ON ib.invoice_id = i.id
      JOIN public.bookings b ON b.id = ib.booking_id AND b.organization_id = v_org
  )
  SELECT jsonb_build_object(
    'bookingIds', coalesce((SELECT jsonb_agg(r.id ORDER BY r.id) FROM requested r), '[]'::jsonb),
    'invoices', coalesce((SELECT jsonb_agg(to_jsonb(i) - 'booking_id' ORDER BY i.id) FROM relevant_invoices i), '[]'::jsonb),
    'claims', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.invoice_id, c.booking_id) FROM claims c), '[]'::jsonb),
    'extensions', coalesce((SELECT jsonb_agg(jsonb_build_object('booking_id', e.booking_id,
      'original_end_date', e.original_end_date, 'new_end_date', e.new_end_date, 'invoice_id', e.invoice_id, 'pending_invoice_id', e.pending_invoice_id)
      ORDER BY e.booking_id, e.original_end_date, e.id) FROM public.booking_extensions e
      WHERE e.organization_id = v_org AND e.booking_id IN (SELECT r.id FROM requested r)), '[]'::jsonb),
    'returns', coalesce((SELECT jsonb_agg(jsonb_build_object('booking_id', r.booking_id, 'forklift_id', r.forklift_id, 'inspected_at', r.inspected_at)
      ORDER BY r.booking_id, r.inspected_at, r.id) FROM public.return_inspections r
      WHERE r.organization_id = v_org AND r.booking_id IN (SELECT q.id FROM requested q)), '[]'::jsonb)
  ) INTO v_result;
  IF (SELECT count(DISTINCT id) FROM unnest(p_booking_ids) AS ids(id)) <> jsonb_array_length(v_result->'bookingIds') THEN
    RAISE EXCEPTION 'No se pudo verificar el historial completo de las reservas.' USING ERRCODE = '42501';
  END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_invoice_booking_billing_evidence(uuid,uuid[],boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_booking_billing_evidence(uuid,uuid[],boolean) TO authenticated;
