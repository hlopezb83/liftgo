-- Real SQL/RLS contract, synthetic fixtures only; every write rolls back.
-- Run after 0123 against an isolated full-schema local Supabase replay.
BEGIN;

INSERT INTO public.organizations(id,name,slug) VALUES
 ('12310000-0000-4000-8000-00000000000a','Legacy charge test A','legacy-charge-test-a'),
 ('12310000-0000-4000-8000-00000000000b','Legacy charge test B','legacy-charge-test-b');
SELECT set_config('app.organization_id','12310000-0000-4000-8000-00000000000a',true);
INSERT INTO public.customers(id,name,created_by_organization_id) VALUES
 ('12310000-0000-4000-8000-000000000005','Synthetic legacy customer','12310000-0000-4000-8000-00000000000a');
INSERT INTO public.organization_customers(organization_id,customer_id) VALUES
 ('12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000005');
INSERT INTO public.quotes(id,organization_id,customer_id,quote_number,start_date,end_date,currency,line_items,subtotal,tax_rate,tax_amount,total)
VALUES ('12310000-0000-4000-8000-000000000010','12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000005',
 'COT-SYNTHETIC-LEGACY',current_date,current_date+10,'MXN',
 '[{"description":"Synthetic agreed delivery","quantity":3,"unit_price":100,"total":300,"line_kind":"charge","quote_line_id":"12310000-0000-4000-8000-000000000011"}]',300,0,0,300);

-- A genuine pre-0107 marker cannot be inserted by normal application writes.
-- Only this rollback fixture, owned by the isolated test DB superuser, disables
-- the INSERT guard long enough to represent an existing historical document.
ALTER TABLE public.invoices DISABLE TRIGGER zzz_enforce_invoice_quote_charges;
INSERT INTO public.invoices(id,organization_id,customer_id,invoice_number,quote_id,line_items,subtotal,tax_rate,tax_amount,total,status,moneda,quote_charge_tracking_version)
VALUES ('12310000-0000-4000-8000-000000000020','12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000005',
 'FAC-SYNTHETIC-LEGACY','12310000-0000-4000-8000-000000000010',
 '[{"description":"Historical document delivery","quantity":1,"unit_price":100,"total":100},{"description":"Historical manual rent","quantity":1,"unit_price":1000,"total":1000}]',
 1100,0,0,1100,'sent','MXN',NULL);
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.invoices ENABLE TRIGGER zzz_enforce_invoice_quote_charges;
SET CONSTRAINTS ALL DEFERRED;
SELECT set_config('test.legacy_original',(SELECT line_items::text FROM public.invoices WHERE id='12310000-0000-4000-8000-000000000020'),true);

INSERT INTO auth.users(id,email) VALUES
 ('12310000-0000-4000-8000-000000000030','legacy-admin-a@test.local'),
 ('12310000-0000-4000-8000-000000000031','legacy-auditor@test.local'),
 ('12310000-0000-4000-8000-000000000032','legacy-administrativo@test.local'),
 ('12310000-0000-4000-8000-000000000033','legacy-ventas@test.local'),
 ('12310000-0000-4000-8000-000000000034','legacy-portal@test.local'),
 ('12310000-0000-4000-8000-000000000035','legacy-admin-b@test.local');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('12310000-0000-4000-8000-000000000030','admin'),
 ('12310000-0000-4000-8000-000000000031','auditor'),
 ('12310000-0000-4000-8000-000000000032','administrativo'),
 ('12310000-0000-4000-8000-000000000033','ventas'),
 ('12310000-0000-4000-8000-000000000034','customer'),
 ('12310000-0000-4000-8000-000000000035','admin');
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
 ('12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000030','internal'),
 ('12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000031','internal'),
 ('12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000032','internal'),
 ('12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000033','internal'),
 ('12310000-0000-4000-8000-00000000000a','12310000-0000-4000-8000-000000000034','portal'),
 ('12310000-0000-4000-8000-00000000000b','12310000-0000-4000-8000-000000000035','internal');

