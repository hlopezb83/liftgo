\set ON_ERROR_STOP on
-- Synthetic adapters only. No production RLS, org-write trigger, or auth implementation.
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"role":"authenticated"}'::jsonb $$;
ALTER TABLE public.invoices ADD COLUMN cancelled_at timestamptz, ADD COLUMN cancellation_reason text;
ALTER TABLE public.payments ADD COLUMN rep_cancelled_at timestamptz;
-- Real payments.organization_id is nullable; preserve PR275 nullable column.
CREATE FUNCTION public.fixture_invoice(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION public.fixture_payment(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION public.fixture_org(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
INSERT INTO public.invoices(id,invoice_number,total,status,moneda,tipo_cambio,metodo_pago,cfdi_status,issued_at,organization_id)
SELECT fixture_invoice(n),'GUARD-'||n,
 CASE WHEN n IN (531,545) THEN .12 WHEN n=532 THEN .35 WHEN n IN (546,547,548) THEN 1 ELSE 100 END,
 'sent',CASE WHEN n=532 THEN 'MXN' ELSE 'USD' END,17.5,
 CASE WHEN n IN (511,512) THEN 'PUE' ELSE 'PPD' END,
 CASE WHEN n IN (511,513) THEN 'stamped' ELSE 'pending' END,
 '2026-09-01',fixture_org(CASE WHEN n=530 THEN 3 ELSE 2 END)
FROM unnest(ARRAY[510,511,512,513,520,521,522,523,524,525,526,527,528,529,530,531,532,533,534,535,536,537,538,539,540,541,542,543,544,545,546,547,548,550,551,552,900,901,902,903]) n;
UPDATE invoices SET tipo_cambio=0 WHERE id=fixture_invoice(552);
-- Historical synthetic states, deliberately seeded before all triggers.
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,organization_id)
SELECT fixture_payment(n),fixture_invoice(n),175,'MXN',17.5,'2026-09-01',fixture_org(2)
FROM unnest(ARRAY[401,402,403]) n;
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,organization_id)
VALUES
 (fixture_payment(539),fixture_invoice(539),175,'MXN',17.5,'2026-09-01',fixture_org(3)),
 (fixture_payment(540),fixture_invoice(540),175,'MXN',17.5,'2026-09-01',NULL),
 (fixture_payment(541),fixture_invoice(541),175,'MXN',17.5,'2026-09-01',fixture_org(2)),
 (fixture_payment(542),fixture_invoice(542),175,'MXN',17.5,'2026-09-01',fixture_org(3)),
 (fixture_payment(9011),fixture_invoice(901),40,'USD',1,'2026-09-01',fixture_org(2)),
 (fixture_payment(9012),fixture_invoice(901),40,'USD',1,'2026-09-01',fixture_org(2)),
 (fixture_payment(9021),fixture_invoice(902),40,'USD',1,'2026-09-01',fixture_org(2)),
 (fixture_payment(9031),fixture_invoice(903),40,'USD',1,'2026-09-01',fixture_org(2));
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,rep_cfdi_status,rep_cancelled_at,organization_id)
SELECT fixture_payment(n*10+k),fixture_invoice(n),1,'MXN',17.5,'2026-09-01','stamped',CASE WHEN n=547 THEN now() END,fixture_org(2)
FROM unnest(ARRAY[545,546,547]) n CROSS JOIN generate_series(1,2) k;
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,organization_id)
SELECT fixture_payment(5310+k),fixture_invoice(531),1,'MXN',17.5,'2026-09-01',fixture_org(2) FROM generate_series(1,2) k;
INSERT INTO public.payments(id,invoice_id,amount,currency,exchange_rate,payment_date,rep_cfdi_status,organization_id)
VALUES (fixture_payment(550),fixture_invoice(550),.02,'USD',1,'2026-09-01','stamped',fixture_org(2)),
 (fixture_payment(548),fixture_invoice(548),.5,'USD',1,'2026-09-01','none',fixture_org(2)),
 (fixture_payment(551),fixture_invoice(551),'NaN'::numeric,'USD',1,'2026-09-01','none',fixture_org(2));
