
-- ==========================================================
-- BL-53: Drop duplicate stock trigger
-- ==========================================================
DROP TRIGGER IF EXISTS trg_decrement_stock ON public.maintenance_parts;
DROP FUNCTION IF EXISTS public.handle_part_usage() CASCADE;

-- ==========================================================
-- BL-54: manual_cost + snapshot part cost + preserve manual cost
-- ==========================================================
ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS manual_cost numeric NOT NULL DEFAULT 0;

-- Backfill: logs sin partes ni mano de obra conservan su cost como manual
UPDATE public.maintenance_logs ml
   SET manual_cost = ml.cost
 WHERE ml.manual_cost = 0
   AND COALESCE(ml.cost, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts mp WHERE mp.maintenance_log_id = ml.id)
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_labor mlb WHERE mlb.maintenance_log_id = ml.id);

-- Snapshot cost_at_time desde parts_inventory si viene 0/null
CREATE OR REPLACE FUNCTION public.snapshot_part_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_at_time IS NULL OR NEW.cost_at_time = 0 THEN
    SELECT unit_cost INTO NEW.cost_at_time
      FROM public.parts_inventory
     WHERE id = NEW.part_id;
    NEW.cost_at_time := COALESCE(NEW.cost_at_time, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_part_cost ON public.maintenance_parts;
CREATE TRIGGER trg_snapshot_part_cost
  BEFORE INSERT ON public.maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_part_cost();

-- Recalc que preserva manual_cost
CREATE OR REPLACE FUNCTION public.recalc_maintenance_log_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_parts  numeric;
  v_labor  numeric;
  v_manual numeric;
BEGIN
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  SELECT COALESCE(SUM(quantity_used * cost_at_time), 0)
    INTO v_parts
    FROM public.maintenance_parts
   WHERE maintenance_log_id = v_log_id;
  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_labor
    FROM public.maintenance_labor
   WHERE maintenance_log_id = v_log_id;
  SELECT COALESCE(manual_cost, 0) INTO v_manual
    FROM public.maintenance_logs WHERE id = v_log_id;
  UPDATE public.maintenance_logs
     SET cost = ROUND(v_manual + v_parts + v_labor, 2)
   WHERE id = v_log_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger para recalcular cuando se cambia manual_cost directamente
CREATE OR REPLACE FUNCTION public.recalc_log_from_manual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts numeric;
  v_labor numeric;
BEGIN
  IF NEW.manual_cost IS DISTINCT FROM OLD.manual_cost THEN
    SELECT COALESCE(SUM(quantity_used * cost_at_time), 0) INTO v_parts
      FROM public.maintenance_parts WHERE maintenance_log_id = NEW.id;
    SELECT COALESCE(SUM(total_cost), 0) INTO v_labor
      FROM public.maintenance_labor WHERE maintenance_log_id = NEW.id;
    NEW.cost := ROUND(COALESCE(NEW.manual_cost, 0) + v_parts + v_labor, 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_log_from_manual ON public.maintenance_logs;
CREATE TRIGGER trg_recalc_log_from_manual
  BEFORE UPDATE OF manual_cost ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.recalc_log_from_manual();

-- ==========================================================
-- BL-55: complete_return_inspection auto-creates damage record
-- ==========================================================
CREATE OR REPLACE FUNCTION public.complete_return_inspection(
  p_booking_id uuid,
  p_forklift_id uuid,
  p_condition text DEFAULT 'good',
  p_damage_notes text DEFAULT NULL,
  p_damage_cost numeric DEFAULT 0,
  p_hours_used numeric DEFAULT NULL,
  p_fuel_level text DEFAULT NULL,
  p_inspected_by text DEFAULT NULL,
  p_inspected_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inspection_id uuid;
  v_old_status text;
  v_new_status text;
  v_customer_id uuid;
  v_damaged boolean;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
       OR has_role(auth.uid(), 'administrativo'::app_role)
       OR has_role(auth.uid(), 'dispatcher'::app_role)
       OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id;
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;

  v_damaged := p_condition IN ('damaged', 'needs_repair') AND COALESCE(p_damage_cost, 0) > 0;

  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at)
  RETURNING id INTO v_inspection_id;

  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;

  IF v_damaged THEN
    INSERT INTO damage_records (inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status)
    VALUES (v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
            COALESCE(NULLIF(p_damage_notes, ''), 'Daño reportado en devolución'),
            p_damage_cost, 'reported');
    v_new_status := 'maintenance';
  ELSE
    v_new_status := 'available';
  END IF;

  UPDATE forklifts SET status = v_new_status, updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, v_new_status, 'Returned — condition: ' || p_condition);

  RETURN v_inspection_id;
END;
$$;

-- ==========================================================
-- BL-57: v_invoices_with_balance with MXN normalization
-- ==========================================================
DROP VIEW IF EXISTS public.v_overdue_invoices CASCADE;
DROP VIEW IF EXISTS public.v_invoices_with_balance CASCADE;

CREATE VIEW public.v_invoices_with_balance AS
SELECT
  i.*,
  COALESCE(p.paid, 0) AS paid_amount,
  COALESCE(cn.credited, 0) AS credited_amount,
  GREATEST(i.total - COALESCE(p.paid, 0) - COALESCE(cn.credited, 0), 0) AS balance,
  ROUND(i.total * COALESCE(NULLIF(i.tipo_cambio, 0), 1), 2) AS total_mxn,
  ROUND(
    GREATEST(i.total - COALESCE(p.paid, 0) - COALESCE(cn.credited, 0), 0)
    * COALESCE(NULLIF(i.tipo_cambio, 0), 1),
    2
  ) AS balance_mxn
FROM public.invoices i
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS paid FROM public.payments GROUP BY invoice_id
) p ON p.invoice_id = i.id
LEFT JOIN (
  SELECT invoice_id, SUM(total) AS credited
    FROM public.credit_notes
   WHERE cancellation_status <> 'accepted' AND status <> 'cancelled'
   GROUP BY invoice_id
) cn ON cn.invoice_id = i.id;