CREATE FUNCTION pg_temp.qclr_expect_error(p_sql text,p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_code text;
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE; END;
  IF v_code IS DISTINCT FROM p_code THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got % for %',p_code,coalesce(v_code,'success'),p_sql;
  END IF;
END $$;
CREATE FUNCTION pg_temp.qclr_call(p_request uuid,p_class text DEFAULT 'charge',p_index integer DEFAULT 0,
 p_hash text DEFAULT NULL,p_quantity numeric DEFAULT 1,p_reason text DEFAULT 'Verified synthetic document evidence',p_evidence text DEFAULT 'Synthetic evidence reference')
RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.reconcile_quote_charge_history(
  '12310000-0000-4000-8000-000000000010','12310000-0000-4000-8000-000000000020',p_index,
  coalesce(p_hash,current_setting('test.legacy_hash_'||p_index)),p_class,
  CASE WHEN p_class='charge' THEN '12310000-0000-4000-8000-000000000011'::uuid ELSE NULL END,
  CASE WHEN p_class='charge' THEN p_quantity ELSE NULL END,p_reason,p_evidence,p_request);
$$;

SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"12310000-0000-4000-8000-000000000030","role":"authenticated"}';
DO $$ DECLARE v jsonb; v_line jsonb; BEGIN
 v:=public.get_quote_charge_legacy_review('12310000-0000-4000-8000-000000000010');
 IF v->>'complete' IS DISTINCT FROM 'true' OR v->>'can_reconcile' IS DISTINCT FROM 'true'
   OR v#>>'{invoices,0,invoice_number}' IS DISTINCT FROM 'FAC-SYNTHETIC-LEGACY'
   OR jsonb_array_length(v#>'{invoices,0,lines}') IS DISTINCT FROM 2 THEN
   RAISE EXCEPTION 'Admin review evidence is incomplete: %',v;
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v#>'{invoices,0,lines}') LOOP
   IF v_line->>'pending' IS DISTINCT FROM 'true' OR length(v_line->>'line_hash') IS DISTINCT FROM 64 THEN
     RAISE EXCEPTION 'Missing stable original-line evidence: %',v_line;
   END IF;
   PERFORM set_config('test.legacy_hash_'||(v_line->>'line_index'),v_line->>'line_hash',true);
 END LOOP;
END $$;

-- Missing audit evidence, stale snapshots and non-positive/non-finite quantities
-- fail before any review can consume the source.
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000040',p_reason=>' ')$s$,'22023');
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000040',p_evidence=>' ')$s$,'22023');
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000040',p_hash=>repeat('0',64))$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000040',p_quantity=>0)$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000040',p_quantity=>'NaN'::numeric)$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000040',p_quantity=>'Infinity'::numeric)$s$,'23514');
DO $$ DECLARE v jsonb; v_again jsonb; BEGIN
 v:=pg_temp.qclr_call('12310000-0000-4000-8000-000000000040');
 IF v->>'complete' IS DISTINCT FROM 'true' OR v->>'already_existed' IS DISTINCT FROM 'false' OR v->>'review_id' IS NULL THEN
   RAISE EXCEPTION 'Review not persisted: %',v;
 END IF;
 PERFORM set_config('test.legacy_review_id',v->>'review_id',true);
 v_again:=pg_temp.qclr_call('12310000-0000-4000-8000-000000000040');
 IF v_again->>'already_existed' IS DISTINCT FROM 'true' OR v_again->>'review_id' IS DISTINCT FROM v->>'review_id' THEN
   RAISE EXCEPTION 'Request retry is not idempotent: %, %',v,v_again;
 END IF;
 v:=public.get_quote_charge_availability(ARRAY['12310000-0000-4000-8000-000000000010'::uuid]);
 IF v#>>'{quotes,0,legacy_review_required}' IS DISTINCT FROM 'true' OR v#>>'{quotes,0,lines,0,consumed_quantity}' IS DISTINCT FROM '1' THEN
   RAISE EXCEPTION 'Partial review silently cleared another ambiguous line or lost consumption: %',v;
 END IF;