INSERT INTO payments(id,invoice_id,amount,currency,exchange_rate,payment_date,rep_cfdi_status,amount_mxn,organization_id)
VALUES (fixture_payment(552),fixture_invoice(552),175,'MXN',0,'2026-09-01','stamped',999,fixture_org(2));
UPDATE payments SET amount_mxn=123 WHERE id=fixture_payment(551);
INSERT INTO public.credit_notes(invoice_id,total,status,cfdi_status,cancellation_status,organization_id)
VALUES
 (fixture_invoice(520),20,'draft','stamped','none',fixture_org(2)),
 (fixture_invoice(521),20,'cancelled','stamped','none',fixture_org(2)),
 (fixture_invoice(522),20,'draft','stamped','accepted',fixture_org(2)),
 (fixture_invoice(523),20,'draft','pending','none',fixture_org(2)),
 (fixture_invoice(524),20,'draft','stamped','pending',fixture_org(2)),
 (fixture_invoice(525),20,'draft','stamped','rejected',fixture_org(2)),
 (fixture_invoice(526),20,'draft','stamped','expired',fixture_org(2)),
 (fixture_invoice(527),100,'draft','stamped','none',fixture_org(2)),
 (fixture_invoice(528),100,'cancelled','stamped','none',fixture_org(2)),
 (fixture_invoice(529),20,'draft','stamped','none',fixture_org(3)),
 (fixture_invoice(542),20,'draft','stamped','none',fixture_org(3));
-- Result table for before/after assertions. Every case runs in a rolled-back subtransaction.
ALTER TABLE public.fixture_attempts ADD COLUMN passed boolean, ADD COLUMN persistence_unchanged boolean;
CREATE FUNCTION public.fixture_fingerprint() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoices i),
 'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.payments p),
 'credit_notes',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.credit_notes c))
$$;
CREATE FUNCTION public.fixture_assert(condition boolean, reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Fixture assertion: %',reason USING ERRCODE='ZX002'; END IF; END;
$$;
CREATE FUNCTION public.guard_expect(p_case text,p_statement text,p_state text DEFAULT '00000',p_message text DEFAULT '',p_check text DEFAULT 'SELECT true',p_observe text DEFAULT 'SELECT ''{}''::jsonb')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_image jsonb; after_image jsonb; observed jsonb; actual text:='00000'; msg text:=''; det text; hnt text; affected bigint; check_ok boolean; ok boolean;
BEGIN
 before_image:=fixture_fingerprint();
 BEGIN
  EXECUTE p_statement;
  GET DIAGNOSTICS affected=ROW_COUNT;
  EXECUTE p_observe INTO observed;
  EXECUTE p_check INTO check_ok;
  PERFORM fixture_assert(check_ok,p_case||' persisted value/row assertion');
  -- Force successful mutations back to the same seed, but retain PL/pgSQL variables.
  RAISE EXCEPTION 'fixture rollback' USING ERRCODE='ZX001';
 EXCEPTION
  WHEN SQLSTATE 'ZX001' THEN NULL;
  WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE,msg=MESSAGE_TEXT,det=PG_EXCEPTION_DETAIL,hnt=PG_EXCEPTION_HINT;
 END;
 after_image:=fixture_fingerprint();
 ok:=actual=p_state AND (p_message='' OR msg~p_message) AND before_image=after_image
     AND (p_state<>'00000' OR affected=1);
 INSERT INTO fixture_attempts(case_id,expected_state,actual_state,message,detail,hint,affected,statement,passed,persistence_unchanged)
 VALUES(p_case,p_state,actual,msg,det,hnt,affected,p_statement,ok,before_image=after_image);
 INSERT INTO fixture_observations VALUES(p_case,coalesce(observed,'{}'::jsonb));
 RAISE NOTICE '% % expected=% actual=% message=%',CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END,p_case,p_state,actual,msg;
END;
$$;
