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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
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
      SELECT id FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true
    );

    DELETE FROM public.payments
    WHERE invoice_id IN (
      SELECT id FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true
    );

    -- FIX R6-18: credit_notes.invoice_id es ON DELETE RESTRICT y las NC de
    -- clientes E2E no llevan is_e2e; borrarlas antes de invoices/customers.
    DELETE FROM public.credit_notes
    WHERE invoice_id IN (
      SELECT id FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true
    ) OR customer_id = ANY(v_existing_customer_ids);

    -- FIX R6-18: objetos huerfanos payment-proofs/<customer_id>/...
    DELETE FROM storage.objects o
    WHERE o.bucket_id = 'payment-proofs'
      AND EXISTS (
        SELECT 1 FROM unnest(v_existing_customer_ids) AS t(id)
        WHERE o.name LIKE t.id::text || '/%'
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

CREATE OR REPLACE FUNCTION public.e2e_teardown(p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
  v_ids uuid[];
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_teardown requires admin role';
  END IF;
  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_teardown requires a non-null p_scope';
  END IF;

  PERFORM set_config('app.e2e_teardown', 'on', true);

  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM (
    SELECT id FROM public.invoices  WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.bookings WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.quotes   WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.forklifts WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.equipment_models WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.customers WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.payments WHERE is_e2e AND e2e_scope = p_scope
  ) s;

  DELETE FROM public.payments
   WHERE (is_e2e = true AND e2e_scope = p_scope)
      OR invoice_id IN (
           SELECT id FROM public.invoices
            WHERE is_e2e = true AND e2e_scope = p_scope
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payments', v_n);

  -- FIX R6-18: notas de credito ligadas a invoices/clientes E2E (FK RESTRICT).
  DELETE FROM public.credit_notes
   WHERE invoice_id IN (
           SELECT id FROM public.invoices
            WHERE is_e2e = true AND e2e_scope = p_scope
         )
      OR customer_id IN (
           SELECT id FROM public.customers
            WHERE is_e2e = true AND e2e_scope = p_scope
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('credit_notes', v_n);

  -- FIX R6-18: objetos huerfanos payment-proofs/<customer_id>/...
  DELETE FROM storage.objects o
   WHERE o.bucket_id = 'payment-proofs'
     AND EXISTS (
       SELECT 1 FROM public.customers c
        WHERE c.is_e2e = true AND c.e2e_scope = p_scope
          AND o.name LIKE c.id::text || '/%'
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('storage_objects', v_n);

  DELETE FROM public.invoices WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_n);

  DELETE FROM public.bookings WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bookings', v_n);

  DELETE FROM public.quote_assigned_forklifts
    WHERE quote_id IN (SELECT id FROM public.quotes WHERE is_e2e = true AND e2e_scope = p_scope);

  DELETE FROM public.quotes WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotes', v_n);

  DELETE FROM public.maintenance_parts
    WHERE maintenance_log_id IN (
      SELECT id FROM public.maintenance_logs
       WHERE (is_e2e = true AND e2e_scope = p_scope)
          OR forklift_id IN (SELECT id FROM public.forklifts WHERE is_e2e = true AND e2e_scope = p_scope));

  DELETE FROM public.maintenance_labor
    WHERE maintenance_log_id IN (
      SELECT id FROM public.maintenance_logs
       WHERE (is_e2e = true AND e2e_scope = p_scope)
          OR forklift_id IN (SELECT id FROM public.forklifts WHERE is_e2e = true AND e2e_scope = p_scope));

  DELETE FROM public.maintenance_logs
   WHERE (is_e2e = true AND e2e_scope = p_scope)
      OR forklift_id IN (SELECT id FROM public.forklifts WHERE is_e2e = true AND e2e_scope = p_scope);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('maintenance_logs', v_n);

  DELETE FROM public.forklifts WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('forklifts', v_n);

  DELETE FROM public.equipment_models WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('equipment_models', v_n);

  DELETE FROM public.customers WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('customers', v_n);

  IF array_length(v_ids, 1) IS NOT NULL THEN
    DELETE FROM public.activity_feed WHERE is_e2e = true AND entity_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('activity_feed', v_n);
  ELSE
    v_counts := v_counts || jsonb_build_object('activity_feed', 0);
  END IF;

  RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.e2e_teardown(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_teardown(text) TO authenticated;