-- Migration 0147 against the real schema/policies. Synthetic data is rolled back.
BEGIN;
DO $setup$
DECLARE v_a uuid := '14700000-0000-4000-8000-000000000001'; v_b uuid := '14700000-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES(v_a,'Picker QA A','picker-0147-a'),(v_b,'Picker QA B','picker-0147-b');
  PERFORM set_config('app.organization_id',v_a::text,true);
  INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
    ('14700000-0000-4000-8000-000000000011','picker.mechanic@example.com',now(),now()),
    ('14700000-0000-4000-8000-000000000012','picker.auditor@example.com',now(),now());
  INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
    (v_a,'14700000-0000-4000-8000-000000000011','internal'),(v_a,'14700000-0000-4000-8000-000000000012','internal');
  INSERT INTO public.user_roles(user_id,role) VALUES
    ('14700000-0000-4000-8000-000000000011','mechanic'),('14700000-0000-4000-8000-000000000012','auditor')
    ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.profiles(user_id,full_name,email,is_active) VALUES
    ('14700000-0000-4000-8000-000000000011','Picker Mechanic','picker.mechanic@example.com',true),
    ('14700000-0000-4000-8000-000000000012','Picker Auditor','picker.auditor@example.com',true)
    ON CONFLICT(user_id) DO UPDATE SET is_active=true;
  INSERT INTO public.role_permissions(role,module,access_level) VALUES
    ('mechanic','Refacciones','none'),('mechanic','Mantenimiento','full'),
    ('auditor','Refacciones','none'),('auditor','Mantenimiento','read')
    ON CONFLICT(role,module) DO UPDATE SET access_level=EXCLUDED.access_level;
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,min_stock_level,unit_cost,organization_id)
    SELECT ('14700000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'Pieza '||lpad(n::text,4,'0'),'PICKER-'||n,10,2,5,v_a FROM generate_series(1,502)n;
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,min_stock_level,unit_cost,organization_id)
    SELECT ('14700000-0000-4000-8000-'||lpad((3000+n)::text,12,'0'))::uuid,'00 agotada '||n,'EMPTY-'||n,0,2,5,v_a FROM generate_series(1,50)n;
  PERFORM set_config('app.organization_id',v_b::text,true);
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,min_stock_level,unit_cost,organization_id)
    VALUES('14700000-0000-4000-8000-000000004001','Pieza ajena','PICKER-502',10,2,5,v_b);
END $setup$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"14700000-0000-4000-8000-000000000011","role":"authenticated"}';
DO $mechanic$
DECLARE v_page jsonb; v_blocked boolean; v_a uuid := '14700000-0000-4000-8000-000000000001';
BEGIN
  IF current_user <> 'authenticated' OR (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Fixture must enforce RLS'; END IF;
  IF NOT public.is_inventory_reader() THEN RAISE EXCEPTION 'Real inventory reader policy rejects mechanic'; END IF;
  IF (SELECT count(*) FROM public.parts_inventory) <> 552 THEN RAISE EXCEPTION 'Real inventory RLS failed tenant isolation'; END IF;
  v_page := public.get_inventory_page(true,false,v_a,NULL,'all',0,25,'[]');
  IF (v_page->>'totalCount')::int <> 502 OR jsonb_array_length(v_page->'items') <> 25 THEN RAISE EXCEPTION 'Count/range includes zero stock'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_page->'items') r WHERE (r->>'stock_quantity')::int <= 0 OR r->>'organization_id' <> v_a::text) THEN RAISE EXCEPTION 'Ineligible inventory row'; END IF;
  v_page := public.get_inventory_page(true,false,v_a,'PICKER-502','all',20,25,'[]');
  IF (v_page->>'totalCount')::int <> 1 OR (v_page->>'pageIndex')::int <> 0 OR v_page->'items'->0->>'sku' <> 'PICKER-502' THEN RAISE EXCEPTION 'Cannot search after first 501'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.get_inventory_page(v_a); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Maintenance mode widened general inventory access'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.get_inventory_page(true,false,'14700000-0000-4000-8000-000000000002',NULL,'all',0,25,'[]'); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Caller selected another tenant'; END IF;
END $mechanic$;

SET LOCAL request.jwt.claims='{"sub":"14700000-0000-4000-8000-000000000012","role":"authenticated"}';
DO $reader$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN PERFORM public.get_inventory_page(true,false,'14700000-0000-4000-8000-000000000001',NULL,'all',0,25,'[]'); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Read-only maintenance user can capture parts'; END IF;
END $reader$;
ROLLBACK;
