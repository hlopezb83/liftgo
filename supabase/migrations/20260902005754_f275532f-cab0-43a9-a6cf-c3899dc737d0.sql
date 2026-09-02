DO $do$
DECLARE
  v_oid regprocedure;
  v_def text;
BEGIN
  FOREACH v_oid IN ARRAY ARRAY[
    'public.get_dashboard_stats()'::regprocedure,
    'public.get_mrr_detail()'::regprocedure,
    'public.get_forklift_financials(uuid)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_oid) INTO v_def;

    v_def := replace(v_def,
      'tipo_cambio IS NOT NULL AND tipo_cambio > 0',
      'NOT public.fx_is_missing(moneda, tipo_cambio)');
    v_def := replace(v_def,
      'i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0',
      'NOT public.fx_is_missing(i.moneda, i.tipo_cambio)');
    v_def := replace(v_def,
      'b.tipo_cambio IS NOT NULL AND b.tipo_cambio > 0',
      'NOT public.fx_is_missing(b.currency, b.tipo_cambio)');
    v_def := replace(v_def,
      'ELSE NULLIF(b.tipo_cambio, 0)',
      'WHEN NOT public.fx_is_missing(b.currency, b.tipo_cambio) THEN b.tipo_cambio ELSE NULL');

    EXECUTE v_def;
  END LOOP;
END
$do$;

DO $do$
DECLARE
  v_def text;
  v_before text := E'CROSS JOIN forklifts f\n    WHERE f.deleted_at IS NULL\n      AND COALESCE(f.is_e2e, false) = false';
  v_after text := E'CROSS JOIN forklifts f\n    WHERE (f.deleted_at IS NULL OR f.deleted_at::date >= ms.month_start)\n      AND COALESCE(f.is_e2e, false) = false';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_income_statement'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'R10-04: no se encontró la definición esperada de depreciación';
  END IF;

  IF position(v_before IN v_def) > 0 THEN
    EXECUTE replace(v_def, v_before, v_after);
  ELSIF position('f.deleted_at IS NULL OR f.deleted_at::date >= ms.month_start' IN v_def) = 0 THEN
    RAISE EXCEPTION 'R10-04: la definición de depreciación no coincide con el estado esperado';
  END IF;
END
$do$;

DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.match_bank_statement_lines(uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'FROM public.supplier_payments sp\n        JOIN public.supplier_bills sb ON sb.id = sp.bill_id\n        WHERE',
    'FROM public.supplier_payments sp\n        JOIN public.supplier_bills sb ON sb.id = sp.bill_id\n        WHERE sp.is_e2e IS NOT TRUE\n          AND');
  v_def := replace(v_def,
    'FROM public.payments p\n        LEFT JOIN public.invoices i ON i.id = p.invoice_id\n        WHERE',
    'FROM public.payments p\n        LEFT JOIN public.invoices i ON i.id = p.invoice_id\n        WHERE p.is_e2e IS NOT TRUE\n          AND');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.confirm_bank_match(uuid,uuid,uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def, 'WHERE p.id = p_payment_id;', 'WHERE p.id = p_payment_id AND p.is_e2e IS NOT TRUE;');
  v_def := replace(v_def, 'WHERE sp.id = p_supplier_payment_id;', 'WHERE sp.id = p_supplier_payment_id AND sp.is_e2e IS NOT TRUE;');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.get_bank_match_candidates(uuid,text,integer,numeric)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'FROM public.supplier_payments sp\n      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id',
    'FROM public.supplier_payments sp\n      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id\n      WHERE sp.is_e2e IS NOT TRUE');
  v_def := replace(v_def,
    'FROM public.payments p\n      LEFT JOIN public.invoices i ON i.id = p.invoice_id',
    'FROM public.payments p\n      LEFT JOIN public.invoices i ON i.id = p.invoice_id\n      WHERE p.is_e2e IS NOT TRUE');
  EXECUTE v_def;
END
$do$;

REVOKE EXECUTE ON FUNCTION public.fx_is_missing(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_is_missing(text, numeric) TO authenticated, service_role;