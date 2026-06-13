CREATE OR REPLACE FUNCTION public.e2e_seed_portal_scenario(p_scope text, p_portal_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 10000;
  v_tax numeric := 1600;
  v_total numeric := 11600;
  v_allowed boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_seed_portal_scenario requires admin role';
  END IF;
  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_portal_scenario requires a non-null p_scope';
  END IF;
  IF p_portal_email IS NULL OR length(trim(p_portal_email)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_portal_scenario requires a non-null p_portal_email';
  END IF;

  SELECT coalesce(allow_e2e_seed, false) INTO v_allowed FROM public.company_settings LIMIT 1;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'E2E seeding disabled on this environment';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_portal_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Portal user % not found in auth.users', p_portal_email;
  END IF;

  -- Asegurar rol customer (idempotente).
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'customer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Cliente vinculado al user auth del portal.
  INSERT INTO public.customers (name, email, phone, rfc, user_id, is_e2e, e2e_scope)
  VALUES ('E2E Portal ' || substr(p_scope, 1, 12),
          p_portal_email,
          '8181818181',
          'XAXX010101000',
          v_user_id,
          true,
          p_scope)
  RETURNING id INTO v_customer_id;

  v_invoice_number := public.next_invoice_number_e2e();
  INSERT INTO public.invoices (invoice_number, customer_id, customer_name,
    line_items, subtotal, tax_rate, tax_amount, total,
    status, issued_at, due_date, moneda, is_e2e, e2e_scope)
  VALUES (v_invoice_number, v_customer_id, 'E2E Portal',
    jsonb_build_array(jsonb_build_object('description', 'Renta portal E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'sent', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days',
    'MXN', true, p_scope)
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total', v_total,
    'scope', p_scope
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_seed_portal_scenario(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.e2e_seed_portal_scenario(text, text) TO authenticated;