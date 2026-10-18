\set ON_ERROR_STOP on
GRANT SELECT ON public.fixture_invoice_balance TO authenticated;

CREATE FUNCTION public.fixture_invoice_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION public.fixture_payment_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION public.fixture_try(case_name text, sql_text text, expected text, message_pattern text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := '00000'; msg text := 'accepted'; d text; h text; affected_rows bigint;
BEGIN
  BEGIN
    EXECUTE sql_text;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, msg = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL, h = PG_EXCEPTION_HINT;
  END;
  INSERT INTO public.fixture_attempts VALUES(case_name, expected, actual, msg, d, h, affected_rows, sql_text);
  IF actual <> expected OR (message_pattern <> '' AND msg !~ message_pattern) THEN
    RAISE EXCEPTION 'Unexpected fixture result %: expected %, got %: %', case_name, expected, actual, msg;
  END IF;
  RAISE NOTICE 'PASS %: SQLSTATE %, %', case_name, actual, msg;
END;
$$;
CREATE FUNCTION public.fixture_insert(case_name text, n integer, amount numeric, currency text, rate_sql text, expected text, pattern text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF rate_sql NOT IN ('DEFAULT','NULL','0','1','17.5','18') THEN RAISE EXCEPTION 'Unexpected rate'; END IF;
  PERFORM public.fixture_try(case_name, format(
    'INSERT INTO public.payments(invoice_id, amount, currency, exchange_rate, payment_date, organization_id) VALUES(%L::uuid,%s,%L,%s,%L,%L::uuid)',
    public.fixture_invoice_id(n), amount, currency, rate_sql, '2026-09-01', '10000000-0000-0000-0000-000000000002'
  ), expected, pattern);
END;
$$;
CREATE FUNCTION public.fixture_update(case_name text, n integer, amount numeric, expected text, pattern text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fixture_try(case_name, format('UPDATE public.payments SET amount=%s WHERE id=%L::uuid', amount, public.fixture_payment_id(n)), expected, pattern);
END;
$$;
CREATE FUNCTION public.fixture_observe(case_name text, n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.fixture_observations
  SELECT case_name, jsonb_build_object(
    'invoice', to_jsonb(v),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('amount', p.amount, 'currency', p.currency, 'exchange_rate', p.exchange_rate,
      'rep_cfdi_status', p.rep_cfdi_status, 'amount_mxn', p.amount_mxn) ORDER BY p.amount) FROM public.payments p WHERE p.invoice_id=v.id), '[]'::jsonb),
    'guard_raw_paid', COALESCE((SELECT sum(CASE
      WHEN upper(COALESCE(p.currency, v.moneda))=upper(COALESCE(v.moneda,'MXN')) THEN p.amount
      WHEN upper(COALESCE(p.currency,'MXN'))='MXN' THEN p.amount/NULLIF(COALESCE(NULLIF(p.exchange_rate,0),NULLIF(v.tipo_cambio,0)),0)
      ELSE p.amount*COALESCE(NULLIF(p.exchange_rate,0),NULLIF(v.tipo_cambio,0)) END)
      FROM public.payments p WHERE p.invoice_id=v.id),0)
  ) FROM public.fixture_invoice_balance v WHERE v.id=public.fixture_invoice_id(n);
END;
$$;

SET ROLE authenticated;
SELECT set_config('fixture.user_id','10000000-0000-0000-0000-000000000001',false);
SELECT set_config('fixture.organization_id','10000000-0000-0000-0000-000000000002',false);
SELECT current_user AS caller_role, session_user AS login_role, auth.uid() AS synthetic_uid;

-- N7 exact two-MXN-1 case under valid rate variants.
SELECT fixture_insert('N7_default1_first',101,1,'MXN','DEFAULT','00000');
SELECT fixture_insert('N7_default1_second',101,1,'MXN','DEFAULT','00000');
SELECT fixture_observe('N7_default1_two_payments',101);
SELECT fixture_insert('N7_rate17_5_first',102,1,'MXN','17.5','00000');
SELECT fixture_insert('N7_rate17_5_second',102,1,'MXN','17.5','00000');
SELECT fixture_observe('N7_rate17_5_two_payments',102);
SELECT fixture_insert('N7_rate18_first',103,1,'MXN','18','00000');
SELECT fixture_insert('N7_rate18_second',103,1,'MXN','18','00000');
SELECT fixture_observe('N7_rate18_two_payments',103);
SELECT fixture_insert('N7_rate0_fallback_first',104,1,'MXN','0','00000');
SELECT fixture_insert('N7_rate0_fallback_second',104,1,'MXN','0','00000');
SELECT fixture_observe('N7_rate0_two_payments',104);
SELECT fixture_insert('N7_null_rate_illegal',105,1,'MXN','NULL','23502','null value');

-- A boundary where canonical view is fully paid but the source sync rounds the raw sum to .11.
SELECT fixture_insert('N7_small_invoice_first',120,1,'MXN','17.5','00000');
SELECT fixture_insert('N7_small_invoice_second',120,1,'MXN','17.5','00000');
SELECT fixture_observe('N7_rounding_status_boundary',120);

-- N8 original-creation viability, then explicit editing of separately seeded historical rows.
SELECT fixture_insert('N8_create_original_default1',211,175,'MXN','DEFAULT','23514','Sobrepago rechazado');
SELECT fixture_insert('N8_create_original_rate17_5',212,175,'MXN','17.5','00000');
SELECT fixture_insert('N8_create_original_rate18',213,175,'MXN','18','00000');
SELECT fixture_insert('N8_create_original_null_illegal',214,175,'MXN','NULL','23502','null value');
SELECT fixture_observe('N8_legacy_default1_before',201);
SELECT fixture_observe('N8_rate17_5_before',202);
SELECT fixture_observe('N8_rate18_before',203);
SELECT fixture_update('N8_edit350_legacy_default1',201,350,'23514','Sobrepago rechazado');
SELECT fixture_update('N8_edit350_rate17_5',202,350,'00000');
SELECT fixture_update('N8_edit350_rate18',203,350,'00000');
SELECT fixture_observe('N8_legacy_default1_after',201);
SELECT fixture_observe('N8_rate17_5_after',202);
SELECT fixture_observe('N8_rate18_after',203);

-- Invoice TC 17.5 vs payment TC 18: server can accept more than canonical invoice total.
SELECT fixture_update('N8_edit1800_rate18',203,1800,'00000');
SELECT fixture_observe('N8_rate18_canonical_overpayment',203);

-- Strict raw server guard versus canonical per-payment cents and client tolerance.
SELECT fixture_update('N8_exact1750_rate17_5',221,1750,'00000');
SELECT fixture_update('N8_extra002_rate17_5',222,1750.02,'23514','Sobrepago rechazado');
SELECT fixture_update('N8_extra026_rate17_5',223,1750.26,'23514','Sobrepago rechazado');
SELECT fixture_observe('N8_exact_maximum_after',221);
SELECT fixture_update('N8_USD_cent_on_MXN_invoice',301,1.01,'23514','Sobrepago rechazado');

-- REP stamped guard is exact current catalog function, not a mock.
SELECT fixture_update('REP_stamped_amount_change',240,350,'23514','REP timbrado');
SELECT fixture_try('REP_stamped_notes_allowed',format('UPDATE public.payments SET notes=%L WHERE id=%L::uuid','synthetic note',fixture_payment_id(240)),'00000');
SELECT fixture_try('REP_stamped_delete_blocked',format('DELETE FROM public.payments WHERE id=%L::uuid',fixture_payment_id(240)),'23514','REP timbrado');
SELECT fixture_insert('draft_guard_preserved',401,1,'USD','17.5','23514','borrador');
SELECT fixture_insert('cancelled_guard_preserved',402,1,'USD','17.5','23514','canceladas');
SELECT fixture_insert('PUE_stamped_partial_preserved',403,10,'USD','17.5','23514','PUE');

RESET ROLE;
SELECT case_id, expected_state, actual_state, message FROM fixture_attempts ORDER BY case_id;
SELECT case_id, observation FROM fixture_observations ORDER BY case_id;
SELECT count(*) AS assertions_passed, bool_and(expected_state=actual_state) AS all_expected FROM fixture_attempts;
