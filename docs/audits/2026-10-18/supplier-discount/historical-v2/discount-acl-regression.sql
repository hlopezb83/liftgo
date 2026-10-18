\set ON_ERROR_STOP on
-- Same tests before/after. ONLY run against the disposable local fixture.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL app.cxp_rpc = 'off';
SET LOCAL app.cxp_recalc = 'off';
SET LOCAL app.audit_revert = 'off';
DO $$
DECLARE n integer;
BEGIN
 IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Test must run as authenticated'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=0 AND total=100 AND balance=100) THEN
  RAISE EXCEPTION 'Unexpected initial persisted values';
 END IF;
 UPDATE public.supplier_bills SET discount=10,total=90,description='Synthetic discount edit' WHERE id='00000000-0000-4000-8000-000000000201';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=10 AND total=90 AND balance=90 AND description='Synthetic discount edit') THEN
  RAISE EXCEPTION 'admin update did not persist discount/total/recalculated balance';
 END IF;
 RAISE NOTICE 'PASS admin 0 -> positive: persisted discount=10 total=90 balance=90';
 UPDATE public.supplier_bills SET discount=0,total=100 WHERE id='00000000-0000-4000-8000-000000000201';
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=0 AND total=100 AND balance=100) THEN
  RAISE EXCEPTION 'positive -> zero did not persist';
 END IF;
 RAISE NOTICE 'PASS admin positive -> 0: persisted discount=0 total=100 balance=100';
END $$;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
BEGIN
 UPDATE public.supplier_bills SET discount=20,total=80 WHERE id='00000000-0000-4000-8000-000000000201';
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=20 AND total=80 AND balance=80) THEN
  RAISE EXCEPTION 'administrativo values did not persist';
 END IF;
 RAISE NOTICE 'PASS administrativo persists discount=20 total=80 balance=80';
 UPDATE public.supplier_bills SET discount=20,total=80,description='Description-only edit, discount unchanged' WHERE id='00000000-0000-4000-8000-000000000201';
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=20 AND total=80 AND balance=80 AND description='Description-only edit, discount unchanged') THEN
  RAISE EXCEPTION 'unchanged discount with description edit did not persist';
 END IF;
 RAISE NOTICE 'PASS description edit includes unchanged discount and total; values remain 20/80/80';
END $$;
DO $$
DECLARE actor integer; n integer;
BEGIN
 -- Inactive admin (8) is characterized separately: the captured current
 -- is_admin_or_administrativo helper does NOT check profile.is_active.
 FOREACH actor IN ARRAY ARRAY[3,4,5,6,7,9,10] LOOP
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-'||lpad(actor::text,12,'0'),'role','authenticated')::text,true);
  UPDATE public.supplier_bills SET discount=99 WHERE id='00000000-0000-4000-8000-000000000201';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Unauthorized actor % updated company A',actor; END IF;
  RAISE NOTICE 'PASS actor % blocked (ventas/auditor/mechanic/dispatcher/customer/no membership/admin B)',actor;
 END LOOP;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE n integer; blocked boolean := false; actual_constraint text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=20 AND total=80 AND balance=80) THEN
  RAISE EXCEPTION 'Denied role updates changed stored values';
 END IF;
 RAISE NOTICE 'PASS denied role updates leave stored discount/total/balance unchanged';
 UPDATE public.supplier_bills SET discount=99 WHERE id='00000000-0000-4000-8000-000000000202';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'admin A edited company B'; END IF;
 RAISE NOTICE 'PASS admin A cannot update company B';
 BEGIN
  UPDATE public.supplier_bills SET approval_status='approved',approved_by=auth.uid(),approved_at=now(),approval_notes='forbidden' WHERE id='00000000-0000-4000-8000-000000000201';
 EXCEPTION WHEN insufficient_privilege THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Direct approval unexpectedly allowed'; END IF;
 IF has_table_privilege(current_user,'public.supplier_bills','UPDATE') THEN RAISE EXCEPTION 'Unexpected global UPDATE'; END IF;
 IF has_column_privilege(current_user,'public.supplier_bills','approval_status','UPDATE') THEN RAISE EXCEPTION 'Unexpected approval UPDATE'; END IF;
 IF NOT has_column_privilege(current_user,'public.supplier_bills','discount','UPDATE') THEN RAISE EXCEPTION 'Missing discount ACL'; END IF;
 RAISE NOTICE 'PASS direct approval blocked; column ACL only, no global UPDATE';
 blocked := false;
 BEGIN
  UPDATE public.supplier_bills SET discount=-1 WHERE id='00000000-0000-4000-8000-000000000201';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS actual_constraint = CONSTRAINT_NAME;
  IF actual_constraint <> 'supplier_bills_discount_non_negative_chk' THEN RAISE; END IF;
  blocked := true;
 END;
 IF NOT blocked OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=20 AND total=80 AND balance=80) THEN
  RAISE EXCEPTION 'Real discount CHECK failed or changed stored values';
 END IF;
 RAISE NOTICE 'PASS negative discount rejected by supplier_bills_discount_non_negative_chk; stored values unchanged';
