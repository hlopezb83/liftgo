-- Metadata supplement only. Real Auth/RLS operations and concurrency live in
-- tests/multi-tenant-ab/booking-invoice-cancellation-api.spec.ts.
-- No users, permissions, business data or JWT claims are changed by this suite.
BEGIN;
DO $metadata$
DECLARE
  v_name text;
  v_role text;
  v_proc record;
  v_table text;
  v_trigger text;
BEGIN
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.cancel_booking(uuid,text)'::regprocedure) THEN
    RAISE EXCEPTION 'cancel_booking must remain SECURITY INVOKER';
  END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'guard_booking_cancellation_invoices',
    'guard_invoice_booking_cancellation',
    'guard_invoice_booking_link_cancellation'
  ] LOOP
    SELECT p.* INTO v_proc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name AND p.pronargs = 0;
    IF NOT FOUND OR NOT v_proc.prosecdef OR v_proc.provolatile <> 'v'
       OR NOT COALESCE(v_proc.proconfig @> ARRAY['search_path=public, pg_temp']::text[], false)
       OR v_proc.prorettype <> 'trigger'::regtype THEN
      RAISE EXCEPTION 'Private guard metadata invalid: %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(v_role, v_proc.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Private guard unexpectedly callable by %: %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOR v_table, v_trigger IN VALUES
    ('bookings', 'zz_guard_booking_cancellation_invoices'),
    ('invoices', 'zz_guard_invoice_booking_cancellation'),
    ('invoice_bookings', 'zz_guard_invoice_booking_link_cancellation')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid = ('public.' || v_table)::regclass
         AND t.tgname = v_trigger AND NOT t.tgisinternal AND (t.tgtype & 2) = 2)
       OR NOT EXISTS (SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = ('public.' || v_table)::regclass
           AND t.tgname = 'trg_organization_write_context' AND t.tgname::text < v_trigger) THEN
      RAISE EXCEPTION 'Guard must run after organization context: %', v_table;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_attribute a
      ON a.attrelid=t.tgrelid AND a.attname='cfdi_status'
    WHERE t.tgrelid='public.invoices'::regclass
      AND t.tgname='zz_guard_invoice_booking_cancellation'
      AND (t.tgtype & 16)=16 AND a.attnum=ANY(t.tgattr::smallint[])
  ) THEN
    RAISE EXCEPTION 'Invoice guard must run on UPDATE OF cfdi_status before PAC';
  END IF;
  RAISE NOTICE 'PASS: booking/invoice private trigger metadata and unchanged INVOKER RPC';
END;
$metadata$;
ROLLBACK;
