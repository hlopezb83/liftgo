\set ON_ERROR_STOP on
-- Run unchanged before and after the RPC proposal in the LOCAL v3 fixture.
BEGIN;
-- Test-owner snapshot for rows deliberately invisible to company A. Application
-- operations below still execute under SET LOCAL ROLE authenticated/anon.
CREATE TEMP TABLE k1_hidden_before AS SELECT b.id,to_jsonb(b) AS row_data
 FROM public.supplier_bills b WHERE b.id IN ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000207');
CREATE FUNCTION pg_temp.expect_rpc_rejected(label text, patch jsonb, bill uuid,
 expected_code text, expected_constraint text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE before_row jsonb; after_row jsonb; caught boolean:=false; code text; constraint_name text;
BEGIN
 SELECT to_jsonb(b) INTO before_row FROM public.supplier_bills b WHERE b.id=bill;
 BEGIN
  PERFORM public.update_supplier_bill_details(bill,patch);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,constraint_name=CONSTRAINT_NAME;
  IF code IS DISTINCT FROM expected_code THEN
   RAISE EXCEPTION 'Wrong SQLSTATE in %: expected %, got %',label,expected_code,code;
  END IF;
  IF expected_constraint IS NOT NULL AND constraint_name IS DISTINCT FROM expected_constraint THEN
   RAISE EXCEPTION 'Wrong constraint in %: expected %, got %',label,expected_constraint,constraint_name;
  END IF;
  caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'RPC unexpectedly allowed %',label; END IF;
 SELECT to_jsonb(b) INTO after_row FROM public.supplier_bills b WHERE b.id=bill;
 IF after_row IS DISTINCT FROM before_row THEN RAISE EXCEPTION 'Rejected RPC changed persisted row in %',label; END IF;
 RAISE NOTICE 'PASS rejected % SQLSTATE %, persisted visible row unchanged',label,expected_code;
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL app.cxp_rpc='off';
SET LOCAL app.cxp_recalc='off';
SET LOCAL app.audit_revert='off';
DO $$
DECLARE denied boolean:=false; result uuid;
BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Tests require authenticated role'; END IF;
 IF has_column_privilege(current_user,'public.supplier_bills','discount','UPDATE') OR has_table_privilege(current_user,'public.supplier_bills','UPDATE') THEN
  RAISE EXCEPTION 'Raw discount/global UPDATE must remain closed';
 END IF;
 BEGIN UPDATE public.supplier_bills SET discount=1 WHERE id='00000000-0000-4000-8000-000000000201';
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Raw discount update unexpectedly allowed'; END IF;
 RAISE NOTICE 'PASS raw authenticated UPDATE discount remains 42501; no table-level UPDATE';
 result:=public.update_supplier_bill_details('00000000-0000-4000-8000-000000000201','{"discount":10,"total":90}'::jsonb);
 IF result<>'00000000-0000-4000-8000-000000000201'::uuid OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id=result AND discount=10 AND total=90 AND balance=90) THEN
  RAISE EXCEPTION 'Admin RPC did not persist consistent 10/90/90';
 END IF;
 RAISE NOTICE 'PASS admin RPC 0 -> positive persists discount=10 total=90 balance=90';
 PERFORM public.update_supplier_bill_details(result,'{"discount":0,"total":100}'::jsonb);
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id=result AND discount=0 AND total=100 AND balance=100) THEN
  RAISE EXCEPTION 'Admin RPC positive -> zero did not persist';
 END IF;
 RAISE NOTICE 'PASS admin RPC positive -> 0 persists discount=0 total=100 balance=100';
 PERFORM public.update_supplier_bill_details(result,'{
  "supplier_id":"00000000-0000-4000-8000-000000000301","category":"renta","description":"All 18 form fields",
  "issue_date":"2026-10-18","due_date":"2026-11-01","coverage_start":"2026-10-18","coverage_end":"2026-10-31",
  "currency":"MXN","exchange_rate":1,"subtotal":100,"discount":0,"tax_amount":0,"retention_iva":0,"retention_isr":0,"total":100,
  "cfdi_uuid":"SYNTHETIC-CFDI","payment_method_sat":"PPD","cfdi_xml_url":"https://example.invalid/synthetic.xml"
 }'::jsonb);
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id=result AND supplier_id='00000000-0000-4000-8000-000000000301' AND description='All 18 form fields' AND category='renta' AND discount=0 AND total=100 AND balance=100 AND cfdi_uuid='SYNTHETIC-CFDI') THEN
  RAISE EXCEPTION 'Exact form allowlist payload did not persist';
 END IF;
 RAISE NOTICE 'PASS all 18 allowlisted form fields accepted; supplier scoped to company A';
