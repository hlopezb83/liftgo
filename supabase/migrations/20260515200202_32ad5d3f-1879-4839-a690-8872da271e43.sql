
-- 1. Drop customer SELECT policies that exposed internal fields
DROP POLICY IF EXISTS "Customers read own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Customers read own deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Customers read own invoices" ON public.invoices;

-- 2. Restricted RPC: contracts (no rates, deposit, witnesses, late_interest)
CREATE OR REPLACE FUNCTION public.get_portal_contracts()
RETURNS TABLE (
  id uuid,
  contract_number text,
  forklift_id uuid,
  customer_id uuid,
  start_date date,
  end_date date,
  status text,
  signed_at timestamptz,
  usage_location text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.contract_number, c.forklift_id, c.customer_id,
         c.start_date, c.end_date, c.status, c.signed_at,
         c.usage_location, c.created_at
  FROM public.contracts c
  WHERE has_role(auth.uid(), 'customer'::app_role)
    AND c.customer_id = get_customer_id_for_user(auth.uid())
  ORDER BY c.created_at DESC;
$$;

-- 3. Restricted RPC: invoices (no facturapi_invoice_id, cfdi_xml, cfdi_error_message, cancellation_reason)
CREATE OR REPLACE FUNCTION public.get_portal_invoices()
RETURNS TABLE (
  id uuid,
  invoice_number text,
  customer_id uuid,
  status text,
  issued_at date,
  due_date date,
  paid_at date,
  subtotal numeric,
  tax_rate numeric,
  tax_amount numeric,
  total numeric,
  line_items jsonb,
  billing_period_start date,
  billing_period_end date,
  cfdi_pdf_url text,
  cfdi_uuid uuid,
  moneda text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.invoice_number, i.customer_id, i.status, i.issued_at,
         i.due_date, i.paid_at, i.subtotal, i.tax_rate, i.tax_amount,
         i.total, i.line_items, i.billing_period_start, i.billing_period_end,
         i.cfdi_pdf_url, i.cfdi_uuid, i.moneda
  FROM public.invoices i
  WHERE has_role(auth.uid(), 'customer'::app_role)
    AND i.customer_id = get_customer_id_for_user(auth.uid())
  ORDER BY i.issued_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_contracts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_invoices() TO authenticated;

-- 4. quote_assigned_forklifts: re-scope public-role policies to authenticated
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.quote_assigned_forklifts'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.quote_assigned_forklifts', pol.polname);
  END LOOP;
END $$;

CREATE POLICY "Admins full access quote_assigned_forklifts"
  ON public.quote_assigned_forklifts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access quote_assigned_forklifts"
  ON public.quote_assigned_forklifts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Dispatchers full access quote_assigned_forklifts"
  ON public.quote_assigned_forklifts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Ventas full access quote_assigned_forklifts"
  ON public.quote_assigned_forklifts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ventas'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ventas'::app_role));

CREATE POLICY "Mechanics read quote_assigned_forklifts"
  ON public.quote_assigned_forklifts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "Auditor read quote_assigned_forklifts"
  ON public.quote_assigned_forklifts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));
