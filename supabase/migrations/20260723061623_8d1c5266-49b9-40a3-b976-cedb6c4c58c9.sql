-- R10 Fase 7: dashboard utilization dedupe + OT ↔ forklift status sync

-- 1) get_dashboard_stats v3: dedupe días vía generate_series y aceptar
-- 'confirmed' + 'completed' en utilización mensual y por unidad (30d).
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    'fleet_counts', (
      SELECT json_build_object(
        'total', COUNT(*),
        'available', COUNT(*) FILTER (WHERE status = 'available'),
        'rented', COUNT(*) FILTER (WHERE status = 'rented'
          AND EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.forklift_id = forklifts.id
              AND b.status = 'confirmed'
              AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
          )),
        'maintenance', COUNT(*) FILTER (WHERE status = 'maintenance'),
        'retired', COUNT(*) FILTER (WHERE status = 'retired'),
        'sold', COUNT(*) FILTER (WHERE status = 'sold')
      ) FROM forklifts
    ),
    'invoice_stats', (
      SELECT json_build_object(
        'outstanding_revenue', (
          SELECT COALESCE(SUM(v.balance_mxn), 0)
          FROM public.v_invoices_with_balance v
          WHERE v.status IN ('sent', 'partial', 'overdue')
            AND COALESCE(v.cancellation_status, '') <> 'accepted'
        ),
        'breakdown', COALESCE((
          SELECT json_agg(json_build_object('status', sub.status, 'count', sub.cnt, 'total', sub.sum_total))
          FROM (SELECT status, COUNT(*) as cnt, SUM(total) as sum_total FROM invoices GROUP BY status) sub
        ), '[]'::json)
      )
    ),
    'cash_flow', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      invoiced_cte AS (
        SELECT mo.m,
          COALESCE(SUM(i.total), 0) AS invoiced
        FROM months mo
        LEFT JOIN invoices i
          ON i.issue_date BETWEEN mo.month_start AND mo.month_end
          AND i.status <> 'draft'
          AND COALESCE(i.cancellation_status, '') <> 'accepted'
        GROUP BY mo.m
      ),
      credited_cte AS (
        SELECT mo.m,
          COALESCE(SUM(cn.total), 0) AS credited
        FROM months mo
        LEFT JOIN credit_notes cn
          ON cn.issue_date::date BETWEEN mo.month_start AND mo.month_end
          AND cn.status = 'stamped'
        GROUP BY mo.m
      ),
      paid_cte AS (
        SELECT mo.m,
          COALESCE(SUM(p.amount), 0) AS paid
        FROM months mo
        LEFT JOIN payments p
          ON p.payment_date::date BETWEEN mo.month_start AND mo.month_end
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
        'invoiced', inv.invoiced,
        'credited', cn.credited,
        'net_invoiced', inv.invoiced - cn.credited,
        'paid', pd.paid
      ) ORDER BY months.month_start), '[]'::json)
      FROM months
      LEFT JOIN invoiced_cte inv ON inv.m = months.m
      LEFT JOIN credited_cte cn  ON cn.m  = months.m
      LEFT JOIN paid_cte     pd  ON pd.m  = months.m
    ),
    -- R10 B10.2: utilización 30d por unidad con unión de rangos vía generate_series
    'utilization', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', sub.name, 'utilization', sub.util_pct, 'revenue', sub.revenue
      ) ORDER BY sub.util_pct DESC), '[]'::json)
      FROM (
        SELECT f.id, f.name,
          ROUND(
            COALESCE((
              SELECT COUNT(DISTINCT d)
              FROM bookings b
              CROSS JOIN LATERAL generate_series(
                GREATEST(b.start_date, (CURRENT_DATE - INTERVAL '30 days')::date),
                LEAST(b.end_date, CURRENT_DATE),
                INTERVAL '1 day'
              ) AS d
              WHERE b.forklift_id = f.id
                AND b.status IN ('confirmed', 'completed')
                AND b.start_date <= CURRENT_DATE
                AND b.end_date >= (CURRENT_DATE - INTERVAL '30 days')::date
            ), 0) * 100.0 / 30.0, 1
          ) AS util_pct,
          COALESCE((
            SELECT SUM(i.total)
            FROM invoices i
            JOIN bookings b ON b.id = i.booking_id
            WHERE b.forklift_id = f.id AND i.status = 'paid'
          ), 0) AS revenue
        FROM forklifts f
        WHERE f.status NOT IN ('retired', 'sold')
      ) sub
    ),
    -- R10 B10.2: utilización mensual (6m) con dedupe por generate_series
    'monthly_utilization', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
        FROM generate_series(5, 0, -1) AS m
      ),
      fleet AS (
        SELECT COUNT(*)::int AS total FROM forklifts WHERE status NOT IN ('retired', 'sold')
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month_label',
          CASE EXTRACT(MONTH FROM mo.month_start)::int
            WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
          END || ' ' || TO_CHAR(mo.month_start, 'YY'),
        'utilization', CASE
          WHEN fleet.total = 0 THEN 0
          ELSE ROUND(
            COALESCE((
              SELECT COUNT(*)::numeric
              FROM (
                SELECT DISTINCT b.forklift_id, d::date AS day
                FROM bookings b
                JOIN forklifts f ON f.id = b.forklift_id
                CROSS JOIN LATERAL generate_series(
                  GREATEST(b.start_date, mo.month_start),
                  LEAST(b.end_date, mo.month_end),
                  INTERVAL '1 day'
                ) AS d
                WHERE b.status IN ('confirmed', 'completed')
                  AND f.status NOT IN ('retired', 'sold')
                  AND b.start_date <= mo.month_end
                  AND b.end_date >= mo.month_start
              ) uniq_days
            ), 0) * 100.0 / (fleet.total * (mo.month_end - mo.month_start + 1))
          )
        END
      ) ORDER BY mo.month_start), '[]'::json)
      FROM months mo CROSS JOIN fleet
    )
  ) INTO result;

  RETURN result;
END;
$function$;

-- 2) B11.5: trigger para sincronizar estado del montacargas con el work_status
-- de la orden de trabajo (OT). Solo actúa cuando la OT cambia realmente y
-- respeta reservas activas (no toca 'rented').
CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forklift_status  text;
  v_active_bookings  int;
BEGIN
  IF NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.work_status IS NOT DISTINCT FROM NEW.work_status THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_forklift_status
    FROM public.forklifts WHERE id = NEW.forklift_id FOR UPDATE;

  IF v_forklift_status IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_bookings
    FROM public.bookings
   WHERE forklift_id = NEW.forklift_id
     AND status = 'confirmed'
     AND CURRENT_DATE BETWEEN start_date AND end_date;

  -- Entrar a mantenimiento
  IF NEW.work_status = 'in_progress'
     AND v_forklift_status = 'available' THEN
    UPDATE public.forklifts SET status = 'maintenance', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' en progreso');
  -- Salir de mantenimiento (OT terminada o cancelada)
  ELSIF NEW.work_status IN ('completed', 'cancelled')
     AND v_forklift_status = 'maintenance'
     AND v_active_bookings = 0 THEN
    UPDATE public.forklifts SET status = 'available', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'available',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' ||
            CASE WHEN NEW.work_status = 'completed' THEN 'completada' ELSE 'cancelada' END);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_forklift_on_maintenance ON public.maintenance_logs;
CREATE TRIGGER trg_sync_forklift_on_maintenance
AFTER INSERT OR UPDATE OF work_status ON public.maintenance_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_forklift_status_on_maintenance();