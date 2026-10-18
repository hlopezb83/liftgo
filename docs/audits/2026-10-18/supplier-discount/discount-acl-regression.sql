\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE n integer;
BEGIN
 IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Test must run as authenticated'; END IF;
 UPDATE public.supplier_bills SET discount=10,total=90,description='Synthetic edit with discount'
 WHERE id='00000000-0000-4000-8000-000000000201';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'admin cannot edit own bill'; END IF;
 RAISE NOTICE 'PASS admin updates discount + total under authenticated';
END $$;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
DECLARE n integer;
BEGIN
 UPDATE public.supplier_bills SET discount=20,total=80 WHERE id='00000000-0000-4000-8000-000000000201';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'administrativo cannot edit own bill'; END IF;
 RAISE NOTICE 'PASS administrativo updates discount + total under authenticated';
END $$;
DO $$
DECLARE actor integer; n integer;
BEGIN
 FOREACH actor IN ARRAY ARRAY[3,4,5,6,7,8,9,10] LOOP
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-'||lpad(actor::text,12,'0'),'role','authenticated')::text,true);
  UPDATE public.supplier_bills SET discount=99 WHERE id='00000000-0000-4000-8000-000000000201';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Unauthorized synthetic actor % updated company A',actor; END IF;
  RAISE NOTICE 'PASS actor % blocked (ventas/auditor/mechanic/dispatcher/customer/inactive/no membership/admin B)',actor;
 END LOOP;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE n integer; blocked boolean := false;
BEGIN
 UPDATE public.supplier_bills SET discount=99 WHERE id='00000000-0000-4000-8000-000000000202';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'admin A edited company B'; END IF;
 RAISE NOTICE 'PASS admin A cannot update company B';
 BEGIN
  UPDATE public.supplier_bills SET approval_status='approved',approved_by=auth.uid(),approved_at=now(),approval_notes='forbidden'
   WHERE id='00000000-0000-4000-8000-000000000201';
 EXCEPTION WHEN insufficient_privilege THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Direct approval unexpectedly allowed'; END IF;
 IF has_table_privilege(current_user,'public.supplier_bills','UPDATE') THEN RAISE EXCEPTION 'Unexpected global UPDATE'; END IF;
 IF has_column_privilege(current_user,'public.supplier_bills','approval_status','UPDATE') THEN RAISE EXCEPTION 'Unexpected approval UPDATE'; END IF;
 IF NOT has_column_privilege(current_user,'public.supplier_bills','discount','UPDATE') THEN RAISE EXCEPTION 'Missing discount ACL'; END IF;
 RAISE NOTICE 'PASS direct approval blocked; column ACL only, no global UPDATE';
END $$;
ROLLBACK;
