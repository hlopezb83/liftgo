\set ON_ERROR_STOP on
SELECT current_database(),inet_server_addr(),inet_server_port(),current_user,version();
SELECT c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
 has_table_privilege('authenticated','public.supplier_bills','UPDATE') AS global_update,
 has_column_privilege('authenticated','public.supplier_bills','discount','UPDATE') AS discount_update,
 has_column_privilege('authenticated','public.supplier_bills','total','UPDATE') AS preexisting_total_update,
 has_column_privilege('authenticated','public.supplier_bills','approval_status','UPDATE') AS approval_update
 FROM pg_class c WHERE c.oid='public.supplier_bills'::regclass;
SELECT p.proname,p.prosecdef,pg_get_userbyid(p.proowner) AS owner,p.proconfig,p.proacl,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
 md5(pg_get_functiondef(p.oid)) AS local_function_definition_md5
 FROM pg_proc p WHERE p.oid='public.update_supplier_bill_details(uuid,jsonb)'::regprocedure;
SELECT policyname,permissive,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename='supplier_bills' ORDER BY policyname;
SELECT pg_get_functiondef('public.current_internal_organization_id()'::regprocedure);
SELECT bill_number,subtotal,discount,total,balance,status,approval_status
 FROM public.supplier_bills ORDER BY bill_number;
SELECT bill_id,sum(amount) AS synthetic_paid FROM public.supplier_payments GROUP BY bill_id ORDER BY bill_id;
