-- R4-21 (1/2): nuevos entornos no habilitan seeding E2E por defecto.
ALTER TABLE public.company_settings ALTER COLUMN allow_e2e_seed SET DEFAULT false;

-- R4-21 (2/2): el seed del portal ya no asigna el rol 'customer' a una cuenta
-- que ya tenga cualquier rol (evita degradar/alterar cuentas de personal).
CREATE OR REPLACE FUNCTION public.e2e_seed_portal_scenario(p_scope text, p_portal_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 10000;
  v_tax numeric := 1600;
  v_total numeric := 11600;
  v_allowed boolean;
  v_existing_customer_ids uuid[];
  v_has_role boolean;
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

  PERFORM set_config('app.e2e_seed', 'on', true);

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_portal_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Portal user % not found in auth.users', p_portal_email;
  END IF;

  -- R4-21: solo se asigna 'customer' a cuentas SIN ningun rol previo.
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user_id)
    INTO v_has_role;
  IF NOT v_has_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'customer'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT public.has_role(v_user_id, 'customer'::app_role) THEN
    RAISE EXCEPTION 'El usuario % ya tiene un rol distinto de customer; no se altera desde el seed E2E', p_portal_email;
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_existing_customer_ids
  FROM public.customers
  WHERE user_id = v_user_id
    AND is_e2e = true;

  IF array_length(v_existing_customer_ids, 1) IS NOT NULL THEN
    DELETE FROM public.customer_payment_intents
    WHERE invoice_id IN (
      SELECT id FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids)
    );

    DELETE FROM public.payments
    WHERE invoice_id IN (
      SELECT id FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids)
    );

    DELETE FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true;
    DELETE FROM public.bookings WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true;
    DELETE FROM public.quote_assigned_forklifts
    WHERE quote_id IN (
      SELECT id FROM public.quotes WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true
    );
    DELETE FROM public.quotes WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true;
    DELETE FROM public.customers WHERE id = ANY(v_existing_customer_ids) AND is_e2e = true;
  END IF;

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
    v_subtotal, 16, v_tax, v_total, 'sent', public.today_mty(), public.today_mty() + INTERVAL '15 days',
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
$function$;

REVOKE ALL ON FUNCTION public.e2e_seed_portal_scenario(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_seed_portal_scenario(text, text) TO authenticated;

-- R4-28: policy DELETE en el bucket payment-proofs.
CREATE POLICY "Customers delete own pending proofs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR (
      (storage.foldername(name))[1] = public.get_customer_id_for_user((select auth.uid()))::text
      AND NOT EXISTS (
        SELECT 1
        FROM public.customer_payment_intents cpi
        WHERE cpi.proof_url = storage.objects.name
          AND cpi.status <> 'pending_review'
      )
    )
  )
);