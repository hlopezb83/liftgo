\set ON_ERROR_STOP on
GRANT SELECT ON public.fixture_invoice_balance TO authenticated;

CREATE FUNCTION public.policy_record(test_name text, kind text, expected jsonb, actual jsonb, passed boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.policy_expectations VALUES(test_name,kind,expected,actual,passed);
  RAISE NOTICE '% % expected=% actual=%', CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END,test_name,expected,actual;
END;
$$;
CREATE FUNCTION public.policy_try(test_name text, statement text, expected_state text, expected_affected bigint DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
DECLARE code text:='00000'; message text:='accepted'; affected bigint; detail text; hint text;
BEGIN
  BEGIN
    EXECUTE statement;
    GET DIAGNOSTICS affected=ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT,detail=PG_EXCEPTION_DETAIL,hint=PG_EXCEPTION_HINT;
  END;
  PERFORM policy_record(test_name,'statement',jsonb_build_object('sqlstate',expected_state,'affected_if_success',expected_affected),
    jsonb_build_object('sqlstate',code,'affected',affected,'message',message,'detail',detail,'hint',hint,'statement',statement),
    code=ANY(string_to_array(expected_state,'|')) AND (code<>'00000' OR expected_affected IS NULL OR affected=expected_affected));
END;
$$;
CREATE FUNCTION public.policy_insert(test_name text,n integer,amount numeric,currency text,rate_sql text,expected_state text DEFAULT '00000') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF rate_sql NOT IN('DEFAULT','NULL','0','1','17.5','18','20') THEN RAISE EXCEPTION 'Unexpected rate'; END IF;
  PERFORM policy_try(test_name,format('INSERT INTO public.payments(invoice_id,amount,currency,exchange_rate,payment_date,organization_id) VALUES(%L::uuid,%s,%L,%s,%L,%L::uuid)',
    policy_invoice_id(n),amount,currency,rate_sql,'2026-09-01','10000000-0000-0000-0000-000000000002'),expected_state);
END;
$$;
CREATE FUNCTION public.policy_update(test_name text,n integer,amount numeric,expected_state text DEFAULT '00000') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM policy_try(test_name,format('UPDATE public.payments SET amount=%s WHERE id=%L::uuid',amount,policy_payment_id(n)),expected_state);
END;
$$;
CREATE FUNCTION public.policy_observe(test_name text,n integer,paid numeric,balance numeric,status text,fx_missing integer DEFAULT 0) RETURNS void LANGUAGE plpgsql AS $$
DECLARE expected jsonb; actual jsonb;
BEGIN
  expected:=jsonb_build_object('paid',paid,'balance',balance,'status',status,'fx_missing',fx_missing);
  SELECT jsonb_build_object('paid',v.paid_amount,'balance',v.balance,'status',v.status,'fx_missing',v.payments_fx_missing)
    INTO actual FROM fixture_invoice_balance v WHERE v.id=policy_invoice_id(n);
  PERFORM policy_record(test_name,'view/status',expected,COALESCE(actual,'null'::jsonb),expected=actual);
END;
$$;

SET ROLE authenticated;
SELECT set_config('fixture.user_id','10000000-0000-0000-0000-000000000001',false);
SELECT set_config('fixture.organization_id','10000000-0000-0000-0000-000000000002',false);
SELECT current_user,session_user,auth.uid(),current_setting('app.e2e_seed',true) AS e2e_bypass_must_not_be_on;

DO $$
DECLARE n integer; rate text; tag text;
BEGIN
  FOR n,rate,tag IN SELECT * FROM(VALUES(101,'DEFAULT','default1'),(102,'17.5','rate17_5'),(103,'18','rate18'),(104,'0','rate0')) AS rates(n,rate,tag) LOOP
    PERFORM policy_insert('N7_'||tag||'_first',n,1,'MXN',rate);
    PERFORM policy_insert('N7_'||tag||'_second',n,1,'MXN',rate);
    PERFORM policy_observe('N7_'||tag||'_canonical_cents',n,0.12,99.88,'partial');
    PERFORM policy_insert('N7_paid_'||tag||'_first',n+10,1,'MXN',rate);
    PERFORM policy_insert('N7_paid_'||tag||'_second',n+10,1,'MXN',rate);
    PERFORM policy_observe('N7_paid_'||tag||'_status',n+10,0.12,0,'paid');
  END LOOP;
  FOR n,rate,tag IN SELECT * FROM(VALUES(201,'DEFAULT','default1'),(202,'17.5','rate17_5'),(203,'18','rate18'),(204,'0','rate0')) AS rates(n,rate,tag) LOOP
    PERFORM policy_observe('N8_'||tag||'_before',n,10,90,'sent');
    PERFORM policy_update('N8_'||tag||'_edit350',n,350);
    PERFORM policy_observe('N8_'||tag||'_after',n,20,80,'partial');
    PERFORM policy_insert('N8_'||tag||'_create_original',n+10,175,'MXN',rate);
    PERFORM policy_observe('N8_'||tag||'_created_original',n+10,10,90,'partial');
  END LOOP;
  FOR n,rate,tag IN SELECT * FROM(VALUES(301,'1','rate1'),(302,'17.5','rate17_5'),(303,'18','rate18'),(304,'0','rate0')) AS rates(n,rate,tag) LOOP
    PERFORM policy_update('max_'||tag||'_1750',n,1750);
    PERFORM policy_update('max_'||tag||'_1750_02',n,1750.02);
    PERFORM policy_update('max_'||tag||'_1750_08',n,1750.08);
    PERFORM policy_update('max_'||tag||'_1750_09_rejected',n,1750.09,'23514');
    PERFORM policy_update('max_'||tag||'_1750_26_rejected',n,1750.26,'23514');
    PERFORM policy_update('max_'||tag||'_1800_rejected',n,1800,'23514');
    PERFORM policy_observe('max_'||tag||'_canonical_final',n,100,0,'paid');
  END LOOP;
END;
$$;

SELECT policy_insert('missing_invoice_rate_null',401,1,'MXN','1','23514');
SELECT policy_observe('missing_invoice_rate_null_rollback',401,0,100,'sent');
SELECT policy_insert('missing_invoice_rate_one',402,1,'MXN','1','23514');
SELECT policy_observe('missing_invoice_rate_one_rollback',402,0,100,'sent');
SELECT policy_insert('missing_USD_source_rate_one',403,20,'USD','1','23514');
SELECT policy_observe('missing_USD_source_rate_one_rollback',403,0,100,'sent');
SELECT policy_insert('missing_USD_source_rate_zero',404,20,'USD','0','23514');
SELECT policy_insert('same_currency_without_rates',405,20,'USD','0');
SELECT policy_observe('same_currency_without_rates_value',405,20,80,'partial');
SELECT policy_insert('mixed_case_same_currency_without_rates',406,20,'USD','0');
SELECT policy_observe('mixed_case_same_currency_without_rates_value',406,20,80,'partial');
SELECT policy_insert('mixed_case_cross_currency',407,175,'mXn','1');
SELECT policy_observe('mixed_case_cross_currency_value',407,10,90,'partial');
SELECT policy_insert('foreign_to_foreign_divides_target_rate',408,50,'eUr','20');
SELECT policy_observe('foreign_to_foreign_value',408,57.14,42.86,'partial');
SELECT policy_insert('missing_foreign_source_rate_one',409,20,'EUR','1','23514');
SELECT policy_insert('missing_foreign_source_rate_zero',410,1,'EUR','0','23514');
SELECT policy_insert('MXN_null_rate_remains_not_null_violation',411,1,'MXN','NULL','23502');
SELECT policy_insert('plain_MXN_sanity',413,20,'MXN','1');
SELECT policy_observe('plain_MXN_sanity_value',413,20,80,'partial');
SELECT policy_insert('same_currency_rate_zero_sanity',414,20,'USD','0');
SELECT policy_observe('same_currency_rate_zero_sanity_value',414,20,80,'partial');

SELECT policy_insert('existing_missing_FX_blocks_new_payment',501,1,'MXN','1','23514');
SELECT policy_observe('existing_missing_FX_rollback',501,0,100,'sent',1);
SELECT policy_try('sync_missing_FX_does_not_raise',format('SELECT public.sync_invoice_status(%L::uuid)',policy_invoice_id(502)),'00000');
SELECT policy_observe('sync_missing_FX_does_not_fabricate_paid',502,0,100,'sent',1);
SELECT policy_try('invoice_integrity_blocks_paid_with_missing_FX',format('UPDATE public.invoices SET status=%L WHERE id=%L::uuid','paid',policy_invoice_id(502)),'23514');

SELECT policy_insert('normalize_source_cents_before_FX',601,0.015,'USD','17.5');
SELECT policy_observe('normalize_source_cents_before_FX_value',601,0.35,0,'paid');
SELECT policy_record('normalize_source_cents_stored_amounts','source normalization',
  '{"amount":0.02,"amount_mxn":0.35}'::jsonb,
  COALESCE((SELECT jsonb_build_object('amount',amount,'amount_mxn',amount_mxn) FROM payments WHERE invoice_id=policy_invoice_id(601)),'null'::jsonb),
  COALESCE((SELECT amount=0.02 AND amount_mxn=0.35 FROM payments WHERE invoice_id=policy_invoice_id(601)),false));
SELECT policy_insert('normalize_source_cents_rejects_raw_only_fit',602,0.015,'USD','17.5','23514');
SELECT policy_observe('normalize_source_cents_rejects_rollback',602,0,0.30,'sent');
SELECT policy_insert('no_premature_paid_at_one_cent_short',603,99.99,'USD','0');
SELECT policy_observe('no_premature_paid_at_one_cent_short_value',603,99.99,0.01,'partial');

RESET ROLE;
SELECT name,kind,passed,expected,actual FROM policy_expectations WHERE NOT passed ORDER BY name;
SELECT count(*) AS expectations, count(*) FILTER(WHERE passed) AS passed, count(*) FILTER(WHERE NOT passed) AS failed FROM policy_expectations;
DO $$ DECLARE failures integer; BEGIN
  SELECT count(*) INTO failures FROM policy_expectations WHERE NOT passed;
  IF failures>0 THEN RAISE EXCEPTION 'CANONICAL_POLICY_EXPECTATIONS_FAILED: %',failures; END IF;
END $$;
