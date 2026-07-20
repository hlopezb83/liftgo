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

  WITH revenue AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS r
    FROM public.invoices
    WHERE customer_id = p_customer_id
      AND status <> 'cancelled'
  ),
  maint AS (
    SELECT COALESCE(SUM(ml.cost), 0)::numeric AS c
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