END $$;
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000040',p_quantity=>2)$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000041')$s$,'23514');
SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000042','rental',1);
DO $$ DECLARE v jsonb; BEGIN
 v:=public.get_quote_charge_availability(ARRAY['12310000-0000-4000-8000-000000000010'::uuid]);
 IF v->>'complete' IS DISTINCT FROM 'true' OR v#>>'{quotes,0,legacy_review_required}' IS DISTINCT FROM 'false'
   OR v#>>'{quotes,0,lines,0,remaining_quantity}' IS DISTINCT FROM '2' THEN
   RAISE EXCEPTION 'Completed review or reconciled consumption incorrect: %',v;
 END IF;
 IF (SELECT count(*) FROM public.quote_charge_legacy_reviews WHERE invoice_id='12310000-0000-4000-8000-000000000020')<>2
   OR EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews WHERE invoice_id='12310000-0000-4000-8000-000000000020'
      AND actor_id IS DISTINCT FROM auth.uid()) THEN
   RAISE EXCEPTION 'Review audit actor was not derived from authenticated user';
 END IF;
END $$;

-- Even an admin must use the audited RPC, never direct table DML.
SELECT pg_temp.qclr_expect_error('INSERT INTO public.quote_charge_legacy_reviews DEFAULT VALUES','42501');
SELECT pg_temp.qclr_expect_error('UPDATE public.quote_charge_legacy_reviews SET reason=''tampered''','42501');
SELECT pg_temp.qclr_expect_error('DELETE FROM public.quote_charge_legacy_reviews','42501');
SELECT pg_temp.qclr_expect_error('INSERT INTO public.quote_charge_legacy_reversals DEFAULT VALUES','42501');
SELECT pg_temp.qclr_expect_error('DELETE FROM public.quote_charge_legacy_reversals','42501');

-- Existing invoice-read roles can inspect evidence but cannot reconcile/reverse.
DO $$ DECLARE v_uid uuid; v jsonb; BEGIN
 FOREACH v_uid IN ARRAY ARRAY['12310000-0000-4000-8000-000000000031'::uuid,'12310000-0000-4000-8000-000000000032'::uuid] LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
   v:=public.get_quote_charge_legacy_review('12310000-0000-4000-8000-000000000010');
   IF v->>'complete' IS DISTINCT FROM 'true' OR v->>'can_reconcile' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Read-only role boundary lost: %',v; END IF;
   IF (SELECT count(*) FROM public.quote_charge_legacy_reviews WHERE invoice_id='12310000-0000-4000-8000-000000000020')<>2 THEN
     RAISE EXCEPTION 'Authorized read-only role cannot inspect the audit';
   END IF;
   PERFORM pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000043')$s$,'42501');
   PERFORM pg_temp.qclr_expect_error($s$SELECT public.reverse_quote_charge_history(current_setting('test.legacy_review_id')::uuid,'Synthetic reversal reason','Synthetic evidence','12310000-0000-4000-8000-000000000044')$s$,'42501');
 END LOOP;
END $$;

-- Sales and portal users gain no history side channel; an admin from B gets
-- the same generic denial as a missing quote and sees no A audit rows.
DO $$ DECLARE v_uid uuid; BEGIN
 FOREACH v_uid IN ARRAY ARRAY['12310000-0000-4000-8000-000000000033'::uuid,'12310000-0000-4000-8000-000000000034'::uuid,'12310000-0000-4000-8000-000000000035'::uuid] LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
   PERFORM pg_temp.qclr_expect_error($s$SELECT public.get_quote_charge_legacy_review('12310000-0000-4000-8000-000000000010')$s$,'42501');
   PERFORM pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000045')$s$,'42501');
   PERFORM pg_temp.qclr_expect_error($s$SELECT public.reverse_quote_charge_history(current_setting('test.legacy_review_id')::uuid,'Synthetic reversal reason','Synthetic evidence','12310000-0000-4000-8000-000000000046')$s$,'42501');
   IF EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews WHERE invoice_id='12310000-0000-4000-8000-000000000020') THEN
     RAISE EXCEPTION 'Unauthorized history row visible for actor %, db role %, RLS active %',v_uid,current_user,row_security_active('public.quote_charge_legacy_reviews');
   END IF;
 END LOOP;
END $$;
RESET ROLE;
SET LOCAL role='anon';
SET LOCAL request.jwt.claims='{"role":"anon"}';
SELECT pg_temp.qclr_expect_error($s$SELECT public.get_quote_charge_legacy_review('12310000-0000-4000-8000-000000000010')$s$,'42501');
RESET ROLE;
SET LOCAL role='service_role';
SET LOCAL request.jwt.claims='{"role":"service_role"}';
SELECT pg_temp.qclr_expect_error($s$SELECT pg_temp.qclr_call('12310000-0000-4000-8000-000000000047')$s$,'42501');
SELECT pg_temp.qclr_expect_error('INSERT INTO public.quote_charge_legacy_reviews DEFAULT VALUES','42501');
SELECT pg_temp.qclr_expect_error('DELETE FROM public.quote_charge_legacy_reviews','42501');
RESET ROLE;

