\set ON_ERROR_STOP on
-- Standalone follow-up. Does not add or alter the comparable 106 expectations.
CREATE TABLE public.decimal_probe_result(payload jsonb NOT NULL);
GRANT SELECT,INSERT ON public.decimal_probe_result TO authenticated;
SET ROLE authenticated;
SELECT set_config('fixture.user_id','10000000-0000-0000-0000-000000000001',false);
SELECT set_config('fixture.organization_id','10000000-0000-0000-0000-000000000002',false);
INSERT INTO public.invoices(id,invoice_number,total,status,moneda,tipo_cambio,metodo_pago,cfdi_status,issued_at,organization_id)
VALUES(policy_invoice_id(700),'DECIMAL-PROBE-700',2500,'sent','USD',17.500001,'PPD','pending','2026-09-01','10000000-0000-0000-0000-000000000002');
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,organization_id)
VALUES(policy_payment_id(700),policy_invoice_id(700),175,'MXN',1,'2026-09-01','10000000-0000-0000-0000-000000000002');
DO $$
DECLARE before_row jsonb; after_row jsonb; code text:='00000'; msg text:='accepted'; affected bigint;
BEGIN
  SELECT to_jsonb(v) INTO before_row FROM fixture_invoice_balance v WHERE id=policy_invoice_id(700);
  BEGIN
    UPDATE public.payments SET amount=43750.09 WHERE id=policy_payment_id(700);
    GET DIAGNOSTICS affected=ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  END;
  SELECT to_jsonb(v) INTO after_row FROM fixture_invoice_balance v WHERE id=policy_invoice_id(700);
  INSERT INTO public.decimal_probe_result VALUES(jsonb_build_object(
    'fixture','synthetic standalone decimal boundary; not production',
    'target',jsonb_build_object('database',current_database(),'address',inet_server_addr(),'port',inet_server_port(),'role',current_user),
    'input',jsonb_build_object('invoice_total',2500,'invoice_currency','USD','invoice_rate',17.500001,'original_amount',175,'new_amount',43750.09,'payment_currency','MXN','payment_rate',1),
    'raw_ratio_text',(43750.09::numeric/17.500001::numeric)::text,
    'sql_canonical',public.fx_convert_amount(43750.09,'MXN','USD',1,17.500001),
    'before',before_row,'update',jsonb_build_object('sqlstate',code,'message',msg,'affected',affected),'after',after_row,
    'assertion_passed',code='00000' AND affected=1 AND (before_row->>'paid_amount')::numeric=10 AND (before_row->>'balance')::numeric=2490
      AND (after_row->>'paid_amount')::numeric=2500 AND (after_row->>'balance')::numeric=0 AND after_row->>'status'='paid',
    'comparable_suite_unchanged',(SELECT count(*)=106 AND bool_and(passed) FROM public.policy_expectations)));
END;
$$;
RESET ROLE;
DO $$ BEGIN IF NOT (SELECT (payload->>'assertion_passed')::boolean AND (payload->>'comparable_suite_unchanged')::boolean FROM public.decimal_probe_result) THEN RAISE EXCEPTION 'DECIMAL_PROBE_FAILED'; END IF; END; $$;
