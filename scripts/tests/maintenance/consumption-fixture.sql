-- Synthetic business rows only; tables, functions, permissions and RLS must already be migrated.
DO $setup$
DECLARE
  v_a uuid := '14600000-0000-4000-8000-000000000001';
  v_b uuid := '14600000-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES
    (v_a,'Synthetic archive A','consumption-0146-a'), (v_b,'Synthetic archive B','consumption-0146-b');
  PERFORM set_config('app.organization_id',v_a::text,true);
  INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
    ('14600000-0000-4000-8000-000000000010','consumption-admin@example.invalid',now(),now()),
    ('14600000-0000-4000-8000-000000000011','consumption-mechanic@example.invalid',now(),now()),
    ('14600000-0000-4000-8000-000000000012','consumption-auditor@example.invalid',now(),now());
  INSERT INTO public.user_roles(user_id,role) VALUES
    ('14600000-0000-4000-8000-000000000010','admin'),
    ('14600000-0000-4000-8000-000000000011','mechanic'),
    ('14600000-0000-4000-8000-000000000012','auditor')
    ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type)
    SELECT v_a,id,'internal' FROM auth.users WHERE id IN
      ('14600000-0000-4000-8000-000000000010','14600000-0000-4000-8000-000000000011','14600000-0000-4000-8000-000000000012');
  INSERT INTO public.profiles(user_id,full_name,email,is_active)
    SELECT id,email,email,true FROM auth.users WHERE id IN
      ('14600000-0000-4000-8000-000000000010','14600000-0000-4000-8000-000000000011','14600000-0000-4000-8000-000000000012');
  INSERT INTO public.forklifts(id,name,model,organization_id) VALUES
    ('14600000-0000-4000-8000-000000000020','ARCHIVE-A','Synthetic',v_a);
  INSERT INTO public.mechanics(id,name,organization_id) VALUES
    ('14600000-0000-4000-8000-000000000030','Synthetic mechanic',v_a);
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,unit_cost,organization_id) VALUES
    ('14600000-0000-4000-8000-000000000040','Synthetic part','CONSUMPTION-146-1',10,100,v_a),
    ('14600000-0000-4000-8000-000000000041','Synthetic spare','CONSUMPTION-146-2',10,100,v_a);
  INSERT INTO public.maintenance_logs(id,forklift_id,service_type,work_status,organization_id) VALUES
    ('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000020','Archived pending','pending',v_a),
    ('14600000-0000-4000-8000-000000000051','14600000-0000-4000-8000-000000000020','Open','in_progress',v_a),
    ('14600000-0000-4000-8000-000000000052','14600000-0000-4000-8000-000000000020','Completed','completed',v_a),
    ('14600000-0000-4000-8000-000000000053','14600000-0000-4000-8000-000000000020','Cancelled','cancelled',v_a);
  INSERT INTO public.maintenance_parts(id,maintenance_log_id,part_id,quantity_used,cost_at_time) VALUES
    ('14600000-0000-4000-8000-000000000060','14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000040',1,100),
    ('14600000-0000-4000-8000-000000000061','14600000-0000-4000-8000-000000000051','14600000-0000-4000-8000-000000000041',1,100);
  INSERT INTO public.maintenance_labor(id,maintenance_log_id,mechanic_id,hours,hourly_rate) VALUES
    ('14600000-0000-4000-8000-000000000070','14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000030',2,50),
    ('14600000-0000-4000-8000-000000000071','14600000-0000-4000-8000-000000000051','14600000-0000-4000-8000-000000000030',1,50);
  PERFORM set_config('app.organization_id',v_b::text,true);
  INSERT INTO public.forklifts(id,name,model,organization_id) VALUES
    ('14600000-0000-4000-8000-000000000021','ARCHIVE-B','Synthetic',v_b);
  INSERT INTO public.maintenance_logs(id,forklift_id,service_type,organization_id) VALUES
    ('14600000-0000-4000-8000-000000000054','14600000-0000-4000-8000-000000000021','Other organization',v_b);
END $setup$;