END $$;
DO $$
DECLARE blocked boolean := false; message text;
BEGIN
 BEGIN
  UPDATE public.supplier_bills SET discount=10,total=190 WHERE id='00000000-0000-4000-8000-000000000203';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  IF message NOT LIKE 'No se puede cambiar el monto de una factura ya aprobada.%' THEN RAISE; END IF;
  blocked := true;
 END;
 IF NOT blocked OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000203' AND discount=0 AND total=200 AND balance=200 AND approval_status='approved') THEN
  RAISE EXCEPTION 'Approved-bill guard failed or changed persisted values';
 END IF;
 RAISE NOTICE 'PASS real approval guard rejects discount + changed total; persisted values unchanged';
 UPDATE public.supplier_bills SET discount=0,total=200,description='Approved description edit' WHERE id='00000000-0000-4000-8000-000000000203';
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000203' AND discount=0 AND total=200 AND balance=200 AND approval_status='approved' AND description='Approved description edit') THEN
  RAISE EXCEPTION 'Approved description-only edit with unchanged amount failed';
 END IF;
 RAISE NOTICE 'PASS approved description edit with unchanged discount + total persists';
END $$;
DO $$
DECLARE bill uuid; blocked boolean; message text;
BEGIN
 FOREACH bill IN ARRAY ARRAY['00000000-0000-4000-8000-000000000204'::uuid,'00000000-0000-4000-8000-000000000205'::uuid] LOOP
  blocked := false;
  BEGIN
   UPDATE public.supplier_bills SET discount=10,total=90 WHERE id=bill;
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
   IF message NOT LIKE 'No se puede cambiar el monto, la moneda o el tipo de cambio:%pagos registrados.%' THEN RAISE; END IF;
   blocked := true;
  END;
  IF NOT blocked OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id=bill AND discount=0 AND total=100) THEN
   RAISE EXCEPTION 'Payment amount guard failed for %',bill;
  END IF;
  RAISE NOTICE 'PASS bill % with payments rejects discount + changed total; stored amounts unchanged',bill;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000204' AND balance=80 AND status='partial') OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000205' AND balance=0 AND status='paid') THEN
  RAISE EXCEPTION 'Balances/statuses derived from synthetic payments changed';
 END IF;
 RAISE NOTICE 'PASS real recalc seeded partial total=100 paid=20 balance=80 and paid total=100 paid=100 balance=0; edits preserve them';
 UPDATE public.supplier_bills SET discount=0,total=100,description='Payment bill description edit' WHERE id='00000000-0000-4000-8000-000000000204';
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000204' AND discount=0 AND total=100 AND balance=80 AND description='Payment bill description edit') THEN
  RAISE EXCEPTION 'Description edit with payments changed financial values';
 END IF;
 RAISE NOTICE 'PASS description edit with unchanged discount + total preserves balance with payments';
 blocked := false;
 BEGIN
  UPDATE public.supplier_bills SET status='pending' WHERE id='00000000-0000-4000-8000-000000000205';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  IF message NOT LIKE 'La cuenta tiene pagos registrados por %' THEN RAISE; END IF;
  blocked := true;
 END;
 IF NOT blocked OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000205' AND status='paid' AND balance=0) THEN
  RAISE EXCEPTION 'Real paid-status lock failed';
 END IF;
 RAISE NOTICE 'PASS real paid-status lock prevents leaving paid with payments';
END $$;
-- Characterizations expose limits, NOT claimed protections. Roll them back.
SAVEPOINT characterization;
DO $$
BEGIN
 UPDATE public.supplier_bills SET discount=110,total=0 WHERE id='00000000-0000-4000-8000-000000000201';
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=110 AND subtotal=100 AND total=0 AND balance=0) THEN
  RAISE EXCEPTION 'Discount > subtotal characterization differs; review actual guards';
 END IF;
 RAISE NOTICE 'LIMIT observed: SQL permits discount=110 > subtotal=100 with total=0; frontend validation is separate';
 UPDATE public.supplier_bills SET discount=1 WHERE id IN ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000205');
 IF (SELECT count(*) FROM public.supplier_bills WHERE id IN ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000205') AND discount=1) <> 3 THEN
  RAISE EXCEPTION 'Discount-only characterization differs; review actual guards';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000203' AND total=200 AND balance=200 AND approval_status='approved') OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000204' AND total=100 AND balance=80 AND status='partial') OR NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000205' AND total=100 AND balance=0 AND status='paid') THEN
  RAISE EXCEPTION 'Discount-only characterization changed unrelated totals/statuses';
 END IF;
 RAISE NOTICE 'LIMIT observed: discount-only edits persist on approved/partial/paid bills; guards do not enforce discount arithmetic';
END $$;
ROLLBACK TO SAVEPOINT characterization;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}';
DO $$
BEGIN
 IF public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'Synthetic actor 8 must be inactive'; END IF;
 UPDATE public.supplier_bills SET discount=21,description='Inactive admin characterization' WHERE id='00000000-0000-4000-8000-000000000201';
 IF NOT EXISTS (SELECT 1 FROM public.supplier_bills WHERE id='00000000-0000-4000-8000-000000000201' AND discount=21 AND total=80 AND balance=80 AND description='Inactive admin characterization') THEN
  RAISE EXCEPTION 'Inactive-admin characterization differs; review observed policy helper';
 END IF;
 RAISE NOTICE 'LIMIT observed: inactive profile with admin role and membership can update under captured is_admin_or_administrativo policy';
END $$;
ROLLBACK;
