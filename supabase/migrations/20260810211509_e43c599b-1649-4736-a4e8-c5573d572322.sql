-- FIX-R2-01 (N6) + FIX-R2-07 (Bajo 12): guard de rol en las RPCs de reportes.
DROP FUNCTION IF EXISTS public.report_revenue_by_month(date, date);
CREATE FUNCTION public.report_revenue_by_month(_start date, _end date)
RETURNS TABLE (month_key text, invoiced numeric, paid numeric, invoice_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT
      to_char(date_trunc('month', i.issued_at), 'YYYY-MM') AS month_key,
      CASE
        WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.total
        WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN i.total * i.tipo_cambio
        ELSE i.total
      END AS total_mxn,
      i.status
    FROM public.invoices i
    WHERE i.status NOT IN ('draft', 'cancelled')
      AND i.is_e2e IS NOT TRUE
      AND i.issued_at::date BETWEEN _start AND _end
  )
  SELECT s.month_key, SUM(s.total_mxn), COALESCE(SUM(s.total_mxn) FILTER (WHERE s.status = 'paid'), 0), COUNT(*)::int
  FROM scoped s GROUP BY s.month_key ORDER BY s.month_key;
END;
$$;
REVOKE ALL ON FUNCTION public.report_revenue_by_month(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_revenue_by_month(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.report_revenue_month_invoices(text);
CREATE FUNCTION public.report_revenue_month_invoices(_month_key text)
RETURNS TABLE (id uuid, invoice_number text, customer_name text, issued_at date, total numeric, status text, moneda text, tipo_cambio numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT i.id, i.invoice_number, i.customer_name, i.issued_at, i.total, i.status, i.moneda, i.tipo_cambio
  FROM public.invoices i
  WHERE i.status NOT IN ('draft', 'cancelled')
    AND i.is_e2e IS NOT TRUE
    AND to_char(date_trunc('month', i.issued_at), 'YYYY-MM') = _month_key
  ORDER BY CASE
      WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.total
      WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN i.total * i.tipo_cambio
      ELSE i.total END DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.report_revenue_month_invoices(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_revenue_month_invoices(text) TO authenticated;

DROP FUNCTION IF EXISTS public.report_utilization_by_unit(date, date);
CREATE FUNCTION public.report_utilization_by_unit(_start date, _end date)
RETURNS TABLE (forklift_id uuid, name text, booked_days integer, total_days integer, utilization integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH range_days AS (SELECT GREATEST((_end - _start)::int + 1, 1) AS total_days),
  unit_days AS (
    SELECT b.forklift_id, COUNT(DISTINCT d)::int AS booked_days
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(GREATEST(b.start_date::date, _start), LEAST(b.end_date::date, _end), interval '1 day') AS d
    WHERE b.status <> 'cancelled' AND b.is_e2e IS NOT TRUE
      AND b.start_date::date <= _end AND b.end_date::date >= _start
    GROUP BY b.forklift_id
  )
  SELECT f.id, f.name, COALESCE(ud.booked_days, 0), r.total_days,
    LEAST(ROUND(COALESCE(ud.booked_days, 0)::numeric * 100 / r.total_days), 100)::int
  FROM public.forklifts f
  CROSS JOIN range_days r
  LEFT JOIN unit_days ud ON ud.forklift_id = f.id
  WHERE f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
  ORDER BY 5 DESC, f.name;
END;
$$;
REVOKE ALL ON FUNCTION public.report_utilization_by_unit(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_utilization_by_unit(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.report_utilization_by_model(date, date);
CREATE FUNCTION public.report_utilization_by_model(_start date, _end date)
RETURNS TABLE (model text, units integer, available integer, rented integer, booked_days integer, total_days integer, utilization integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH active AS (
    SELECT f.id, f.status,
      CASE WHEN NULLIF(btrim(COALESCE(f.manufacturer, '')), '') IS NOT NULL
        THEN btrim(f.manufacturer) || ' ' || COALESCE(f.model, '') ELSE f.name END AS model_key
    FROM public.forklifts f
    WHERE f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
      AND lower(COALESCE(f.status, '')) NOT IN ('sold', 'retired', 'vendido', 'retirado')
  ),
  range_days AS (SELECT GREATEST((_end - _start)::int + 1, 1) AS total_days),
  unit_days AS (
    SELECT b.forklift_id, COUNT(DISTINCT d)::int AS booked_days
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(GREATEST(b.start_date::date, _start), LEAST(b.end_date::date, _end), interval '1 day') AS d
    WHERE b.status <> 'cancelled' AND b.is_e2e IS NOT TRUE
      AND b.start_date::date <= _end AND b.end_date::date >= _start
    GROUP BY b.forklift_id
  ),
  per_unit AS (
    SELECT a.model_key, a.status, COALESCE(ud.booked_days, 0) AS booked_days
    FROM active a LEFT JOIN unit_days ud ON ud.forklift_id = a.id
  )
  SELECT p.model_key, COUNT(*)::int,
    COUNT(*) FILTER (WHERE p.status = 'available')::int,
    COUNT(*) FILTER (WHERE p.status = 'rented')::int,
    SUM(p.booked_days)::int,
    (COUNT(*) * r.total_days)::int,
    LEAST(ROUND(SUM(p.booked_days)::numeric * 100 / (COUNT(*) * r.total_days)), 100)::int
  FROM per_unit p CROSS JOIN range_days r
  GROUP BY p.model_key, r.total_days
  ORDER BY 7 DESC, p.model_key;
END;
$$;
REVOKE ALL ON FUNCTION public.report_utilization_by_model(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_utilization_by_model(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.report_maintenance_cost_by_unit(date, date);
CREATE FUNCTION public.report_maintenance_cost_by_unit(_start date, _end date)
RETURNS TABLE (name text, work_count integer, total_cost numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT COALESCE(f.name, 'Desconocido'), COUNT(*)::int, COALESCE(SUM(ml.cost), 0)
  FROM public.maintenance_logs ml
  LEFT JOIN public.forklifts f ON f.id = ml.forklift_id
  WHERE ml.deleted_at IS NULL AND ml.is_e2e IS NOT TRUE
    AND ml.performed_at IS NOT NULL
    AND ml.performed_at::date BETWEEN _start AND _end
  GROUP BY ml.forklift_id, f.name
  ORDER BY 3 DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.report_maintenance_cost_by_unit(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_maintenance_cost_by_unit(date, date) TO authenticated;

-- FIX-R2-08 (Bajo 13a): fallback FX de balance_mxn alineado con toMxn().
CREATE OR REPLACE VIEW public.v_overdue_invoices AS
SELECT i.id,
    i.invoice_number,
    i.customer_id,
    i.customer_name,
    i.due_date,
    i.total,
    COALESCE(v.balance, i.total) AS balance,
    COALESCE(v.balance_mxn,
      CASE
        WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN round(i.total, 2)
        WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN round(i.total * i.tipo_cambio, 2)
        ELSE round(i.total, 2)
      END) AS balance_mxn,
    public.today_mty() - i.due_date AS days_overdue,
    CASE
        WHEN (public.today_mty() - i.due_date) <= 30 THEN '0-30'::text
        WHEN (public.today_mty() - i.due_date) <= 60 THEN '31-60'::text
        WHEN (public.today_mty() - i.due_date) <= 90 THEN '61-90'::text
        ELSE '90+'::text
    END AS bucket
FROM invoices i
LEFT JOIN v_invoices_with_balance v ON v.id = i.id
WHERE (i.status = ANY (ARRAY['sent'::text, 'partial'::text, 'overdue'::text]))
  AND COALESCE(i.cancellation_status, 'none'::text) <> 'accepted'::text
  AND i.due_date IS NOT NULL
  AND i.due_date < public.today_mty()
  AND COALESCE(v.balance, i.total) > 0::numeric;

-- FIX-R2-11 (bajo 4): reprogramar recolección residual con reserva completada.
CREATE OR REPLACE FUNCTION public.validate_delivery_booking_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva % no existe', NEW.booking_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.forklift_id IS DISTINCT FROM v_booking.forklift_id THEN
    RAISE EXCEPTION 'El montacargas de la entrega (%) no corresponde al de la reserva (%).',
      NEW.forklift_id, v_booking.forklift_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(NEW.status, 'scheduled') = 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.type = 'pickup' AND v_booking.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se pueden programar entregas de una reserva confirmada (estado actual: %).',
      v_booking.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.type = 'delivery'
     AND (NEW.scheduled_date < v_booking.start_date OR NEW.scheduled_date > v_booking.end_date) THEN
    RAISE EXCEPTION 'La entrega (%) debe caer dentro de la ventana de la renta (% → %).',
      NEW.scheduled_date, v_booking.start_date, v_booking.end_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.type = 'pickup' AND NEW.scheduled_date < v_booking.start_date THEN
    RAISE EXCEPTION 'La recolección (%) no puede ser anterior al inicio de la renta (%).',
      NEW.scheduled_date, v_booking.start_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_delivery_booking_integrity ON public.deliveries;
CREATE TRIGGER trg_delivery_booking_integrity
  BEFORE INSERT OR UPDATE OF booking_id, forklift_id, scheduled_date, type, status
  ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_booking_integrity();