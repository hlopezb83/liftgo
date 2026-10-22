-- Existing SQL gate runs this against the complete migrated Supabase schema.
-- Fixtures and all lifecycle actions roll back. No fiscal provider is called.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.rec122_check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '0122: %', label; END IF;
  RAISE NOTICE 'PASS 0122: %', label;
END $$;
CREATE FUNCTION pg_temp.rec122_error(statement text, expected_state text, expected_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=expected_state AND SQLERRM LIKE expected_message THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION '0122: expected rejection: %', statement;
END $$;

INSERT INTO public.organizations(id,name,slug) VALUES
 ('12200000-0000-4000-8000-000000000001','Synthetic recurring lifecycle','recurring-lifecycle-0122');
SELECT set_config('app.organization_id','12200000-0000-4000-8000-000000000001',true);
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
 ('12200000-0000-4000-8000-000000000002','recurring.admin.0122@example.test',now(),now()),
 ('12200000-0000-4000-8000-000000000003','recurring.dispatcher.0122@example.test',now(),now());
INSERT INTO public.user_roles(user_id,role) VALUES
 ('12200000-0000-4000-8000-000000000002','admin'),
 ('12200000-0000-4000-8000-000000000003','dispatcher')
 ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
 ('12200000-0000-4000-8000-000000000001','12200000-0000-4000-8000-000000000002','internal'),
 ('12200000-0000-4000-8000-000000000001','12200000-0000-4000-8000-000000000003','internal');
INSERT INTO public.profiles(user_id,full_name,email,is_active) VALUES
 ('12200000-0000-4000-8000-000000000002','Synthetic recurring admin','recurring.admin.0122@example.test',true),
 ('12200000-0000-4000-8000-000000000003','Synthetic recurring dispatcher','recurring.dispatcher.0122@example.test',true)
 ON CONFLICT(user_id) DO UPDATE SET is_active=true;

INSERT INTO public.forklifts(id,name,model,organization_id)
 SELECT ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'REC122-'||n,'Synthetic','12200000-0000-4000-8000-000000000001'
 FROM generate_series(101,105) n;
INSERT INTO public.bookings(id,forklift_id,start_date,end_date,status,recurring_billing,last_billed_date,organization_id)
 SELECT ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('12200000-0000-4000-8000-'||lpad((n-100)::text,12,'0'))::uuid,
 public.today_mty()-60,public.today_mty()-10,'confirmed',n<>202,public.today_mty()-31,
 '12200000-0000-4000-8000-000000000001'
 FROM generate_series(201,205) n;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"12200000-0000-4000-8000-000000000002","role":"authenticated"}';
INSERT INTO public.deliveries(id,booking_id,forklift_id,type,status,scheduled_date,scheduled_time,driver_name,completed_at)
 SELECT ('12200000-0000-4000-8000-'||lpad((201+row_number() OVER (ORDER BY id)+100)::text,12,'0'))::uuid,
 id,forklift_id,'delivery','completed',start_date,'10:30','Synthetic operator',
 (start_date+time '10:30') AT TIME ZONE 'America/Monterrey'
 FROM public.bookings WHERE id IN
 ('12200000-0000-4000-8000-000000000201','12200000-0000-4000-8000-000000000202');

-- The real 0081 RPC inserts the inspection and updates the booking. In particular,
-- this is not an INSERT of an already-completed recurring booking.
SELECT public.complete_return_inspection(id,forklift_id,p_fuel_level=>'Full',
 p_inspected_at=>(end_date+5+time '12:00') AT TIME ZONE 'America/Monterrey')
 FROM public.bookings WHERE id IN
 ('12200000-0000-4000-8000-000000000201','12200000-0000-4000-8000-000000000202') ORDER BY id;
