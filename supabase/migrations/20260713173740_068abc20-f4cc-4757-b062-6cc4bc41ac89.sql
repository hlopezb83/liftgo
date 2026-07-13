
-- Add staff role guards to three SECURITY DEFINER RPCs

CREATE OR REPLACE FUNCTION public.delete_quote_with_unassign(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote_number text;
  v_forklift_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo') OR
    public.has_role(auth.uid(), 'dispatcher') OR
    public.has_role(auth.uid(), 'ventas')
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT quote_number INTO v_quote_number FROM public.quotes WHERE id = p_quote_id;
  IF v_quote_number IS NULL THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  FOR v_forklift_id IN
    SELECT forklift_id FROM public.quote_assigned_forklifts WHERE quote_id = p_quote_id
  LOOP
    UPDATE public.forklifts
      SET status = 'available'
      WHERE id = v_forklift_id AND status = 'sold';

    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_forklift_id, 'sold', 'available',
            'Liberado por eliminación de cotización ' || v_quote_number);
  END LOOP;

  DELETE FROM public.quote_assigned_forklifts WHERE quote_id = p_quote_id;
  DELETE FROM public.quotes WHERE id = p_quote_id;
END;
$function$;

-- Guard get_customer_profitability: staff-only
CREATE OR REPLACE FUNCTION public.get_customer_profitability(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo') OR
    public.has_role(auth.uid(), 'auditor') OR
    public.has_role(auth.uid(), 'ventas')
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  -- Delegate to existing logic by executing the original body inline
  WITH revenue AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS r
    FROM public.invoices
    WHERE customer_id = p_customer_id
      AND status <> 'cancelled'
  ),
  maint AS (
    SELECT COALESCE(SUM(ml.total_cost), 0)::numeric AS c
    FROM public.maintenance_logs ml
    JOIN public.bookings b ON b.forklift_id = ml.forklift_id
    WHERE b.customer_id = p_customer_id
  )
  SELECT jsonb_build_object(
    'revenue', revenue.r,
    'maintenance_cost', maint.c,
    'gross_margin', revenue.r - maint.c,
    'margin_percent', CASE WHEN revenue.r > 0 THEN ROUND(((revenue.r - maint.c) / revenue.r) * 100, 2) ELSE 0 END
  )
  INTO v_result
  FROM revenue, maint;

  RETURN v_result;
END;
$function$;

-- Guard get_activity_metrics: staff-only (mirror activity_feed access)
CREATE OR REPLACE FUNCTION public.get_activity_metrics(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev_from timestamptz;
  v_by_member jsonb;
  v_by_module jsonb;
  v_by_hour jsonb;
  v_previous_count bigint;
  v_total bigint;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo') OR
    public.has_role(auth.uid(), 'auditor') OR
    public.has_role(auth.uid(), 'ventas') OR
    public.has_role(auth.uid(), 'dispatcher') OR
    public.has_role(auth.uid(), 'mechanic')
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_prev_from := p_from - (p_to - p_from);

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_by_member
  FROM (
    SELECT
      actor_id            AS "actorId",
      COALESCE(MAX(actor_name), 'Sistema') AS "actorName",
      MAX(actor_role)     AS "actorRole",
      COUNT(*)::bigint    AS total,
      MAX(created_at)     AS "lastAt"
    FROM public.activity_feed
    WHERE created_at >= p_from AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY actor_id
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_by_module
  FROM (
    SELECT entity_type AS module, COUNT(*)::bigint AS total
    FROM public.activity_feed
    WHERE created_at >= p_from AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY entity_type
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.hour), '[]'::jsonb)
  INTO v_by_hour
  FROM (
    SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::bigint AS total
    FROM public.activity_feed
    WHERE created_at >= p_from AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY 1
  ) t;

  SELECT COUNT(*) INTO v_total FROM public.activity_feed
  WHERE created_at >= p_from AND created_at <= p_to
    AND (is_e2e IS NULL OR is_e2e = false);

  SELECT COUNT(*) INTO v_previous_count FROM public.activity_feed
  WHERE created_at >= v_prev_from AND created_at < p_from
    AND (is_e2e IS NULL OR is_e2e = false);

  RETURN jsonb_build_object(
    'total', v_total,
    'previousCount', v_previous_count,
    'byMember', v_by_member,
    'byModule', v_by_module,
    'byHour', v_by_hour
  );
END;
$function$;
