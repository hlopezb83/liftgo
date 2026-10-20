-- 0112: mixed SECURITY DEFINER summary must not bypass dispatcher finance RLS.
-- Self-contained synthetic A/B fixtures, real auth role, rolled back in full.
BEGIN;

DO $$
DECLARE
  org_a uuid := '11200000-0000-4000-8000-000000000001';
  org_b uuid := '11200000-0000-4000-8000-000000000002';
  cust uuid := '11200000-0000-4000-8000-000000000003';
  other_cust uuid := '11200000-0000-4000-8000-000000000004';
  actor uuid;
  role_name text;
  n int := 10;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (org_a, 'Summary isolation A', 'summary-0112-a'),
    (org_b, 'Summary isolation B', 'summary-0112-b');
  PERFORM set_config('app.organization_id', org_a::text, true);
  FOREACH role_name IN ARRAY ARRAY['dispatcher','admin','administrativo','auditor','ventas','mechanic'] LOOP
    actor := ('11200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
    INSERT INTO auth.users (id,email,created_at,updated_at)
      VALUES (actor, role_name || '.summary112@test.local',now(),now());
    INSERT INTO public.organization_memberships (organization_id,auth_user_id,member_type)
      VALUES (org_a,actor,'internal');
    INSERT INTO public.user_roles (user_id,role) VALUES (actor,role_name::public.app_role)
      ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role;
    n := n+1;
  END LOOP;
  -- A portal account with a residual dispatcher role remains a portal account.
  INSERT INTO auth.users (id,email,created_at,updated_at)
    VALUES ('11200000-0000-4000-8000-000000000020','portal.summary112@test.local',now(),now());
  INSERT INTO public.user_roles (user_id,role)
    VALUES ('11200000-0000-4000-8000-000000000020','dispatcher')
    ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.organization_memberships (organization_id,auth_user_id,member_type)
    VALUES (org_a,'11200000-0000-4000-8000-000000000020','portal');
  INSERT INTO public.customers (id,name,created_by_organization_id) VALUES
    (cust,'Shared summary customer',org_a),(other_cust,'Other summary customer',org_b);
  INSERT INTO public.organization_customers (organization_id,customer_id)
    VALUES (org_a,cust),(org_b,cust),(org_b,other_cust);
  INSERT INTO public.customer_portal_accounts (organization_id,customer_id,auth_user_id,email)
    VALUES (org_a,cust,'11200000-0000-4000-8000-000000000020','portal.summary112@test.local');
  INSERT INTO public.forklifts (id,name,model,organization_id) VALUES
    ('11200000-0000-4000-8000-000000000031','SUMMARY-A','A',org_a),
    ('11200000-0000-4000-8000-000000000032','SUMMARY-B','B',org_b);
  INSERT INTO public.bookings (id,customer_id,forklift_id,start_date,end_date,booking_number,status,organization_id) VALUES
    ('11200000-0000-4000-8000-000000000041',cust,'11200000-0000-4000-8000-000000000031',current_date-10,current_date-5,'SUMMARY-A','confirmed',org_a);
  INSERT INTO public.invoices (id,invoice_number,customer_id,status,line_items,subtotal,tax_amount,total,organization_id) VALUES
    ('11200000-0000-4000-8000-000000000051','SUMMARY-INV-A',cust,'sent','[{"description":"Rental A","quantity":1,"unit_price":1000,"amount":1000}]',1000,160,1160,org_a);
  PERFORM set_config('app.organization_id',org_b::text,true);
  INSERT INTO public.bookings (id,customer_id,forklift_id,start_date,end_date,booking_number,status,organization_id) VALUES
    ('11200000-0000-4000-8000-000000000042',cust,'11200000-0000-4000-8000-000000000032',current_date-10,current_date-5,'SUMMARY-B','confirmed',org_b);
  INSERT INTO public.invoices (id,invoice_number,customer_id,status,line_items,subtotal,tax_amount,total,organization_id) VALUES
    ('11200000-0000-4000-8000-000000000052','SUMMARY-INV-B',cust,'sent','[{"description":"Rental B","quantity":1,"unit_price":2000,"amount":2000}]',2000,320,2320,org_b);
  PERFORM set_config('app.organization_id','',true);
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11200000-0000-4000-8000-000000000010","role":"authenticated"}';
DO $$
DECLARE result jsonb;
BEGIN
  result := public.get_customer_summary('11200000-0000-4000-8000-000000000003');
  IF result->'invoices' IS DISTINCT FROM '[]'::jsonb
     OR result->'totals' IS DISTINCT FROM '{"total_invoiced":0,"total_paid":0,"total_credited":0,"outstanding_revenue":0,"fx_missing_count":0}'::jsonb THEN
    RAISE EXCEPTION 'Dispatcher received financial summary data: %',result;
  END IF;
  IF jsonb_array_length(result->'bookings') <> 1 OR result #>> '{bookings,0,booking_number}' <> 'SUMMARY-A' THEN
    RAISE EXCEPTION 'Dispatcher operational bookings missing or cross-organization: %',result;
  END IF;
  result := public.get_customer_summary('11200000-0000-4000-8000-000000000004');
  IF result->'bookings' IS DISTINCT FROM '[]'::jsonb OR result->'invoices' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Dispatcher read another organization customer';
  END IF;
END $$;

-- All four financial roles retain the existing scoped payload and totals.
DO $$
DECLARE n int; result jsonb;
BEGIN
  FOR n IN 11..14 LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','11200000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true);
    result := public.get_customer_summary('11200000-0000-4000-8000-000000000003');
    IF jsonb_array_length(result->'invoices') <> 1
       OR result #>> '{invoices,0,invoice_number}' <> 'SUMMARY-INV-A'
       OR (result #>> '{totals,total_invoiced}')::numeric <> 1160 THEN
      RAISE EXCEPTION 'Authorized role % lost scoped financial data: %',n,result;
    END IF;
  END LOOP;
END $$;

SET LOCAL request.jwt.claims TO '{"sub":"11200000-0000-4000-8000-000000000020","role":"authenticated"}';
DO $$
DECLARE result jsonb;
BEGIN
  result := public.get_customer_summary('11200000-0000-4000-8000-000000000003');
  IF jsonb_array_length(result->'invoices') <> 1 OR (result #>> '{totals,total_invoiced}')::numeric <> 1160 THEN
    RAISE EXCEPTION 'Portal with residual dispatcher lost own financial data';
  END IF;
  BEGIN
    PERFORM public.get_customer_summary('11200000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'Portal accessed another customer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SET LOCAL request.jwt.claims TO '{"sub":"11200000-0000-4000-8000-000000000015","role":"authenticated"}';
DO $$ BEGIN
  BEGIN
    PERFORM public.get_customer_summary('11200000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Mechanic gained summary access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;
