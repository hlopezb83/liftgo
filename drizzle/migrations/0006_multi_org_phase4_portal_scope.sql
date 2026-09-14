-- =====================================================================
-- Multi-organización · Fase 4.2 (portal con cliente compartido)
--
-- Las funciones SECURITY DEFINER no quedan cubiertas por las policies de
-- tablas. Cada ruta del portal valida tanto el cliente como la organización.
-- =====================================================================

-- La ruta previa customers.user_id se mantiene solo con una organización.
-- Al crear una segunda, únicamente customer_portal_accounts es válida.
CREATE OR REPLACE FUNCTION public.get_customer_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT a.customer_id
      FROM public.customer_portal_accounts a
      WHERE a.auth_user_id = p_user_id
        AND a.status = 'active'
      LIMIT 1
    ),
    (
      SELECT c.id
      FROM public.customers c
      WHERE c.user_id = p_user_id
        AND (
          SELECT count(*) = 1
          FROM public.organizations
          WHERE is_active
        )
      LIMIT 1
    )
  )
$$;

REVOKE ALL ON FUNCTION public.get_customer_id_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_id_for_user(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_owns_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND i.customer_id = public.get_customer_id_for_user(auth.uid())
      AND public.organization_scope_matches(i.organization_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.customer_can_read_document_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.file_url = ANY (ARRAY[p_name, 'documents/' || p_name])
      AND public.organization_scope_matches(d.organization_id)
      AND (
        (d.entity_type = 'invoice' AND d.entity_id IN (
          SELECT i.id
          FROM public.invoices i
          WHERE i.customer_id = public.get_customer_id_for_user(auth.uid())
            AND public.organization_scope_matches(i.organization_id)
        ))
        OR (d.entity_type = 'contract' AND d.entity_id IN (
          SELECT c.id
          FROM public.contracts c
          WHERE c.customer_id = public.get_customer_id_for_user(auth.uid())
            AND public.organization_scope_matches(c.organization_id)
        ))
        OR (d.entity_type = 'booking' AND d.entity_id IN (
          SELECT b.id
          FROM public.bookings b
          WHERE b.customer_id = public.get_customer_id_for_user(auth.uid())
            AND public.organization_scope_matches(b.organization_id)
        ))
        OR (d.entity_type = 'delivery' AND d.entity_id IN (
          SELECT dl.id
          FROM public.deliveries dl
          JOIN public.bookings b2 ON b2.id = dl.booking_id
          WHERE b2.customer_id = public.get_customer_id_for_user(auth.uid())
            AND public.organization_scope_matches(dl.organization_id)
            AND public.organization_scope_matches(b2.organization_id)
        ))
        OR (d.entity_type = 'damage' AND d.entity_id IN (
          SELECT dr.id
          FROM public.damage_records dr
          WHERE dr.customer_id = public.get_customer_id_for_user(auth.uid())
            AND public.organization_scope_matches(dr.organization_id)
        ))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.accept_quote_from_portal(
  p_quote_id uuid,
  p_ip text DEFAULT NULL
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_quote public.quotes;
BEGIN
  v_customer := public.get_customer_id_for_user(auth.uid());
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
    AND customer_id = v_customer
    AND public.organization_scope_matches(organization_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada' USING ERRCODE = '42501';
  END IF;
  IF v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'Cotización no disponible para aceptar';
  END IF;
  IF v_quote.valid_until IS NOT NULL
     AND v_quote.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'Cotización vencida';
  END IF;

  UPDATE public.quotes
  SET status = 'accepted',
      accepted_at = now(),
      accepted_ip = p_ip,
      accepted_by_user_id = auth.uid()
  WHERE id = v_quote.id
    AND organization_id = v_quote.organization_id
  RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_quote_from_portal(
  p_quote_id uuid,
  p_reason text
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_quote public.quotes;
BEGIN
  v_customer := public.get_customer_id_for_user(auth.uid());
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
    AND customer_id = v_customer
    AND public.organization_scope_matches(organization_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada' USING ERRCODE = '42501';
  END IF;
  IF v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'Cotización no disponible para rechazar';
  END IF;

  UPDATE public.quotes
  SET status = 'rejected',
      rejected_at = now(),
      rejection_reason = p_reason
  WHERE id = v_quote.id
    AND organization_id = v_quote.organization_id
  RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_forklifts_brief()
RETURNS TABLE(id uuid, name text, model text, manufacturer text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT f.id, f.name, f.model, f.manufacturer
  FROM public.forklifts f
  WHERE public.has_role(auth.uid(), 'customer'::app_role)
    AND public.organization_scope_matches(f.organization_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.customer_id = public.get_customer_id_for_user(auth.uid())
          AND public.organization_scope_matches(b.organization_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.contracts c
        WHERE c.forklift_id = f.id
          AND c.customer_id = public.get_customer_id_for_user(auth.uid())
          AND public.organization_scope_matches(c.organization_id)
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.get_portal_contracts()
RETURNS TABLE(
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.contract_number, c.forklift_id, c.customer_id,
         c.start_date, c.end_date, c.status, c.signed_at,
         c.usage_location, c.created_at
  FROM public.contracts c
  WHERE public.has_role(auth.uid(), 'customer'::app_role)
    AND c.customer_id = public.get_customer_id_for_user(auth.uid())
    AND public.organization_scope_matches(c.organization_id)
  ORDER BY c.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.get_portal_invoices()
RETURNS TABLE(
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
  moneda text,
  tipo_cambio numeric,
  paid_amount numeric,
  credited_amount numeric,
  balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.invoice_number, v.customer_id, v.status, v.issued_at,
         v.due_date, v.paid_at, v.subtotal, v.tax_rate, v.tax_amount,
         v.total, v.line_items, v.billing_period_start, v.billing_period_end,
         v.cfdi_pdf_url, v.cfdi_uuid, v.moneda,
         v.tipo_cambio::numeric,
         COALESCE(v.paid_amount, 0)::numeric,
         COALESCE(v.credited_amount, 0)::numeric,
         COALESCE(v.balance, 0)::numeric
  FROM public.v_invoices_with_balance v
  JOIN public.invoices i ON i.id = v.id
  WHERE public.has_role(auth.uid(), 'customer'::app_role)
    AND v.customer_id = public.get_customer_id_for_user(auth.uid())
    AND public.organization_scope_matches(i.organization_id)
    AND v.status NOT IN ('draft', 'cancelled')
  ORDER BY v.issued_at DESC
$$;