END $$;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
DECLARE before_row jsonb; after_row jsonb;
BEGIN
 PERFORM public.update_supplier_bill_details('00000000-0000-4000-8000-000000000201','{"discount":20,"total":80}'::jsonb);
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=20 AND total=80 AND balance=80) THEN
  RAISE EXCEPTION 'Administrativo positive discount did not persist';
 END IF;
 RAISE NOTICE 'PASS administrativo RPC 0 -> positive persists 20/80/80';
 SELECT to_jsonb(b) INTO before_row FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000201';
 PERFORM public.update_supplier_bill_details('00000000-0000-4000-8000-000000000201','{"description":"Metadata with unchanged discount","discount":20,"total":80}'::jsonb);
 SELECT to_jsonb(b) INTO after_row FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000201';
 IF after_row-'description'-'updated_at' IS DISTINCT FROM before_row-'description'-'updated_at' OR after_row->>'description'<>'Metadata with unchanged discount' THEN
  RAISE EXCEPTION 'Metadata edit changed protected or monetary values';
 END IF;
 RAISE NOTICE 'PASS metadata plus unchanged discount/total preserves every other persisted field';
 PERFORM public.update_supplier_bill_details('00000000-0000-4000-8000-000000000201','{"discount":0,"total":100}'::jsonb);
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=0 AND total=100 AND balance=100) THEN
  RAISE EXCEPTION 'Administrativo positive -> zero did not persist';
 END IF;
 RAISE NOTICE 'PASS administrativo RPC positive -> 0 persists 0/100/100';
END $$;
DO $$
DECLARE actor integer;
BEGIN
 FOREACH actor IN ARRAY ARRAY[3,4,5,6,7,8,9,10,11,12,13] LOOP
  PERFORM set_config('request.jwt.claims',json_build_object('sub','00000000-0000-4000-8000-'||lpad(actor::text,12,'0'),'role','authenticated')::text,true);
  PERFORM pg_temp.expect_rpc_rejected('actor '||actor,'{"discount":10,"total":90}'::jsonb,'00000000-0000-4000-8000-000000000201','42501');
 END LOOP;
END $$;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}';
SELECT pg_temp.expect_rpc_rejected('own suspended company','{"discount":10,"total":90}','00000000-0000-4000-8000-000000000207','42501');
SET LOCAL request.jwt.claims='{}';
SELECT pg_temp.expect_rpc_rejected('missing auth.uid','{"discount":10,"total":90}','00000000-0000-4000-8000-000000000201','42501');
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}';
SELECT pg_temp.expect_rpc_rejected('spoofed service role claim','{"discount":10,"total":90}','00000000-0000-4000-8000-000000000201','42501');
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.expect_rpc_rejected('company A -> B bill','{"discount":10,"total":90}','00000000-0000-4000-8000-000000000202','42501');
SELECT pg_temp.expect_rpc_rejected('missing bill','{"description":"x"}','00000000-0000-4000-8000-999999999999','42501');
SELECT pg_temp.expect_rpc_rejected('cross-company supplier','{"supplier_id":"00000000-0000-4000-8000-000000000302"}','00000000-0000-4000-8000-000000000201','42501');
SELECT pg_temp.expect_rpc_rejected('archived supplier','{"supplier_id":"00000000-0000-4000-8000-000000000303"}','00000000-0000-4000-8000-000000000201','42501');
DO $$
DECLARE key text;
BEGIN
 FOREACH key IN ARRAY ARRAY['approval_status','approved_by','approved_at','approval_notes','status','balance','id','organization_id','bill_number','created_by','created_at','updated_at','rejected_by','rejected_at','unknown_field'] LOOP
  PERFORM pg_temp.expect_rpc_rejected('protected/unknown key '||key,jsonb_build_object(key,'forbidden'),'00000000-0000-4000-8000-000000000201','22023');
 END LOOP;
