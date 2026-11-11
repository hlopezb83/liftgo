-- Dashboard aggregates use the same effective occupancy calculation as fleet.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_build_object(
    'fleet_counts', public.get_dashboard_fleet_counts(),
    'pending_deliveries_count', (
      SELECT count(*) FROM public.deliveries d
      WHERE d.organization_id = public.current_internal_organization_id()
        AND d.status IN ('scheduled', 'in_transit')
        AND d.scheduled_date < public.today_mty()
        AND NOT EXISTS (
          SELECT 1 FROM public.delivery_historical_reconciliations r
          WHERE r.delivery_id = d.id AND r.organization_id = d.organization_id AND r.revoked_at IS NULL
        )
    ),
    'invoice_stats', (
      SELECT json_build_object(
        'outstanding_revenue', (
          SELECT COALESCE(SUM(v.balance_mxn), 0)
          FROM public.v_invoices_with_balance v
          WHERE v.status IN ('sent', 'partial', 'overdue')
            AND COALESCE(v.cancellation_status, '') <> 'accepted'
            AND v.is_e2e IS NOT TRUE
        ),
        'breakdown', COALESCE((
          SELECT json_agg(json_build_object('status', sub.status, 'count', sub.cnt, 'total', sub.sum_total))
          FROM (
            SELECT status, COUNT(*) as cnt,
              -- FIX R6-21: convertir a MXN antes de sumar (antes mezclaba
              -- USD y MXN 1:1 en el desglose por estatus).
              SUM(CASE
                WHEN upper(COALESCE(moneda, 'MXN')) = 'MXN' THEN total
                WHEN NOT public.fx_is_missing(moneda, tipo_cambio) THEN total * tipo_cambio
                ELSE 0
              END) as sum_total
            FROM invoices WHERE is_e2e IS NOT TRUE GROUP BY status
          ) sub
        ), '[]'::json)
      )
    ),
    'overdue_invoices', COALESCE((
      SELECT json_agg(json_build_object(
        'id', v.id,
        'invoice_number', v.invoice_number,
        'total', v.total,
        'balance', v.balance,
        'balance_mxn', v.balance_mxn,
        'moneda', v.moneda,
        'tipo_cambio', v.tipo_cambio,
        'due_date', v.due_date
      ) ORDER BY v.due_date ASC)
      FROM public.v_invoices_with_balance v
      WHERE v.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(v.cancellation_status, '') <> 'accepted'
        AND v.due_date IS NOT NULL
        AND v.due_date < public.today_mty()
        AND COALESCE(v.balance_mxn, 0) > 0
        AND v.is_e2e IS NOT TRUE
    ), '[]'::json),
    'overdue_bookings', COALESCE((
      SELECT json_agg(json_build_object(
        'booking_id', x.booking_id,
        'forklift_name', x.forklift_name,
        'forklift_id', x.forklift_id,
        'customer_name', x.customer_name,
        'end_date', x.end_date,
        'days_overdue', x.days_overdue
      ) ORDER BY x.end_date ASC)
      FROM (
        SELECT b.id AS booking_id,
               f.name AS forklift_name,
               f.id   AS forklift_id,
               c.name AS customer_name,
               b.end_date,
               (public.today_mty() - b.end_date)::int AS days_overdue
        FROM public.bookings b
        JOIN public.forklifts f ON f.id = b.forklift_id
        LEFT JOIN public.customers c ON c.id = b.customer_id
        WHERE b.status = 'confirmed'
          AND b.is_e2e IS NOT TRUE
          AND b.return_status IS NULL
          AND b.start_date <= public.today_mty()
          AND b.end_date < public.today_mty()
          AND EXISTS (
            SELECT 1 FROM public.deliveries d
            WHERE d.booking_id = b.id
              AND d.organization_id = b.organization_id
              AND d.type = 'delivery'
              AND d.status = 'completed'
          )
          AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
      ) x
    ), '[]'::json),
    'utilization', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', sub.name,
        'utilization', sub.util_pct,
        'revenue', sub.revenue
      ) ORDER BY sub.revenue DESC), '[]'::json)
      FROM (
        SELECT
          f.id,
          f.name,
          -- 2A-8: días realmente ocupados (entrega/devolución reales) en vez
          -- de las fechas planeadas de la reserva.
          LEAST(ROUND(
            COALESCE(SUM(GREATEST(o.occ_end - o.occ_start + 1, 0)), 0)::numeric /
            GREATEST(public.today_mty() - f.created_at::date, 1) * 100
          ), 100) as util_pct,
          COALESCE((
            -- FIX A1: incluye facturas multi-reserva (invoice_bookings) via
            -- la vista de atribucion; ya viene convertida a MXN.
            SELECT SUM(r.total_mxn_share)
            FROM public.v_invoice_forklift_revenue r
            WHERE r.forklift_id = f.id
              AND r.status = 'paid'
              AND r.is_e2e IS NOT TRUE
          ), 0) as revenue
        FROM forklifts f
        LEFT JOIN public.v_booking_occupancy o ON o.forklift_id = f.id
          AND o.is_e2e IS NOT TRUE
          AND o.occ_start <= public.today_mty()
        WHERE f.status NOT IN ('sold', 'retired')
          AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
        GROUP BY f.id, f.name, f.created_at
        LIMIT 10
      ) sub
    ),
    'maintenance_alerts', (
      SELECT COALESCE(json_agg(json_build_object(
        'forklift_name', f.name,
        'forklift_id', f.id,
        'next_date', ml.next_service_date
      ) ORDER BY ml.next_service_date ASC), '[]'::json)
      FROM (
        SELECT DISTINCT ON (forklift_id) forklift_id, next_service_date
        FROM maintenance_logs
        WHERE next_service_date IS NOT NULL
          AND deleted_at IS NULL
          AND is_e2e IS NOT TRUE
        ORDER BY forklift_id, performed_at DESC
      ) ml
      JOIN forklifts f ON f.id = ml.forklift_id
      WHERE ml.next_service_date <= (public.today_mty() + INTERVAL '7 days')
        AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
    ),
    'cash_flow', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      invoiced_cte AS (
        SELECT mo.m,
          COALESCE(SUM(CASE
            WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.total
            WHEN NOT public.fx_is_missing(i.moneda, i.tipo_cambio) THEN i.total * i.tipo_cambio
            ELSE 0
          END), 0) AS invoiced
        FROM months mo
        LEFT JOIN invoices i
          ON i.issued_at::date BETWEEN mo.month_start AND mo.month_end
          AND i.status <> 'draft'
          AND COALESCE(i.cancellation_status, '') <> 'accepted'
          AND i.is_e2e IS NOT TRUE
        GROUP BY mo.m
      ),
      paid_cte AS (
        SELECT mo.m, COALESCE(SUM(src.amt), 0) AS paid
        FROM months mo
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            p.amount_mxn,
            p.amount * COALESCE(
              NULLIF(p.exchange_rate, 0),
              NULLIF(pi.tipo_cambio, 0),
              CASE WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN' THEN 1 END
            )
          ) AS amt
          FROM payments p
          JOIN invoices pi ON pi.id = p.invoice_id
            AND pi.status <> 'cancelled'
            AND COALESCE(pi.cancellation_status, '') <> 'accepted'
            AND pi.is_e2e IS NOT TRUE
          WHERE p.payment_date BETWEEN mo.month_start AND mo.month_end
          UNION ALL
          SELECT COALESCE(CASE
            WHEN upper(COALESCE(i2.moneda, 'MXN')) = 'MXN' THEN i2.total
            WHEN i2.tipo_cambio IS NOT NULL AND i2.tipo_cambio > 0 THEN i2.total * i2.tipo_cambio
          END, 0)
          FROM invoices i2
          WHERE i2.status = 'paid'
            AND i2.paid_at IS NOT NULL
            AND i2.paid_at::date BETWEEN mo.month_start AND mo.month_end
            AND COALESCE(i2.cancellation_status, '') <> 'accepted'
            AND i2.is_e2e IS NOT TRUE
            AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.invoice_id = i2.id)
        ) src ON TRUE
        GROUP BY mo.m
      ),
      credited_cte AS (
        SELECT mo.m,
          COALESCE(SUM(CASE
            WHEN upper(COALESCE(cn.currency, 'MXN')) = 'MXN' THEN cn.total
            WHEN inv.tipo_cambio IS NOT NULL AND inv.tipo_cambio > 0 THEN cn.total * inv.tipo_cambio
            ELSE 0
          END), 0) AS credited
        FROM months mo
        LEFT JOIN credit_notes cn
          ON cn.issued_at::date BETWEEN mo.month_start AND mo.month_end
          AND cn.cfdi_status = 'stamped'
          AND cn.status <> 'cancelled'
          AND cn.cancellation_status IS DISTINCT FROM 'accepted'
        LEFT JOIN invoices inv
          ON inv.id = cn.invoice_id
          AND inv.is_e2e IS NOT TRUE
        WHERE cn.id IS NULL OR inv.id IS NOT NULL
        GROUP BY mo.m
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month_label',
          CASE EXTRACT(MONTH FROM months.month_start)::int
            WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
          END || ' ' || TO_CHAR(months.month_start, 'YY'),
        'invoiced', ic.invoiced,
        'paid', pc.paid,
        'credited', cc.credited
      ) ORDER BY months.month_start), '[]'::json)
      FROM months
      LEFT JOIN invoiced_cte ic ON ic.m = months.m
      LEFT JOIN paid_cte pc ON pc.m = months.m
      LEFT JOIN credited_cte cc ON cc.m = months.m
    ),
    'monthly_utilization', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      bounded AS (
        SELECT mo.m, mo.month_start,
          mo.month_start AS eff_start,
          LEAST(mo.month_end, public.today_mty()) AS eff_end
        FROM months mo
      ),
      fleet_days AS (
        SELECT b.m, b.month_start,
          (SELECT COUNT(*) FROM forklifts WHERE status NOT IN ('retired', 'sold')
            AND deleted_at IS NULL AND is_e2e IS NOT TRUE) *
          GREATEST((b.eff_end - b.eff_start + 1), 0) AS available_days,
          b.eff_start, b.eff_end
        FROM bounded b
      ),
      rented_days AS (
        -- 2A-8: usa ocupación real (entrega/devolución) por reserva.
        SELECT fd.m,
          COUNT(DISTINCT (bk.forklift_id::text || '|' || d::text)) AS rented
        FROM fleet_days fd
        LEFT JOIN public.v_booking_occupancy bk ON bk.is_e2e IS NOT TRUE
        LEFT JOIN LATERAL generate_series(
          GREATEST(bk.occ_start, fd.eff_start),
          LEAST(bk.occ_end, fd.eff_end),
          INTERVAL '1 day'
        ) AS d ON TRUE
        GROUP BY fd.m
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month_label',
          CASE EXTRACT(MONTH FROM months.month_start)::int
            WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
          END || ' ' || TO_CHAR(months.month_start, 'YY'),
        'utilization', CASE WHEN fd.available_days > 0
          THEN ROUND(rd.rented::numeric / fd.available_days * 100, 2)
          ELSE 0 END
      ) ORDER BY months.month_start), '[]'::json)
      FROM months
      LEFT JOIN fleet_days fd ON fd.m = months.m
      LEFT JOIN rented_days rd ON rd.m = months.m
    )
  ) INTO result;

  RETURN result;
