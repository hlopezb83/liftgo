CREATE OR REPLACE FUNCTION public.list_invoices_with_balance(
  p_statuses text[] DEFAULT NULL,
  p_due_from date DEFAULT NULL,
  p_due_to date DEFAULT NULL,
  p_with_balance_only boolean DEFAULT true,
  p_limit int DEFAULT NULL,
  p_offset int DEFAULT 0
)
RETURNS SETOF public.v_invoices_with_balance
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.*
  FROM public.v_invoices_with_balance v
  WHERE (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  )
  AND (p_statuses IS NULL OR v.status = ANY(p_statuses))
  AND (p_due_from IS NULL OR v.due_date >= p_due_from)
  AND (p_due_to IS NULL OR v.due_date <= p_due_to)
  AND (NOT p_with_balance_only OR COALESCE(v.balance, 0) > 0)
  ORDER BY v.due_date NULLS LAST, v.issued_at DESC
  LIMIT COALESCE(p_limit, 1000)
  OFFSET COALESCE(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, int, int) TO service_role;