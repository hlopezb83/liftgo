
DROP FUNCTION IF EXISTS public.list_invoices_with_balance();

CREATE OR REPLACE FUNCTION public.list_invoices_with_balance(
  p_statuses text[] DEFAULT NULL,
  p_due_from date DEFAULT NULL,
  p_due_to date DEFAULT NULL,
  p_with_balance_only boolean DEFAULT false,
  p_limit int DEFAULT NULL,
  p_offset int DEFAULT 0
)
RETURNS SETOF public.v_invoices_with_balance
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer_id uuid;
  v_internal boolean;
  v_limit int := GREATEST(COALESCE(p_limit, 2147483647), 0);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_internal := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'administrativo')
             OR public.has_role(v_uid, 'ventas')
             OR public.has_role(v_uid, 'auditor')
             OR public.has_role(v_uid, 'dispatcher')
             OR public.has_role(v_uid, 'mechanic');

  IF v_internal THEN
    RETURN QUERY
      SELECT *
      FROM public.v_invoices_with_balance v
      WHERE (p_statuses IS NULL OR v.status = ANY(p_statuses))
        AND (p_due_from IS NULL OR v.due_date >= p_due_from)
        AND (p_due_to IS NULL OR v.due_date <= p_due_to)
        AND (p_with_balance_only = false OR v.balance > 0)
      ORDER BY v.due_date NULLS LAST, v.issued_at DESC
      LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF public.has_role(v_uid, 'customer') THEN
    SELECT c.id INTO v_customer_id
    FROM public.customers c
    WHERE c.auth_user_id = v_uid
      AND c.deleted_at IS NULL
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      RETURN;
    END IF;

    RETURN QUERY
      SELECT *
      FROM public.v_invoices_with_balance v
      WHERE v.customer_id = v_customer_id
        AND (p_statuses IS NULL OR v.status = ANY(p_statuses))
        AND (p_due_from IS NULL OR v.due_date >= p_due_from)
        AND (p_due_to IS NULL OR v.due_date <= p_due_to)
        AND (p_with_balance_only = false OR v.balance > 0)
      ORDER BY v.due_date NULLS LAST, v.issued_at DESC
      LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, int, int) TO authenticated;
