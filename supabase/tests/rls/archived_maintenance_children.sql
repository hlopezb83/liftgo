-- 0145: real replayed tables, policies and triggers; no authorization stubs.
-- The suite owns only synthetic rows in its rollback transaction.
BEGIN;
DO $setup$
DECLARE
  v_a uuid := '14500000-0000-4000-8000-000000000001';
  v_b uuid := '14500000-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES
    (v_a,'Synthetic archive A','archive-0145-a'), (v_b,'Synthetic archive B','archive-0145-b');
  PERFORM set_config('app.organization_id',v_a::text,true);
  INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
    ('14500000-0000-4000-8000-000000000010','archive-admin@example.invalid',now(),now()),
    ('14500000-0000-4000-8000-000000000011','archive-mechanic@example.invalid',now(),now()),
    ('14500000-0000-4000-8000-000000000012','archive-auditor@example.invalid',now(),now());
  INSERT INTO public.user_roles(user_id,role) VALUES
    ('14500000-0000-4000-8000-000000000010','admin'),
    ('14500000-0000-4000-8000-000000000011','mechanic'),
    ('14500000-0000-4000-8000-000000000012','auditor')
    ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type)
    SELECT v_a,id,'internal' FROM auth.users WHERE id IN
      ('14500000-0000-4000-8000-000000000010','14500000-0000-4000-8000-000000000011','14500000-0000-4000-8000-000000000012');
  INSERT INTO public.profiles(user_id,full_name,email,is_active)
    SELECT id,email,email,true FROM auth.users WHERE id IN
      ('14500000-0000-4000-8000-000000000010','14500000-0000-4000-8000-000000000011','14500000-0000-4000-8000-000000000012');
  INSERT INTO public.forklifts(id,name,model,organization_id) VALUES
    ('14500000-0000-4000-8000-000000000020','ARCHIVE-A','Synthetic',v_a);
  INSERT INTO public.mechanics(id,name,organization_id) VALUES
    ('14500000-0000-4000-8000-000000000030','Synthetic mechanic',v_a);
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,unit_cost,organization_id) VALUES
    ('14500000-0000-4000-8000-000000000040','Synthetic part','ARCHIVE-145-1',10,100,v_a),
    ('14500000-0000-4000-8000-000000000041','Synthetic spare','ARCHIVE-145-2',10,100,v_a);
  INSERT INTO public.maintenance_logs(id,forklift_id,service_type,work_status,organization_id) VALUES
    ('14500000-0000-4000-8000-000000000050','14500000-0000-4000-8000-000000000020','Archived pending','pending',v_a),
    ('14500000-0000-4000-8000-000000000051','14500000-0000-4000-8000-000000000020','Open','in_progress',v_a),
    ('14500000-0000-4000-8000-000000000052','14500000-0000-4000-8000-000000000020','Completed','completed',v_a),
    ('14500000-0000-4000-8000-000000000053','14500000-0000-4000-8000-000000000020','Cancelled','cancelled',v_a);
  INSERT INTO public.maintenance_parts(id,maintenance_log_id,part_id,quantity_used,cost_at_time) VALUES
    ('14500000-0000-4000-8000-000000000060','14500000-0000-4000-8000-000000000050','14500000-0000-4000-8000-000000000040',1,100),
    ('14500000-0000-4000-8000-000000000061','14500000-0000-4000-8000-000000000051','14500000-0000-4000-8000-000000000041',1,100);
  INSERT INTO public.maintenance_labor(id,maintenance_log_id,mechanic_id,hours,hourly_rate) VALUES
    ('14500000-0000-4000-8000-000000000070','14500000-0000-4000-8000-000000000050','14500000-0000-4000-8000-000000000030',2,50),
    ('14500000-0000-4000-8000-000000000071','14500000-0000-4000-8000-000000000051','14500000-0000-4000-8000-000000000030',1,50);
  PERFORM set_config('app.organization_id',v_b::text,true);
  INSERT INTO public.forklifts(id,name,model,organization_id) VALUES
    ('14500000-0000-4000-8000-000000000021','ARCHIVE-B','Synthetic',v_b);
  INSERT INTO public.maintenance_logs(id,forklift_id,service_type,organization_id) VALUES
    ('14500000-0000-4000-8000-000000000054','14500000-0000-4000-8000-000000000021','Other organization',v_b);
END $setup$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"14500000-0000-4000-8000-000000000010","role":"authenticated"}';
SELECT public.soft_delete_maintenance_log('14500000-0000-4000-8000-000000000050');