END;
$function$
;

-- One authenticated request and one database snapshot for all requested sections.
CREATE OR REPLACE FUNCTION public.get_global_search(
  p_expected_organization_id uuid,
  p_query text,
  p_sections text[]
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_internal_organization_id();
  v_role text;
  v_term text := btrim(coalesce(p_query, ''));
  v_like text;
  v_digits text;
  v_exact text;
  v_section text;
  v_module text;
  v_sql text;
  v_hits jsonb;
  v_attempted integer := 0;
  v_completed integer := 0;
  v_errors jsonb := '{}'::jsonb;
  v_result jsonb := '{"invoices":[],"quotes":[],"customers":[],"bookings":[],"deliveries":[],"returns":[]}'::jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR p_expected_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa de la búsqueda.' USING ERRCODE = '42501';
  END IF;
  IF length(v_term) > 256 OR p_sections IS NULL OR cardinality(p_sections) > 6
    OR EXISTS (SELECT 1 FROM unnest(p_sections) s WHERE s IS NULL
      OR s NOT IN ('invoices','quotes','customers','bookings','deliveries','returns')) THEN
    RAISE EXCEPTION 'Parámetros de búsqueda inválidos.' USING ERRCODE = '22023';
  END IF;
  IF length(v_term) < 2 THEN RETURN v_result; END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid
  ORDER BY array_position(ARRAY['admin','administrativo','auditor','ventas','dispatcher','mechanic','customer']::text[], ur.role::text)
  LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No se pudo verificar el acceso a la búsqueda.' USING ERRCODE = '42501';
  END IF;
  v_like := '%' || replace(replace(replace(v_term, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  IF v_term ~* '^(COT-)?[0-9]+$' THEN
    v_digits := regexp_replace(regexp_replace(v_term, '^COT-', '', 'i'), '^0+(?=[0-9])', '');
    v_exact := 'COT-' || lpad(v_digits, greatest(4, length(v_digits)), '0');
  END IF;
  FOREACH v_section IN ARRAY ARRAY['invoices','quotes','customers','bookings','deliveries','returns'] LOOP
    IF NOT (v_section = ANY(p_sections)) THEN CONTINUE; END IF;
    v_module := CASE v_section WHEN 'invoices' THEN 'Facturas' WHEN 'quotes' THEN 'Cotizaciones'
      WHEN 'customers' THEN 'Clientes' WHEN 'bookings' THEN 'Reservas' ELSE 'Entregas' END;
    IF (v_section = 'invoices' AND v_role = 'dispatcher') OR NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      WHERE rp.role::text = v_role AND rp.module = v_module AND rp.access_level IN ('read','full')
    ) THEN CONTINUE; END IF;
    -- Only literal statements are selected here. Values are bound through USING.
    v_sql := CASE v_section
      WHEN 'invoices' THEN $query$
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id,
          'label', coalesce(s.invoice_number, '—'), 'sub', s.customer_name, 'url', '/invoices/' || s.id))), '[]'::jsonb)
        FROM (SELECT i.id, i.invoice_number, i.customer_name FROM public.invoices i
          WHERE i.organization_id = $1 AND i.status <> 'cancelled'
            AND (i.invoice_number ILIKE $2 ESCAPE E'\\' OR i.customer_name ILIKE $2 ESCAPE E'\\')
          ORDER BY i.created_at DESC, i.id DESC LIMIT 5) s
      $query$
      WHEN 'quotes' THEN $query$
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id,
          'label', coalesce(s.quote_number, '—'), 'sub', s.customer_name, 'url', '/quotes/' || s.id))
          ORDER BY s.exact_priority, s.created_at DESC, s.id DESC), '[]'::jsonb)
        FROM (SELECT q.id, q.quote_number, q.customer_name, q.created_at,
            CASE WHEN q.quote_number = $3 THEN 0 ELSE 1 END AS exact_priority
          FROM public.quotes q WHERE q.organization_id = $1 AND q.is_e2e IS NOT TRUE
            AND (q.quote_number = $3 OR q.quote_number ILIKE $2 ESCAPE E'\\' OR q.customer_name ILIKE $2 ESCAPE E'\\')
          ORDER BY exact_priority, q.created_at DESC, q.id DESC LIMIT 5) s
      $query$
      WHEN 'customers' THEN $query$
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id,
          'label', coalesce(s.name, '—'), 'sub', s.rfc, 'url', '/customers/' || s.id))), '[]'::jsonb)
        FROM (SELECT c.id, c.name, c.rfc FROM public.organization_customers oc
          JOIN public.customers c ON c.id = oc.customer_id
          WHERE oc.organization_id = $1 AND c.deleted_at IS NULL
            AND (c.name ILIKE $2 ESCAPE E'\\' OR c.rfc ILIKE $2 ESCAPE E'\\')
          ORDER BY c.name, c.id LIMIT 5) s
      $query$
      WHEN 'bookings' THEN $query$
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id,
          'label', coalesce(s.booking_number, '—'), 'sub', s.customer_name, 'url', '/bookings/' || s.id))), '[]'::jsonb)
        FROM (SELECT b.id, b.booking_number, b.customer_name FROM public.bookings b
          WHERE b.organization_id = $1 AND b.status <> 'cancelled'
            AND (b.booking_number ILIKE $2 ESCAPE E'\\' OR b.customer_name ILIKE $2 ESCAPE E'\\')
          ORDER BY b.created_at DESC, b.id DESC LIMIT 5) s
      $query$
      WHEN 'deliveries' THEN $query$
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id,
          'label', coalesce(s.delivery_number, '—'), 'sub', CASE s.type WHEN 'pickup' THEN 'Recolección'
            WHEN 'delivery' THEN 'Entrega' ELSE s.address END, 'url', '/deliveries/' || s.id))), '[]'::jsonb)
        FROM (SELECT d.id, d.delivery_number, d.type, d.address FROM public.deliveries d
          WHERE d.organization_id = $1 AND d.delivery_number ILIKE $2 ESCAPE E'\\'
          ORDER BY d.created_at DESC, d.id DESC LIMIT 5) s
      $query$
      WHEN 'returns' THEN $query$
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id,
          'label', coalesce(s.inspection_number, '—'), 'sub', s.customer_name, 'url', '/returns/' || s.id))), '[]'::jsonb)
        FROM (SELECT r.id, r.inspection_number, b.customer_name FROM public.return_inspections r
          LEFT JOIN public.bookings b ON b.id = r.booking_id AND b.organization_id = r.organization_id
          WHERE r.organization_id = $1 AND r.inspection_number ILIKE $2 ESCAPE E'\\'
          ORDER BY r.created_at DESC, r.id DESC LIMIT 5) s
      $query$
    END;
    v_attempted := v_attempted + 1;
    BEGIN
      EXECUTE v_sql INTO v_hits USING v_org, v_like, v_exact;
      v_result := jsonb_set(v_result, ARRAY[v_section], v_hits);
      v_completed := v_completed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(v_section, 'No se pudo completar la búsqueda.');
    END;
  END LOOP;
  IF v_attempted > 0 AND v_completed = 0 THEN
    RAISE EXCEPTION 'No se pudo completar la búsqueda.' USING ERRCODE = '55000';
  END IF;
  IF v_errors <> '{}'::jsonb THEN v_result := v_result || jsonb_build_object('errors', v_errors); END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_global_search(uuid,text,text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_global_search(uuid,text,text[]) TO authenticated;
COMMENT ON FUNCTION public.get_global_search(uuid,text,text[]) IS
  'Bounded global search with one session tenant, effective module permissions, invoker RLS, exact quote priority and per-section failures.';
