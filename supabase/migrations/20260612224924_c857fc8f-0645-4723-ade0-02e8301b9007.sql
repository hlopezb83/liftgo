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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_teardown requires admin role';
  END IF;
  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_teardown requires a non-null p_scope';
  END IF;

  -- Recolectar IDs de entidades de este scope ANTES de borrarlas para limpiar activity_feed.
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM (
    SELECT id FROM public.invoices  WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.bookings WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.quotes   WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.forklifts WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.equipment_models WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.customers WHERE is_e2e AND e2e_scope = p_scope
    UNION ALL SELECT id FROM public.payments WHERE is_e2e AND e2e_scope = p_scope
  ) s;

  DELETE FROM public.payments WHERE is_e2e = true AND (
    e2e_scope = p_scope
    OR invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true AND e2e_scope = p_scope)
  ); GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payments', v_n);

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

  DELETE FROM public.forklifts WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('forklifts', v_n);

  DELETE FROM public.equipment_models WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('equipment_models', v_n);

  DELETE FROM public.customers WHERE is_e2e = true AND e2e_scope = p_scope;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('customers', v_n);

  -- Limpiar activity_feed asociado a las entidades borradas en este scope.
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