-- Superuser assertions prove the audit protects issued source evidence even
-- where application grants would otherwise mask the underlying trigger.
SELECT pg_temp.qclr_expect_error('UPDATE public.quote_charge_legacy_reviews SET reason=''tampered''','23514');
SELECT pg_temp.qclr_expect_error('DELETE FROM public.quote_charge_legacy_reviews','23514');
SELECT pg_temp.qclr_expect_error($s$UPDATE public.invoices SET line_items=jsonb_set(line_items,'{0,description}','"changed"') WHERE id='12310000-0000-4000-8000-000000000020'$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$UPDATE public.invoices SET line_items=jsonb_build_array(line_items->1,line_items->0) WHERE id='12310000-0000-4000-8000-000000000020'$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$UPDATE public.quotes SET line_items='[]',subtotal=0,total=0 WHERE id='12310000-0000-4000-8000-000000000010'$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$UPDATE public.invoices SET quote_id=NULL WHERE id='12310000-0000-4000-8000-000000000020'$s$,'23514');
DO $$ BEGIN
 IF (SELECT quote_charge_tracking_version IS NOT NULL OR line_items::text IS DISTINCT FROM current_setting('test.legacy_original')
     FROM public.invoices WHERE id='12310000-0000-4000-8000-000000000020') THEN
   RAISE EXCEPTION 'Review changed the historical invoice or its tracking marker';
 END IF;
END $$;

SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"12310000-0000-4000-8000-000000000030","role":"authenticated"}';
DO $$ DECLARE v jsonb; v_again jsonb; BEGIN
 v:=public.reverse_quote_charge_history(current_setting('test.legacy_review_id')::uuid,'Synthetic correction of evidence','Synthetic reversal evidence','12310000-0000-4000-8000-000000000048');
 v_again:=public.reverse_quote_charge_history(current_setting('test.legacy_review_id')::uuid,'Synthetic correction of evidence','Synthetic reversal evidence','12310000-0000-4000-8000-000000000048');
 IF v->>'complete' IS DISTINCT FROM 'true' OR v_again->>'already_existed' IS DISTINCT FROM 'true' OR v_again->>'reversal_id' IS DISTINCT FROM v->>'reversal_id' THEN
   RAISE EXCEPTION 'Reversal retry duplicated or lost audit: %, %',v,v_again;
 END IF;
 v:=public.get_quote_charge_availability(ARRAY['12310000-0000-4000-8000-000000000010'::uuid]);
 IF v#>>'{quotes,0,legacy_review_required}' IS DISTINCT FROM 'true' OR v#>>'{quotes,0,lines,0,consumed_quantity}' IS DISTINCT FROM '0' THEN
   RAISE EXCEPTION 'Reversal did not restore pending evidence while removing reviewed consumption: %',v;
 END IF;
 IF (SELECT count(*) FROM public.quote_charge_legacy_reviews WHERE invoice_id='12310000-0000-4000-8000-000000000020')<>2
   OR (SELECT count(*) FROM public.quote_charge_legacy_reversals WHERE review_id=current_setting('test.legacy_review_id')::uuid)<>1 THEN
   RAISE EXCEPTION 'Reversal removed review evidence or created duplicate audit';
 END IF;
END $$;
RESET ROLE;
SELECT pg_temp.qclr_expect_error('UPDATE public.quote_charge_legacy_reversals SET reason=''tampered''','23514');
SELECT pg_temp.qclr_expect_error('DELETE FROM public.quote_charge_legacy_reversals','23514');
SELECT pg_temp.qclr_expect_error($s$UPDATE public.invoices SET line_items='[]',subtotal=0,total=0 WHERE id='12310000-0000-4000-8000-000000000020'$s$,'23514');
SELECT pg_temp.qclr_expect_error($s$DELETE FROM public.invoices WHERE id='12310000-0000-4000-8000-000000000020'$s$,'23514');
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