SELECT pg_temp.rec122_check((SELECT status='completed' AND return_status='returned' AND recurring_billing IS TRUE
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000201'),
 'real return RPC preserves recurring modality');
SELECT pg_temp.rec122_check((SELECT status='completed' AND recurring_billing IS FALSE
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000202'),
 'non-recurring return stays non-recurring');
SELECT pg_temp.rec122_check((SELECT b.end_date=public.today_mty()-10 AND b.last_billed_date=public.today_mty()-31
 AND (ri.inspected_at AT TIME ZONE 'America/Monterrey')::date=public.today_mty()-5
 FROM public.bookings b JOIN public.return_inspections ri ON ri.booking_id=b.id
 WHERE b.id='12200000-0000-4000-8000-000000000201'),
 'late actual return retains contractual end and billed cursor');
SELECT public.complete_return_inspection(id,forklift_id,p_fuel_level=>'Full')
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000201';
SELECT pg_temp.rec122_check((SELECT count(*)=1 FROM public.return_inspections
 WHERE booking_id='12200000-0000-4000-8000-000000000201'), 'repeated return is idempotent');

SELECT public.cancel_booking('12200000-0000-4000-8000-000000000203','Synthetic cancellation regression');
SELECT pg_temp.rec122_check((SELECT status='cancelled' AND recurring_billing IS FALSE
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000203'),
 'real cancellation RPC still disables recurring billing');
DO $$ BEGIN
  BEGIN
    PERFORM public.cancel_booking('12200000-0000-4000-8000-000000000201','Must remain forbidden');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%reserva completada%' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION '0122: cancellation RPC incorrectly accepted completed booking';
END $$;

-- Historical reconciliation fixture: an inspection exists but status is stale.
-- Only the fixture is written as the owner; the reconciliation below is invoked
-- as the authenticated admin with real role, membership and RLS checks.
RESET ROLE;
INSERT INTO public.return_inspections(booking_id,forklift_id,organization_id,condition,fuel_level,inspected_at)
 SELECT id,forklift_id,organization_id,'good','Full',
 (end_date+time '12:00') AT TIME ZONE 'America/Monterrey'
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000204';
SET LOCAL ROLE authenticated;
SELECT set_config('app.booking_rpc','fixture-booking-context',true);
SELECT set_config('app.forklift_rpc','fixture-forklift-context',true);
SELECT * FROM public.reconcile_expired_bookings();
SELECT pg_temp.rec122_check(current_setting('app.booking_rpc')='fixture-booking-context'
 AND current_setting('app.forklift_rpc')='fixture-forklift-context', 'reconciliation restores both incoming contexts after success');
SELECT pg_temp.rec122_check((SELECT status='completed' AND recurring_billing IS TRUE
 AND end_date=public.today_mty()-10 AND last_billed_date=public.today_mty()-31
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000204'),
 'real reconciliation preserves recurring modality and dates');
SELECT pg_temp.rec122_check((SELECT status='confirmed' AND recurring_billing IS TRUE
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000205'),
 'unreturned booking stays confirmed');
SELECT pg_temp.rec122_check((SELECT array_agg(id ORDER BY id)=ARRAY['12200000-0000-4000-8000-000000000205'::uuid]
 FROM public.bookings WHERE organization_id='12200000-0000-4000-8000-000000000001'
 AND recurring_billing=true AND status='confirmed'), 'automatic confirmed-only predicate excludes completed returns');
SELECT pg_temp.rec122_check(NOT EXISTS(SELECT 1 FROM public.invoices
 WHERE organization_id='12200000-0000-4000-8000-000000000001'), 'lifecycle never creates an invoice');

-- The provenance flag must not weaken the actual inspection requirement. A
-- historical return_status alone is insufficient for the completion trigger.
UPDATE public.bookings SET return_status='returned' WHERE id='12200000-0000-4000-8000-000000000205';
SELECT pg_temp.rec122_error('SELECT * FROM public.reconcile_expired_bookings()','23514','%sin inspeccion de devolucion%');
SELECT pg_temp.rec122_check(current_setting('app.booking_rpc')='fixture-booking-context'
 AND current_setting('app.forklift_rpc')='fixture-forklift-context', 'failed reconciliation restores both incoming contexts');
SELECT pg_temp.rec122_check((SELECT status='confirmed' AND recurring_billing IS TRUE
 FROM public.bookings WHERE id='12200000-0000-4000-8000-000000000205'), 'missing inspection still blocks reconciliation atomically');
UPDATE public.bookings SET return_status=NULL WHERE id='12200000-0000-4000-8000-000000000205';
SET LOCAL request.jwt.claims='{"sub":"12200000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT pg_temp.rec122_error('SELECT * FROM public.reconcile_expired_bookings()','P0001','Forbidden');
SELECT pg_temp.rec122_check(current_setting('app.booking_rpc')='fixture-booking-context'
 AND current_setting('app.forklift_rpc')='fixture-forklift-context', 'non-admin remains forbidden without changing contexts');
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims='{"role":"anon"}';
SELECT pg_temp.rec122_error('SELECT * FROM public.reconcile_expired_bookings()','42501','%permission denied%');
RESET ROLE;
SELECT pg_temp.rec122_check(NOT (SELECT prosecdef FROM pg_proc
 WHERE oid='public.reconcile_expired_bookings()'::regprocedure), 'reconciliation remains SECURITY INVOKER');
SELECT pg_temp.rec122_check(NOT (SELECT prosecdef FROM pg_proc
 WHERE oid='public.clear_recurring_billing_on_cancel()'::regprocedure), 'recurring trigger remains SECURITY INVOKER');

-- Defensive trigger branch, not an authorized business transition: the real
-- cancellation RPC above must keep rejecting completed bookings. A temporary
-- carrier lets PostgreSQL invoke the installed trigger without disabling any
-- production guard or modifying a completed booking through a forbidden route.
CREATE TEMP TABLE rec122_trigger_carrier(status text,recurring_billing boolean);
CREATE TRIGGER rec122_defensive_cancel BEFORE UPDATE OF status ON rec122_trigger_carrier
 FOR EACH ROW EXECUTE FUNCTION public.clear_recurring_billing_on_cancel();
INSERT INTO rec122_trigger_carrier VALUES('completed',true);
UPDATE rec122_trigger_carrier SET status='cancelled';
SELECT pg_temp.rec122_check((SELECT recurring_billing IS FALSE FROM rec122_trigger_carrier),
 'defensive completed-to-cancelled trigger branch clears recurrence without relaxing RPC guards');
ROLLBACK;
