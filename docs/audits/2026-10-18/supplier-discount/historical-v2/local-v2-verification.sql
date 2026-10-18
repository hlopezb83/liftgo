\set ON_ERROR_STOP on
SELECT current_database(), inet_server_addr(), inet_server_port(), current_user, version();
SELECT c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
 has_table_privilege('authenticated','public.supplier_bills','UPDATE') AS global_update,
 has_column_privilege('authenticated','public.supplier_bills','discount','UPDATE') AS discount_update,
 has_column_privilege('authenticated','public.supplier_bills','total','UPDATE') AS total_update,
 has_column_privilege('authenticated','public.supplier_bills','approval_status','UPDATE') AS approval_update
FROM pg_class c WHERE c.oid='public.supplier_bills'::regclass;
SELECT policyname,permissive,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename='supplier_bills' ORDER BY policyname;
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.supplier_bills'::regclass ORDER BY conname;
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger
 WHERE tgrelid='public.supplier_bills'::regclass AND NOT tgisinternal ORDER BY tgname;
-- All following rows and amounts are synthetic seeds; test transactions rolled back.
SELECT bill_number,subtotal,discount,total,balance,status,approval_status
 FROM public.supplier_bills ORDER BY bill_number;
SELECT bill_id,sum(amount) AS synthetic_paid FROM public.supplier_payments GROUP BY bill_id ORDER BY bill_id;