GRANT SELECT ON public.v_invoices_with_balance TO authenticated;
GRANT SELECT ON public.v_invoices_with_balance TO service_role;

CREATE VIEW public.v_overdue_invoices AS
SELECT
  i.id, i.invoice_number, i.customer_id, i.customer_name, i.due_date, i.total,
  COALESCE(v.balance, i.total) AS balance,
  COALESCE(v.balance_mxn, ROUND(i.total * COALESCE(NULLIF(i.tipo_cambio, 0), 1), 2)) AS balance_mxn,
  CURRENT_DATE - i.due_date AS days_overdue,
  CASE
    WHEN (CURRENT_DATE - i.due_date) <= 30 THEN '0-30'
    WHEN (CURRENT_DATE - i.due_date) <= 60 THEN '31-60'
    WHEN (CURRENT_DATE - i.due_date) <= 90 THEN '61-90'
    ELSE '90+'
  END AS bucket
FROM public.invoices i
LEFT JOIN public.v_invoices_with_balance v ON v.id = i.id
WHERE i.status NOT IN ('paid', 'cancelled')
  AND i.due_date IS NOT NULL
  AND i.due_date < CURRENT_DATE
  AND COALESCE(v.balance, i.total) > 0;

GRANT SELECT ON public.v_overdue_invoices TO authenticated;
GRANT SELECT ON public.v_overdue_invoices TO service_role;

-- ==========================================================
-- BL-56 + BL-57: get_dashboard_stats fixes
-- ==========================================================
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
        -- BL-56: excluir draft; BL-57: sumar balance_mxn
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
    'overdue_invoices', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', v.id, 'invoice_number', v.invoice_number, 'customer_name', v.customer_name,
        'total', v.total,
        'balance', v.balance,
        'balance_mxn', v.balance_mxn,
        'due_date', v.due_date, 'status', v.status, 'booking_id', v.booking_id
      )), '[]'::json)
      FROM public.v_invoices_with_balance v
      WHERE v.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(v.cancellation_status, '') <> 'accepted'
        AND v.due_date IS NOT NULL
        AND v.due_date < CURRENT_DATE
        AND v.balance > 0
    ),
    'overdue_bookings', (
      SELECT COALESCE(json_agg(json_build_object(
        'booking_id', b.id, 'forklift_name', f.name, 'forklift_id', f.id,
        'customer_name', b.customer_name, 'end_date', b.end_date,
        'days_overdue', (CURRENT_DATE - b.end_date)
      )), '[]'::json)
      FROM bookings b
      LEFT JOIN forklifts f ON f.id = b.forklift_id
      WHERE b.status = 'confirmed'
        AND b.return_status IS DISTINCT FROM 'returned'
        AND b.end_date < CURRENT_DATE
    )
  ) INTO result;

  RETURN result;
END;
$function$;

-- ==========================================================
-- BL-57: get_customer_summary uses balance_mxn
-- ==========================================================
CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals   jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role) OR
    (has_role(auth.uid(), 'customer'::app_role)
      AND p_customer_id = get_customer_id_for_user(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'booking_number', b.booking_number,
    'start_date', b.start_date, 'end_date', b.end_date, 'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM bookings b
  LEFT JOIN forklifts f ON f.id = b.forklift_id
  WHERE b.customer_id = p_customer_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'issued_at', i.issued_at,
    'due_date', i.due_date, 'total', i.total, 'status', i.status
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id;

  SELECT jsonb_build_object(
    'total_invoiced', COALESCE(SUM(
      ROUND(total * COALESCE(NULLIF(tipo_cambio,0),1), 2)
    ) FILTER (WHERE status <> 'cancelled'), 0),
    'total_paid', (
      SELECT COALESCE(SUM(p.amount * COALESCE(NULLIF(i2.tipo_cambio,0),1)), 0)
      FROM public.payments p
      JOIN public.invoices i2 ON i2.id = p.invoice_id
      WHERE i2.customer_id = p_customer_id
        AND i2.status <> 'cancelled'
    ),
    'outstanding_revenue', (
      SELECT COALESCE(SUM(b.balance_mxn), 0)
      FROM public.v_invoices_with_balance b
      WHERE b.customer_id = p_customer_id
        AND b.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(b.cancellation_status, '') <> 'accepted'
    )
  ) INTO v_totals
  FROM invoices
  WHERE customer_id = p_customer_id;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals',   v_totals
  );
END;
$function$;
