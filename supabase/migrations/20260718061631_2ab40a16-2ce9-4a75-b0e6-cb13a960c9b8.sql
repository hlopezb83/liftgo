
-- =========================================================================
-- SEC-005: Restrict v_invoices_with_balance and add row-filtered RPC
-- =========================================================================
REVOKE SELECT ON public.v_invoices_with_balance FROM authenticated;
GRANT SELECT ON public.v_invoices_with_balance TO service_role;

CREATE OR REPLACE FUNCTION public.list_invoices_with_balance()
RETURNS SETOF public.v_invoices_with_balance
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Internal roles: full view
  IF public.has_role(v_uid, 'admin')
     OR public.has_role(v_uid, 'administrativo')
     OR public.has_role(v_uid, 'ventas')
     OR public.has_role(v_uid, 'auditor')
     OR public.has_role(v_uid, 'dispatcher')
     OR public.has_role(v_uid, 'mechanic') THEN
    RETURN QUERY SELECT * FROM public.v_invoices_with_balance;
    RETURN;
  END IF;

  -- Customer portal: only own invoices
  IF public.has_role(v_uid, 'customer') THEN
    SELECT c.id INTO v_customer_id
    FROM public.customers c
    WHERE c.auth_user_id = v_uid
      AND c.deleted_at IS NULL
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      RETURN;
    END IF;

    RETURN QUERY SELECT * FROM public.v_invoices_with_balance WHERE customer_id = v_customer_id;
    RETURN;
  END IF;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_invoices_with_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_invoices_with_balance() TO authenticated;

-- =========================================================================
-- SEC-002: Allow dispatcher, ventas, administrativo to INSERT status_logs
-- =========================================================================
DROP POLICY IF EXISTS "Dispatchers insert status_logs" ON public.status_logs;
CREATE POLICY "Dispatchers insert status_logs"
  ON public.status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

DROP POLICY IF EXISTS "Ventas insert status_logs" ON public.status_logs;
CREATE POLICY "Ventas insert status_logs"
  ON public.status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ventas'));

DROP POLICY IF EXISTS "Administrativo insert status_logs" ON public.status_logs;
CREATE POLICY "Administrativo insert status_logs"
  ON public.status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrativo'));

-- =========================================================================
-- SEC-004: Revoke e2e_seed_scenario from authenticated
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.e2e_seed_scenario(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.e2e_seed_scenario(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.e2e_seed_scenario(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.e2e_seed_scenario(text) TO service_role;

-- =========================================================================
-- DI-003: Race-safe assign_stamped_invoice_number / _rep_number
-- Rely on existing partial UNIQUE indexes + exception handler
-- =========================================================================
CREATE OR REPLACE FUNCTION public.assign_stamped_invoice_number(p_invoice_id uuid, p_serie text, p_folio text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_number text;
  v_rows int;
BEGIN
  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'FAC-' || lpad(p_folio, 4, '0');

  BEGIN
    UPDATE public.invoices
       SET invoice_number = v_new_number,
           serie = COALESCE(p_serie, serie),
           folio = p_folio
     WHERE id = p_invoice_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'invoice % not found', p_invoice_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'invoice_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_stamped_rep_number(p_payment_id uuid, p_folio text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_number text;
  v_rows int;
BEGIN
  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'CP-' || lpad(p_folio, 4, '0');

  BEGIN
    UPDATE public.payments
       SET rep_number = v_new_number,
           rep_folio = p_folio
     WHERE id = p_payment_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'payment % not found', p_payment_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'rep_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$$;

-- =========================================================================
-- DI-001: UNIQUE (invoice_id, installment_number) on payments
-- Partial index to allow multiple NULLs (drafts) and skip cancelled REPs
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS payments_invoice_installment_uidx
  ON public.payments (invoice_id, installment_number)
  WHERE installment_number IS NOT NULL
    AND (rep_cfdi_status IS NULL OR rep_cfdi_status <> 'cancelled');