END $$;
SELECT pg_temp.expect_rpc_rejected('SQL null patch',NULL,'00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('JSON null patch','null','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('array patch','[]','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('scalar patch','"value"','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('empty patch','{}','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('NaN string','{"discount":"NaN","total":100}','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('null amount','{"discount":null,"total":100}','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('object description','{"description":{"unexpected":true}}','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('invalid date','{"issue_date":"invalid"}','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('negative discount','{"discount":-1,"total":101}','00000000-0000-4000-8000-000000000201','23514');
SELECT pg_temp.expect_rpc_rejected('negative before rounding','{"discount":-0.001,"total":100}','00000000-0000-4000-8000-000000000201','23514');
SELECT pg_temp.expect_rpc_rejected('discount above subtotal','{"discount":110,"total":0}','00000000-0000-4000-8000-000000000201','23514');
SELECT pg_temp.expect_rpc_rejected('inconsistent total','{"discount":10,"total":95}','00000000-0000-4000-8000-000000000201','23514');
SELECT pg_temp.expect_rpc_rejected('negative total','{"discount":10,"total":-1}','00000000-0000-4000-8000-000000000201','23514');
SELECT pg_temp.expect_rpc_rejected('retentions above base','{"retention_iva":110,"total":0}','00000000-0000-4000-8000-000000000201','23514');
SELECT pg_temp.expect_rpc_rejected('discount without total','{"discount":10}','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('third decimal amount','{"discount":0.005,"total":99.995}','00000000-0000-4000-8000-000000000201','22023');
SELECT pg_temp.expect_rpc_rejected('USD missing FX','{"currency":"USD","exchange_rate":1,"total":100}','00000000-0000-4000-8000-000000000201','23514');
SELECT pg_temp.expect_rpc_rejected('coverage existing CHECK','{"coverage_start":"2026-11-02","coverage_end":"2026-11-01"}','00000000-0000-4000-8000-000000000201','23514','supplier_bills_coverage_range_chk');
DO $$
DECLARE bill uuid; old_total numeric; before_row jsonb; after_row jsonb;
BEGIN
 FOREACH bill IN ARRAY ARRAY['00000000-0000-4000-8000-000000000203'::uuid,'00000000-0000-4000-8000-000000000204'::uuid,'00000000-0000-4000-8000-000000000205'::uuid,'00000000-0000-4000-8000-000000000206'::uuid,'00000000-0000-4000-8000-000000000208'::uuid] LOOP
  SELECT b.total INTO old_total FROM public.supplier_bills b WHERE b.id=bill;
  PERFORM pg_temp.expect_rpc_rejected('locked discount-only '||bill,'{"discount":10}'::jsonb,bill,'23514');
  PERFORM pg_temp.expect_rpc_rejected('locked changed total '||bill,jsonb_build_object('discount',10,'total',old_total-10),bill,'23514');
  PERFORM pg_temp.expect_rpc_rejected('locked compensated discount '||bill,jsonb_build_object('discount',10,'subtotal',old_total+10,'total',old_total),bill,'23514');
  PERFORM pg_temp.expect_rpc_rejected('locked supplier identity '||bill,'{"supplier_id":"00000000-0000-4000-8000-000000000301"}'::jsonb,bill,'23514');
  PERFORM pg_temp.expect_rpc_rejected('locked CFDI identity '||bill,'{"cfdi_uuid":"different"}'::jsonb,bill,'23514');
  SELECT to_jsonb(b) INTO before_row FROM public.supplier_bills b WHERE b.id=bill;
  PERFORM public.update_supplier_bill_details(bill,jsonb_build_object('description','Allowed metadata on locked bill','discount',0,'total',old_total));
  SELECT to_jsonb(b) INTO after_row FROM public.supplier_bills b WHERE b.id=bill;
  IF after_row-'description'-'updated_at' IS DISTINCT FROM before_row-'description'-'updated_at'
     OR after_row->>'description' IS DISTINCT FROM 'Allowed metadata on locked bill' THEN
   RAISE EXCEPTION 'Metadata edit changed protected values in %',bill;
  END IF;
  RAISE NOTICE 'PASS metadata edit on locked bill % preserves every other persisted field',bill;
 END LOOP;
END $$;
SAVEPOINT poisoned_flags;
SET LOCAL app.cxp_rpc='on';
SET LOCAL app.cxp_recalc='on';
SET LOCAL app.audit_revert='on';
SELECT pg_temp.expect_rpc_rejected('GUC bypass locked paid','{"discount":1,"total":99}','00000000-0000-4000-8000-000000000205','23514');
SELECT pg_temp.expect_rpc_rejected('GUC bypass inconsistent arithmetic','{"discount":1,"total":100}','00000000-0000-4000-8000-000000000201','23514');
DO $$
BEGIN
 PERFORM public.update_supplier_bill_details('00000000-0000-4000-8000-000000000201','{"subtotal":1200,"total":1200,"discount":0}'::jsonb);
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND subtotal=1200 AND total=1200 AND balance=1200 AND approval_status='pending') THEN
  RAISE EXCEPTION 'Caller GUC bypassed real company approval threshold trigger';
 END IF;
 IF current_setting('app.cxp_rpc',true)<>'on' OR current_setting('app.cxp_recalc',true)<>'on' OR current_setting('app.audit_revert',true)<>'on' THEN
  RAISE EXCEPTION 'Function SET did not restore caller settings';
 END IF;
 RAISE NOTICE 'PASS poisoned caller GUCs cannot skip real approval trigger; function restores caller settings';
END $$;
ROLLBACK TO SAVEPOINT poisoned_flags;
DO $$
DECLARE denied boolean:=false;
BEGIN
 IF has_column_privilege('authenticated','public.supplier_bills','discount','UPDATE') THEN RAISE EXCEPTION 'RPC widened discount ACL'; END IF;
 IF has_function_privilege('anon','public.update_supplier_bill_details(uuid,jsonb)','EXECUTE') OR has_function_privilege('service_role','public.update_supplier_bill_details(uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Unexpected anon/service execute privilege';
 END IF;
 IF NOT has_function_privilege('authenticated','public.update_supplier_bill_details(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Missing authenticated execute'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.update_supplier_bill_details(uuid,jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
  RAISE EXCEPTION 'PUBLIC execute was not revoked';
 END IF;
 BEGIN UPDATE public.supplier_bills SET discount=1 WHERE id='00000000-0000-4000-8000-000000000201';
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Raw discount update became allowed'; END IF;
 RAISE NOTICE 'PASS final ACL: authenticated RPC execute only; raw discount remains denied, no PUBLIC/anon/service execute';
END $$;
SET LOCAL ROLE anon;
DO $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.update_supplier_bill_details('00000000-0000-4000-8000-000000000201','{"description":"forbidden"}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Anon RPC execute unexpectedly allowed'; END IF;
 RAISE NOTICE 'PASS anon cannot execute RPC';
END $$;
RESET ROLE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM k1_hidden_before old_row LEFT JOIN public.supplier_bills b ON b.id=old_row.id
  WHERE to_jsonb(b) IS DISTINCT FROM old_row.row_data) THEN
  RAISE EXCEPTION 'A denied RPC changed a row hidden by RLS';
 END IF;
 RAISE NOTICE 'PASS privileged test-owner read verifies company B and suspended-company rows unchanged';
END $$;
ROLLBACK;