-- An authorized mechanic still holding the old UI may issue any child write.
SET LOCAL request.jwt.claims='{"sub":"14500000-0000-4000-8000-000000000011","role":"authenticated"}';
DO $archived$
DECLARE v_sql text;
BEGIN
  IF NOT public.operations_actor_allowed('Mantenimiento','full') THEN
    RAISE EXCEPTION 'Fixture mechanic must retain real maintenance write permission';
  END IF;
  FOR v_sql IN SELECT statement FROM (VALUES
    ($$INSERT INTO public.maintenance_parts(maintenance_log_id,part_id,quantity_used,cost_at_time) VALUES('14500000-0000-4000-8000-000000000050','14500000-0000-4000-8000-000000000041',1,100)$$),
    ($$UPDATE public.maintenance_parts SET quantity_used=2 WHERE id='14500000-0000-4000-8000-000000000060'$$),
    ($$DELETE FROM public.maintenance_parts WHERE id='14500000-0000-4000-8000-000000000060'$$),
    ($$INSERT INTO public.maintenance_labor(maintenance_log_id,mechanic_id,hours,hourly_rate) VALUES('14500000-0000-4000-8000-000000000050','14500000-0000-4000-8000-000000000030',1,50)$$),
    ($$UPDATE public.maintenance_labor SET hours=3 WHERE id='14500000-0000-4000-8000-000000000070'$$),
    ($$DELETE FROM public.maintenance_labor WHERE id='14500000-0000-4000-8000-000000000070'$$),
    ($$UPDATE public.maintenance_parts SET maintenance_log_id='14500000-0000-4000-8000-000000000051' WHERE id='14500000-0000-4000-8000-000000000060'$$),
    ($$UPDATE public.maintenance_parts SET maintenance_log_id='14500000-0000-4000-8000-000000000050' WHERE id='14500000-0000-4000-8000-000000000061'$$),
    ($$UPDATE public.maintenance_labor SET maintenance_log_id='14500000-0000-4000-8000-000000000051' WHERE id='14500000-0000-4000-8000-000000000070'$$),
    ($$UPDATE public.maintenance_labor SET maintenance_log_id='14500000-0000-4000-8000-000000000050' WHERE id='14500000-0000-4000-8000-000000000071'$$)
  ) AS cases(statement) LOOP
    BEGIN EXECUTE v_sql; RAISE EXCEPTION 'Archived child mutation was accepted: %',v_sql;
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%archivada%' THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT cost FROM public.maintenance_logs WHERE id='14500000-0000-4000-8000-000000000050') <> 200
     OR (SELECT SUM(stock_quantity) FROM public.parts_inventory WHERE id IN ('14500000-0000-4000-8000-000000000040','14500000-0000-4000-8000-000000000041')) <> 18
     OR (SELECT count(*) FROM public.maintenance_parts WHERE maintenance_log_id='14500000-0000-4000-8000-000000000050') <> 1
     OR (SELECT count(*) FROM public.maintenance_labor WHERE maintenance_log_id='14500000-0000-4000-8000-000000000050') <> 1 THEN
    RAISE EXCEPTION 'Rejected writes changed preserved consumption, costs or stock';
  END IF;
  FOR v_sql IN SELECT statement FROM (VALUES
    ($$INSERT INTO public.maintenance_parts(maintenance_log_id,part_id,quantity_used) VALUES('14500000-0000-4000-8000-000000000052','14500000-0000-4000-8000-000000000041',1)$$),
    ($$INSERT INTO public.maintenance_labor(maintenance_log_id,mechanic_id,hours,hourly_rate) VALUES('14500000-0000-4000-8000-000000000053','14500000-0000-4000-8000-000000000030',1,50)$$)
  ) AS cases(statement) LOOP
    BEGIN EXECUTE v_sql; RAISE EXCEPTION 'Closed child mutation was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  BEGIN
    INSERT INTO public.maintenance_parts(maintenance_log_id,part_id,quantity_used)
      VALUES('14500000-0000-4000-8000-000000000054','14500000-0000-4000-8000-000000000041',1);
    RAISE EXCEPTION 'Cross-organization consumption was accepted';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN NULL; END;
END $archived$;

SET LOCAL request.jwt.claims='{"sub":"14500000-0000-4000-8000-000000000010","role":"authenticated"}';
SELECT public.restore_maintenance_log('14500000-0000-4000-8000-000000000050');
SET LOCAL request.jwt.claims='{"sub":"14500000-0000-4000-8000-000000000011","role":"authenticated"}';
UPDATE public.maintenance_parts SET quantity_used=2 WHERE id='14500000-0000-4000-8000-000000000060';
DO $restored$
BEGIN
  IF (SELECT cost FROM public.maintenance_logs WHERE id='14500000-0000-4000-8000-000000000050') <> 300
     OR (SELECT stock_quantity FROM public.parts_inventory WHERE id='14500000-0000-4000-8000-000000000040') <> 8 THEN
    RAISE EXCEPTION 'Restored open order did not resume normal consumption';
  END IF;
END $restored$;
SET LOCAL request.jwt.claims='{"sub":"14500000-0000-4000-8000-000000000012","role":"authenticated"}';
DO $reader$
BEGIN
  BEGIN
    INSERT INTO public.maintenance_parts(maintenance_log_id,part_id,quantity_used)
      VALUES('14500000-0000-4000-8000-000000000050','14500000-0000-4000-8000-000000000041',1);
    RAISE EXCEPTION 'Reader consumed inventory';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $reader$;
ROLLBACK;
