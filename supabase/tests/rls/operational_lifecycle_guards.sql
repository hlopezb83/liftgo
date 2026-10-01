-- O-01 / D-01..03: real claims/RLS, operational transitions and A/B isolation.
BEGIN;

CREATE FUNCTION pg_temp.check_true(p_ok boolean, p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', p_message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(p_sql text, p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* p_pattern THEN RETURN; END IF;
    RAISE EXCEPTION 'Unexpected rejection: % (expected %)', SQLERRM, p_pattern;
  END;
  RAISE EXCEPTION 'Operation unexpectedly succeeded: %', p_sql;
END $$;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('81000000-0000-4000-8000-000000000001', 'Operations A', 'operations-a'),
  ('81000000-0000-4000-8000-000000000002', 'Operations B', 'operations-b');
SELECT set_config('app.organization_id', '81000000-0000-4000-8000-000000000001', true);

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('81000000-0000-4000-8000-000000000011', 'dispatcher.ops@example.com', now(), now()),
  ('81000000-0000-4000-8000-000000000012', 'ventas.ops@example.com', now(), now()),
  ('81000000-0000-4000-8000-000000000013', 'admin.ops@example.com', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('81000000-0000-4000-8000-000000000011', 'dispatcher'),
  ('81000000-0000-4000-8000-000000000012', 'ventas'),
  ('81000000-0000-4000-8000-000000000013', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
SELECT '81000000-0000-4000-8000-000000000001'::uuid, id, 'internal'
FROM auth.users WHERE id IN ('81000000-0000-4000-8000-000000000011',
  '81000000-0000-4000-8000-000000000012', '81000000-0000-4000-8000-000000000013')
ON CONFLICT (auth_user_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, member_type = 'internal';

INSERT INTO public.forklifts (id, name, model, organization_id) VALUES
  ('81000000-0000-4000-8000-000000000101', 'Maintenance window', 'FD50', '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000102', 'Current delivery', 'FD50', '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000103', 'Future delivery', 'FD50', '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000104', 'Historic early delivery', 'FD50', '81000000-0000-4000-8000-000000000001');
INSERT INTO public.bookings (id, forklift_id, start_date, end_date, organization_id) VALUES
  ('81000000-0000-4000-8000-000000000201', '81000000-0000-4000-8000-000000000101', public.today_mty(), public.today_mty()+2, '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000202', '81000000-0000-4000-8000-000000000102', public.today_mty(), public.today_mty()+3, '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000203', '81000000-0000-4000-8000-000000000103', public.today_mty()+12, public.today_mty()+14, '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000204', '81000000-0000-4000-8000-000000000104', public.today_mty(), public.today_mty()+3, '81000000-0000-4000-8000-000000000001');
INSERT INTO public.maintenance_logs (id, forklift_id, service_type, work_status, performed_at, next_service_date, organization_id)
VALUES ('81000000-0000-4000-8000-000000000401', '81000000-0000-4000-8000-000000000101',
  'preventivo', 'completed', public.today_mty(), public.today_mty()+10, '81000000-0000-4000-8000-000000000001');
INSERT INTO public.deliveries (id, booking_id, forklift_id, type, scheduled_date, organization_id) VALUES
  ('81000000-0000-4000-8000-000000000301', '81000000-0000-4000-8000-000000000202', '81000000-0000-4000-8000-000000000102', 'delivery', public.today_mty(), '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000302', '81000000-0000-4000-8000-000000000202', '81000000-0000-4000-8000-000000000102', 'pickup', public.today_mty(), '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000303', '81000000-0000-4000-8000-000000000203', '81000000-0000-4000-8000-000000000103', 'delivery', public.today_mty()+12, '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000304', '81000000-0000-4000-8000-000000000204', '81000000-0000-4000-8000-000000000104', 'delivery', public.today_mty(), '81000000-0000-4000-8000-000000000001');

SELECT set_config('app.organization_id', '81000000-0000-4000-8000-000000000002', true);
INSERT INTO public.forklifts (id, name, model, organization_id) VALUES
  ('81000000-0000-4000-8000-000000000105', 'Foreign delivery', 'FD50', '81000000-0000-4000-8000-000000000002');
INSERT INTO public.bookings (id, forklift_id, start_date, end_date, organization_id) VALUES
  ('81000000-0000-4000-8000-000000000205', '81000000-0000-4000-8000-000000000105', public.today_mty(), public.today_mty()+3, '81000000-0000-4000-8000-000000000002');
INSERT INTO public.deliveries (id, booking_id, forklift_id, type, scheduled_date, organization_id) VALUES
  ('81000000-0000-4000-8000-000000000305', '81000000-0000-4000-8000-000000000205', '81000000-0000-4000-8000-000000000105', 'delivery', public.today_mty(), '81000000-0000-4000-8000-000000000002');

-- The lifecycle test supplies the same evidence required by the live guard.
UPDATE public.deliveries SET driver_name = 'Operador de logística'
WHERE id IN ('81000000-0000-4000-8000-000000000301', '81000000-0000-4000-8000-000000000302',
  '81000000-0000-4000-8000-000000000303', '81000000-0000-4000-8000-000000000304',
  '81000000-0000-4000-8000-000000000305');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-000000000011","role":"authenticated"}';
SELECT pg_temp.check_true((SELECT count(*) = 0 FROM public.maintenance_logs WHERE id='81000000-0000-4000-8000-000000000401'), 'Dispatcher must not see OT details');
SELECT pg_temp.check_true(NOT EXISTS (
  SELECT 1 FROM public.get_available_forklifts(public.today_mty()+7, public.today_mty()+8)
  WHERE id='81000000-0000-4000-8000-000000000101'), 'Hidden OT must still block availability');
SELECT pg_temp.expect_error($q$SELECT public.extend_booking('81000000-0000-4000-8000-000000000201', public.today_mty()+7)$q$, 'mantenimiento');
SELECT pg_temp.check_true((SELECT end_date=public.today_mty()+2 FROM public.bookings WHERE id='81000000-0000-4000-8000-000000000201'), 'Rejected extension changed booking');
SELECT pg_temp.check_true(NOT EXISTS (SELECT 1 FROM public.booking_extensions WHERE booking_id='81000000-0000-4000-8000-000000000201'), 'Rejected extension created extension');
SELECT public.extend_booking('81000000-0000-4000-8000-000000000201', public.today_mty()+6);

SELECT pg_temp.expect_error($q$SELECT public.complete_delivery('81000000-0000-4000-8000-000000000302', NULL, 101)$q$, 'sin entrega completada');
SELECT pg_temp.expect_error($q$SELECT public.complete_delivery('81000000-0000-4000-8000-000000000303', NULL, 100)$q$, 'futura');
SELECT pg_temp.expect_error($q$UPDATE public.deliveries SET status='completed' WHERE id='81000000-0000-4000-8000-000000000303'$q$, 'futura');
SELECT pg_temp.expect_error($q$SELECT public.complete_delivery('81000000-0000-4000-8000-000000000305', NULL, 100)$q$, 'no encontrada');
SELECT pg_temp.expect_error($q$SELECT public.forklift_has_maintenance_block('81000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000105', public.today_mty(), public.today_mty()+1)$q$, 'No autorizado');

SELECT public.complete_delivery('81000000-0000-4000-8000-000000000301', NULL, 100);
SELECT pg_temp.check_true((SELECT status='rented' FROM public.forklifts WHERE id='81000000-0000-4000-8000-000000000102'), 'Dispatcher completion must rent the unit');
SELECT public.complete_delivery('81000000-0000-4000-8000-000000000302', NULL, 101);
SELECT pg_temp.expect_error($q$SELECT public.complete_delivery('81000000-0000-4000-8000-000000000302', NULL, 102)$q$, 'ya est');
DO $$ DECLARE v_rows integer; BEGIN
  UPDATE public.forklifts SET name='Unauthorized edit' WHERE id='81000000-0000-4000-8000-000000000102';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  PERFORM pg_temp.check_true(v_rows=0, 'Completing transport must not grant fleet edit');
END $$;

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-000000000012","role":"authenticated"}';
SELECT pg_temp.check_true(NOT EXISTS (
  SELECT 1 FROM public.get_available_forklifts(public.today_mty()+7, public.today_mty()+8)
  WHERE id='81000000-0000-4000-8000-000000000101'), 'Sales availability must see the same hidden block');
SELECT pg_temp.expect_error($q$SELECT public.complete_delivery('81000000-0000-4000-8000-000000000304', NULL, 50)$q$, 'No autorizado');

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-000000000013","role":"authenticated"}';
SELECT pg_temp.expect_error($q$SELECT public.create_booking('81000000-0000-4000-8000-000000000101', NULL, 'Maintenance blocked', NULL, public.today_mty()+7, public.today_mty()+8)$q$, 'mantenimiento');
SELECT public.complete_delivery('81000000-0000-4000-8000-000000000304', NULL, 50);
-- Represents already-delivered historical rows after a commercial reschedule;
-- no guard is disabled and the existing completion timestamp remains intact.
UPDATE public.bookings SET start_date=public.today_mty()+12, end_date=public.today_mty()+14
WHERE id='81000000-0000-4000-8000-000000000204';
INSERT INTO public.deliveries (id, booking_id, forklift_id, type, scheduled_date)
VALUES ('81000000-0000-4000-8000-000000000306', '81000000-0000-4000-8000-000000000204',
  '81000000-0000-4000-8000-000000000104', 'pickup', public.today_mty()+14);
SELECT pg_temp.expect_error($q$SELECT public.complete_return_inspection('81000000-0000-4000-8000-000000000204', '81000000-0000-4000-8000-000000000104', p_fuel_level=>'Full', p_inspected_at=>now()-interval '1 day')$q$, 'anterior a la entrega real');
SELECT public.complete_return_inspection('81000000-0000-4000-8000-000000000204', '81000000-0000-4000-8000-000000000104', p_fuel_level=>'Full', p_inspected_at=>now());
SELECT pg_temp.check_true((SELECT status='completed' FROM public.bookings WHERE id='81000000-0000-4000-8000-000000000204'), 'Historical early delivery must be returnable');
SELECT pg_temp.check_true((SELECT status='available' FROM public.forklifts WHERE id='81000000-0000-4000-8000-000000000104'), 'Historical return must release unit');
SELECT pg_temp.check_true((SELECT status='scheduled' AND scheduled_date=public.today_mty()+14
  FROM public.deliveries WHERE id='81000000-0000-4000-8000-000000000306'), 'Inspection must not fabricate completion of future pickup');

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims='{"role":"anon"}';
SELECT pg_temp.expect_error($q$SELECT public.forklift_has_maintenance_block('81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000101', public.today_mty(), public.today_mty()+1)$q$, 'permission denied');
SELECT pg_temp.expect_error($q$SELECT public.complete_delivery('81000000-0000-4000-8000-000000000301')$q$, 'permission denied');
ROLLBACK;
