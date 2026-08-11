-- 1. get_portal_collection_account: exige sesión (portal autenticado o staff)
CREATE OR REPLACE FUNCTION public.get_portal_collection_account()
RETURNS TABLE(bank text, clabe text, account_number text, account_holder text, currency text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere sesión activa';
  END IF;

  RETURN QUERY
  SELECT ba.bank, ba.clabe, ba.account_number, ba.account_holder, ba.currency
  FROM public.bank_accounts ba
  WHERE ba.is_default_collection = true AND ba.is_active = true
  LIMIT 1;
END;
$function$;

-- 2. claim_payment_rep_stamping: solo admin/administrativo o procesos service_role
CREATE OR REPLACE FUNCTION public.claim_payment_rep_stamping(p_payment_id uuid, p_stale_minutes integer DEFAULT 5)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claimed uuid;
  v_status text;
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL
     AND NOT (public.has_role(v_uid, 'admin'::app_role)
              OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol Admin o Administrativo';
  END IF;

  UPDATE public.payments
     SET rep_cfdi_status = 'stamping',
         rep_stamping_started_at = now(),
         rep_lookup_attempts = 0
   WHERE id = p_payment_id
     AND (
       (rep_cfdi_status IN ('pending', 'error', 'none') AND rep_cfdi_uuid IS NULL)
       OR rep_cfdi_status = 'cancelled'
       OR (rep_cfdi_status = 'stamping'
           AND rep_stamping_started_at < now() - make_interval(mins => p_stale_minutes))
     )
  RETURNING id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    RETURN 'claimed';
  END IF;

  SELECT rep_cfdi_status INTO v_status FROM public.payments WHERE id = p_payment_id;
  RETURN COALESCE(v_status, 'not_found');
END;
$function$;

-- 3. Revocar EXECUTE a anon/PUBLIC en funciones internas (defensa en profundidad)
DO $$
DECLARE
  r record;
  authed_only text[] := ARRAY[
    'report_profit_by_model','report_revenue_by_month','report_revenue_month_invoices',
    'report_maintenance_cost_by_unit','report_utilization_by_model','report_utilization_by_unit',
    'upsert_billing_secret','get_portal_collection_account','claim_payment_rep_stamping',
    'has_permission','customer_owns_invoice','assert_invoice_cancellable',
    'peek_next_invoice_number','assign_stamped_invoice_number','assign_stamped_credit_note_number',
    'assign_stamped_rep_number','e2e_seed_scenario','e2e_purge_all','e2e_seed_portal_scenario',
    'e2e_teardown'
  ];
  service_only text[] := ARRAY[
    'recalc_supplier_bill','reconcile_stamping_invoice','mark_overdue_supplier_bills',
    'purge_old_notifications','next_invoice_number','next_credit_note_number',
    'next_booking_number','next_quote_number','next_contract_number',
    'next_delivery_number','next_inspection_number','next_supplier_bill_number',
    'next_booking_number_e2e','next_invoice_number_e2e','next_quote_number_e2e',
    'expire_stale_quotes','internal_get_cron_secret','notify_admins','create_notification',
    'revoke_user_sessions','prepare_payment_complement'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(authed_only || service_only)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.proname = ANY(service_only) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;