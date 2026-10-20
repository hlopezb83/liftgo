-- OP02/03/05 against the complete migrated schema, real claims/RLS and guards.
-- The existing SQL gate discovers this file. All fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.op_check(p_ok boolean, p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', p_message; END IF; END $$;
CREATE FUNCTION pg_temp.op_error(p_sql text, p_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_state THEN RETURN; END IF;
    RAISE EXCEPTION 'Unexpected rejection %: % (expected %)', SQLSTATE, SQLERRM, p_state;
  END;
  RAISE EXCEPTION 'Operation unexpectedly succeeded: %', p_sql;
END $$;

INSERT INTO public.organizations(id,name,slug) VALUES
 ('11500000-0000-4000-8000-0000000000a0','OP0115 A','op0115-a'),
 ('11500000-0000-4000-8000-0000000000b0','OP0115 B','op0115-b');
SELECT set_config('app.organization_id','11500000-0000-4000-8000-0000000000a0',true);
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
 ('11500000-0000-4000-8000-0000000000a1','admin.a.op0115@example.test',now(),now()),
 ('11500000-0000-4000-8000-0000000000a2','dispatcher.a.op0115@example.test',now(),now()),
 ('11500000-0000-4000-8000-0000000000b1','admin.b.op0115@example.test',now(),now());
INSERT INTO public.user_roles(user_id,role) VALUES
 ('11500000-0000-4000-8000-0000000000a1','admin'),
 ('11500000-0000-4000-8000-0000000000a2','dispatcher'),
 ('11500000-0000-4000-8000-0000000000b1','admin')
 ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
 ('11500000-0000-4000-8000-0000000000a0','11500000-0000-4000-8000-0000000000a1','internal'),
 ('11500000-0000-4000-8000-0000000000a0','11500000-0000-4000-8000-0000000000a2','internal'),
 ('11500000-0000-4000-8000-0000000000b0','11500000-0000-4000-8000-0000000000b1','internal');
DO $$ DECLARE v record; BEGIN
 FOR v IN SELECT u.id,u.email,m.organization_id FROM auth.users u
 JOIN public.organization_memberships m ON m.auth_user_id=u.id
 WHERE u.id IN ('11500000-0000-4000-8000-0000000000a1','11500000-0000-4000-8000-0000000000a2','11500000-0000-4000-8000-0000000000b1') LOOP
  PERFORM set_config('app.organization_id',v.organization_id::text,true);
  INSERT INTO public.profiles(user_id,full_name,email,is_active) VALUES(v.id,v.email,v.email,true)
    ON CONFLICT(user_id) DO UPDATE SET is_active=true;
 END LOOP;
 PERFORM set_config('app.organization_id','11500000-0000-4000-8000-0000000000a0',true);
END $$;

INSERT INTO public.forklifts(id,name,model,organization_id) VALUES
 ('11500000-0000-4000-8000-000000000101','OP0115-HISTORY','QA','11500000-0000-4000-8000-0000000000a0');
INSERT INTO public.bookings(id,forklift_id,start_date,end_date,status,organization_id) VALUES
 ('11500000-0000-4000-8000-000000000201','11500000-0000-4000-8000-000000000101',
  (date_trunc('month',public.today_mty())-interval '1 month')::date,
  date_trunc('month',public.today_mty())::date-1,'confirmed','11500000-0000-4000-8000-0000000000a0');
INSERT INTO public.contracts(id,booking_id,contract_number,max_hours_per_month,extra_hour_rate,organization_id) VALUES
 ('11500000-0000-4000-8000-000000000401','11500000-0000-4000-8000-000000000201','QA-OP0115-CTR',200,10,'11500000-0000-4000-8000-0000000000a0');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"11500000-0000-4000-8000-0000000000a1","role":"authenticated"}';
INSERT INTO public.deliveries(id,booking_id,forklift_id,type,status,scheduled_date,scheduled_time,driver_name,completed_at)
 SELECT '11500000-0000-4000-8000-000000000301',id,forklift_id,'delivery','completed',start_date,'10:30','QA operator',now()+interval '1 year'
 FROM public.bookings WHERE id='11500000-0000-4000-8000-000000000201';
SELECT pg_temp.op_check((SELECT (completed_at AT TIME ZONE 'America/Monterrey')::date=scheduled_date
 AND (completed_at AT TIME ZONE 'America/Monterrey')::time='10:30'::time AND completed_at<created_at
 FROM public.deliveries WHERE id='11500000-0000-4000-8000-000000000301'), 'OP02 actual history must not become today/browser timestamp');
DO $$ DECLARE v_id uuid; BEGIN
 SELECT public.complete_return_inspection(id,forklift_id,p_hours_used=>260,p_fuel_level=>'Full',
 p_inspected_at=>(end_date+time '12:00') AT TIME ZONE 'America/Monterrey') INTO v_id
 FROM public.bookings WHERE id='11500000-0000-4000-8000-000000000201';
 PERFORM set_config('test.op0115.inspection',v_id::text,true);
END $$;
SELECT pg_temp.op_check((SELECT hours_used=260 AND extra_hours=60 AND suggested_extra_hour_charge=600
 FROM public.return_inspections WHERE id=current_setting('test.op0115.inspection')::uuid), 'OP05 initial 260/60/600 failed');
SELECT public.correct_return_inspection(current_setting('test.op0115.inspection')::uuid,'QA correct down',p_hours_used=>100);
SELECT pg_temp.op_check((SELECT hours_used=100 AND extra_hours IS NULL AND suggested_extra_hour_charge IS NULL
 FROM public.return_inspections WHERE id=current_setting('test.op0115.inspection')::uuid), 'OP05 correction did not clear derived charge');
UPDATE public.contracts SET extra_hour_rate=99,max_hours_per_month=50 WHERE id='11500000-0000-4000-8000-000000000401';
SELECT public.correct_return_inspection(current_setting('test.op0115.inspection')::uuid,'QA correct up after contract changed',p_hours_used=>300);
SELECT pg_temp.op_check((SELECT hours_used=300 AND extra_hours=100 AND suggested_extra_hour_charge=1000
 FROM public.return_inspections WHERE id=current_setting('test.op0115.inspection')::uuid), 'OP05 correction repriced the original terms');
SELECT pg_temp.op_error('SELECT * FROM public.return_inspection_usage_bases','42501');
SELECT pg_temp.op_check(NOT has_function_privilege('authenticated','public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)','EXECUTE'), 'OP05 pricing helper exposed as RPC');

-- Real supported damage workflow, including an open-repair blocker.
INSERT INTO public.damage_records(id,inspection_id,booking_id,forklift_id,description,estimated_cost)
 VALUES('11500000-0000-4000-8000-000000000501',current_setting('test.op0115.inspection')::uuid,
 '11500000-0000-4000-8000-000000000201','11500000-0000-4000-8000-000000000101','QA recorded damage',10);
SELECT pg_temp.op_error(format('SELECT public.void_return_inspection(%L,''QA open damage'')',current_setting('test.op0115.inspection')),'P0001');
SELECT set_config('test.op0115.repair',public.start_repair_work_order('11500000-0000-4000-8000-000000000501')::text,true);
UPDATE public.damage_records SET status='repaired' WHERE id='11500000-0000-4000-8000-000000000501';
SELECT pg_temp.op_error(format('SELECT public.void_return_inspection(%L,''QA unfinished repair'')',current_setting('test.op0115.inspection')),'P0001');
UPDATE public.maintenance_logs SET work_status='completed' WHERE id=current_setting('test.op0115.repair')::uuid;
SELECT public.soft_delete_damage_record('11500000-0000-4000-8000-000000000501');

SET LOCAL request.jwt.claims='{"sub":"11500000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT pg_temp.op_error(format('SELECT public.void_return_inspection(%L,''QA non admin'')',current_setting('test.op0115.inspection')),'42501');
SELECT pg_temp.op_error(format('SELECT public.correct_return_inspection(%L,''QA non admin'',p_hours_used=>1)',current_setting('test.op0115.inspection')),'42501');
SELECT pg_temp.op_error('SELECT * FROM public.return_inspection_usage_bases','42501');
SET LOCAL request.jwt.claims='{"sub":"11500000-0000-4000-8000-0000000000b1","role":"authenticated"}';
SELECT pg_temp.op_error(format('SELECT public.void_return_inspection(%L,''QA foreign org'')',current_setting('test.op0115.inspection')),'P0002');
SELECT pg_temp.op_error(format('SELECT public.correct_return_inspection(%L,''QA foreign org'',p_hours_used=>1)',current_setting('test.op0115.inspection')),'P0002');

SET LOCAL request.jwt.claims='{"sub":"11500000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT public.void_return_inspection(current_setting('test.op0115.inspection')::uuid,'QA mistaken historical return');
SELECT pg_temp.op_check(NOT EXISTS(SELECT 1 FROM public.return_inspections WHERE id=current_setting('test.op0115.inspection')::uuid), 'OP03 inspection not annulled');
SELECT pg_temp.op_check((SELECT inspection_id IS NULL AND deleted_at IS NOT NULL
 AND maintenance_log_id=current_setting('test.op0115.repair')::uuid
 FROM public.damage_records WHERE id='11500000-0000-4000-8000-000000000501'), 'OP03 must retain archived damage and repair history');
SELECT pg_temp.op_check((SELECT status='confirmed' AND return_status IS NULL FROM public.bookings WHERE id='11500000-0000-4000-8000-000000000201'), 'OP03 booking not reopened');
SELECT pg_temp.op_check((SELECT status='rented' FROM public.forklifts WHERE id='11500000-0000-4000-8000-000000000101'), 'OP03 physical custody not reopened');
SELECT pg_temp.op_check(EXISTS(SELECT 1 FROM public.audit_logs WHERE table_name='damage_records'
 AND record_id='11500000-0000-4000-8000-000000000501' AND action='ADMIN_CORRECTION'
 AND new_data->>'voided_inspection_id'=current_setting('test.op0115.inspection')), 'OP03 detachment provenance missing');
SELECT pg_temp.op_check(EXISTS(SELECT 1 FROM public.audit_logs WHERE table_name='return_inspections'
 AND record_id=current_setting('test.op0115.inspection')::uuid AND action='ADMIN_VOID'
 AND old_data->'usage_charge_basis'->>'extra_hour_rate'='10'), 'OP03 pricing snapshot audit lost');

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims='{"role":"anon"}';
SELECT pg_temp.op_error(format('SELECT public.void_return_inspection(%L,''QA anon'')',current_setting('test.op0115.inspection')),'42501');
SELECT pg_temp.op_error('SELECT * FROM public.return_inspection_usage_bases','42501');
RESET ROLE;
SELECT pg_temp.op_check(NOT EXISTS(SELECT 1 FROM public.return_inspection_usage_bases
 WHERE inspection_id=current_setting('test.op0115.inspection')::uuid), 'OP03 orphan snapshot after annulment');
ROLLBACK;
