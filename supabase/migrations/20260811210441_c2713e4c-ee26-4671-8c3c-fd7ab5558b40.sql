CREATE OR REPLACE FUNCTION public.get_customer_profitability(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_uid uuid := (select auth.uid());
  v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_is_staff := (
    public.has_role(v_uid, 'admin'::app_role) OR
    public.has_role(v_uid, 'administrativo'::app_role) OR
    public.has_role(v_uid, 'auditor'::app_role) OR
    public.has_role(v_uid, 'ventas'::app_role)
  );

  IF NOT v_is_staff THEN
    IF p_customer_id IS NULL
       OR p_customer_id IS DISTINCT FROM public.get_customer_id_for_user(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
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

REVOKE ALL ON FUNCTION public.get_customer_profitability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_profitability(uuid) TO authenticated, service_role;