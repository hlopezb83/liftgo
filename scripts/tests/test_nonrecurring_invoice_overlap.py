#!/usr/bin/env python3
"""Focused real-Postgres regression for migrations 0109/0121, not a full schema replay.

Run on an explicitly selected local disposable PostgreSQL server:
  RUN_LOCAL_OVERLAP_TESTS=1 PGHOST=127.0.0.1 PGPORT=... PGUSER=... \
    python3 scripts/tests/test_nonrecurring_invoice_overlap.py
Creates/drops its own randomly named database; never accepts a remote host.
No production data, migrations, deployments, or auth service are involved.
"""
import os
from pathlib import Path
import select
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
ORG = '10900000-0000-4000-8000-000000000001'
OTHER = '10900000-0000-4000-8000-000000000002'


def uid(n):
    return f'10900000-0000-4000-8000-{n:012d}'


@unittest.skipUnless(os.getenv('RUN_LOCAL_OVERLAP_TESTS') == '1', 'explicit local PostgreSQL opt-in required')
class OverlapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('PGHOST') not in ('127.0.0.1', 'localhost', '::1'):
            raise RuntimeError('Only an explicitly selected loopback PostgreSQL server is allowed')
        cls.database = 'overlap_0109_' + uuid.uuid4().hex
        # PGHOSTADDR otherwise overrides PGHOST in libpq, so pin it too.
        server_env = {**os.environ, 'PGHOSTADDR': '::1' if os.environ['PGHOST'] == '::1' else '127.0.0.1'}
        cls.env = {**server_env, 'PGDATABASE': cls.database}
        subprocess.run(['createdb', cls.database], env=server_env, check=True, timeout=15)
        cls.addClassCleanup(lambda: subprocess.run(['dropdb', '--if-exists', cls.database], env=server_env, check=True, timeout=15))
        cls.run_sql('''
          DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
          END $$;
          CREATE TABLE bookings (id uuid PRIMARY KEY, organization_id uuid NOT NULL,
            booking_number text NOT NULL, start_date date, end_date date, recurring_billing boolean, status text NOT NULL DEFAULT 'confirmed', forklift_id uuid);
          CREATE TABLE invoices (id uuid PRIMARY KEY, organization_id uuid NOT NULL, invoice_number text,
            booking_id uuid REFERENCES bookings, status text NOT NULL DEFAULT 'draft',
            billing_period_start date, billing_period_end date, notes text,
            line_items jsonb DEFAULT '[{"line_kind":"rental"}]'::jsonb);
          CREATE TABLE invoice_bookings (invoice_id uuid REFERENCES invoices, booking_id uuid REFERENCES bookings,
            line_index integer, organization_id uuid DEFAULT current_setting('app.organization_id')::uuid,
            PRIMARY KEY(invoice_id,booking_id));
          CREATE TABLE return_inspections (booking_id uuid REFERENCES bookings, forklift_id uuid,
            organization_id uuid, inspected_at timestamptz);
          GRANT SELECT,INSERT,UPDATE,DELETE ON return_inspections TO authenticated;
          ALTER TABLE return_inspections ENABLE ROW LEVEL SECURITY;
          CREATE POLICY tenant ON return_inspections TO authenticated USING(organization_id=current_setting('app.organization_id')::uuid);
          GRANT USAGE ON SCHEMA public TO authenticated;
          GRANT SELECT, INSERT, UPDATE, DELETE ON bookings,invoices,invoice_bookings TO authenticated;
          ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoice_bookings ENABLE ROW LEVEL SECURITY;
          CREATE POLICY tenant ON bookings TO authenticated USING(organization_id=current_setting('app.organization_id')::uuid);
          CREATE POLICY tenant ON invoices TO authenticated USING(organization_id=current_setting('app.organization_id')::uuid);
          CREATE POLICY tenant ON invoice_bookings TO authenticated USING(organization_id=current_setting('app.organization_id')::uuid);
        ''')
        original = (ROOT / 'supabase/migrations/20260903215543_3f0d73fb-b8e1-4620-9e06-42f4ffe7af0d.sql').read_text()
        cls.run_sql(original[:original.index('-- 3) Guardado')])
        cls.run_sql('REVOKE ALL ON FUNCTION sync_invoice_bookings(uuid,uuid[]) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION sync_invoice_bookings(uuid,uuid[]) TO authenticated,service_role;')
        # Historical overlaps exist BEFORE migration. Applying DDL must not scan/rewrite them.
        cls.run_sql(f"""INSERT INTO bookings (id,organization_id,booking_number,start_date,end_date,recurring_billing) VALUES ('{uid(10)}','{ORG}','B10','2026-01-01','2026-12-31',false);
          INSERT INTO invoices(id,organization_id,invoice_number,booking_id,status,billing_period_start,billing_period_end,notes) VALUES ('{uid(100)}','{ORG}','H1','{uid(10)}','draft','2026-01-01','2026-01-20',NULL),
          ('{uid(101)}','{ORG}','H2','{uid(10)}','draft','2026-01-10','2026-01-25',NULL);""")
        cls.run_sql((ROOT / 'drizzle/migrations/0109_nonrecurring_invoice_period_overlap.sql').read_text())
        if os.getenv('COMPLETED_RECURRING_BASELINE') != '1':
            cls.run_sql((ROOT / 'drizzle/migrations/0121_completed_recurring_invoice_overlap.sql').read_text())
        assert cls.run_sql('SELECT count(*) FROM invoices').stdout.strip() == '2'

    @classmethod
    def command(cls):
        return ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']

    @classmethod
    def run_sql(cls, sql, fail=None, auth=False):
        sql = f"SET app.organization_id='{ORG}'; " + ('SET ROLE authenticated; ' if auth else '') + sql
        p = subprocess.run(cls.command() + ['-c', sql], env=cls.env, text=True, capture_output=True, timeout=15)
        if fail:
            assert p.returncode and fail in p.stderr, (sql, p.stderr)
        else:
            assert p.returncode == 0, (sql, p.stderr)
        return p

    def setUp(self):
        self.run_sql('TRUNCATE return_inspections,invoice_bookings,invoices,bookings;')
        for n in (10, 11):
            self.run_sql(f"INSERT INTO bookings (id,organization_id,booking_number,start_date,end_date,recurring_billing) VALUES ('{uid(n)}','{ORG}','B{n}','2026-01-01','2026-12-31',false)")

        self.run_sql('UPDATE bookings SET forklift_id=id')

    def invoice(self, n, start='2026-01-01', end='2026-01-10', status='draft', link='direct', booking=10, org=ORG):
        date = lambda d: 'NULL' if d is None else f"'{d}'"
        direct = f"'{uid(booking)}'" if link in ('direct', 'both') else 'NULL'
        self.run_sql(f"INSERT INTO invoices(id,organization_id,invoice_number,booking_id,status,billing_period_start,billing_period_end,notes) VALUES ('{uid(n)}','{org}','I{n}',{direct},'{status}',{date(start)},{date(end)},NULL)")
        if link in ('pivot', 'both'):
            self.run_sql(f"INSERT INTO invoice_bookings VALUES ('{uid(n)}','{uid(booking)}',0,'{org}')")

    def sync(self, n, bookings=(10,), fail=None):
        ids = ','.join(f"'{uid(b)}'::uuid" for b in bookings)
        return self.run_sql(f"SELECT sync_invoice_bookings('{uid(n)}',ARRAY[{ids}])", fail, auth=True)

    def test_extension_first_and_self_edit(self):
        for status in ('draft', 'issued'):
            with self.subTest(status=status):
                self.setUp()
                self.invoice(100, '2026-01-11', '2026-01-20', status, 'pivot')
                self.invoice(101)
                self.sync(101)
                self.run_sql(f"UPDATE invoices SET notes='ordinary edit' WHERE id='{uid(101)}'", auth=True)
                self.sync(101)
                self.assertEqual(self.run_sql('SELECT count(*) FROM invoice_bookings').stdout.strip(), '2')

    def test_inclusive_overlaps_all_link_paths(self):
        for link in ('direct', 'pivot', 'both'):
            for start,end in (('2026-01-01','2026-01-10'), ('2026-01-05','2026-01-15'),
                              ('2026-01-10','2026-01-20'), ('2026-01-03','2026-01-08'),
                              ('2026-01-01','2026-01-30')):
                with self.subTest(link=link, start=start, end=end):
                    self.setUp()
                    self.invoice(100, link=link)
                    self.invoice(101, start, end, link='none')
                    self.sync(101, fail='23505')
                    self.assertEqual(self.run_sql(f"SELECT count(*) FROM invoice_bookings WHERE invoice_id='{uid(101)}'").stdout.strip(), '0')

    def test_day_after_and_cancelled_excluded(self):
        self.invoice(100)
        self.invoice(101, '2026-01-11', '2026-01-20')
        self.sync(101)
        self.run_sql(f"UPDATE invoices SET status='cancelled' WHERE id='{uid(100)}'")
        self.invoice(102)
        self.sync(102)

    def test_unknown_invalid_coverage_fails_closed(self):
        for start,end in ((None,None),(None,'2026-01-10'),('2026-01-01',None),('2026-01-20','2026-01-10')):
            with self.subTest(start=start,end=end):
                self.setUp()
                self.invoice(100,start,end,link='pivot')
                self.invoice(101)
                self.sync(101,fail='23505')

    def test_legacy_overlap_notes_edit_fails_closed_atomically(self):
        self.invoice(100)
        self.invoice(101,'2026-01-05','2026-01-15',link='pivot')
        self.run_sql(f"BEGIN; UPDATE invoices SET notes='not persisted' WHERE id='{uid(101)}'; SELECT sync_invoice_bookings('{uid(101)}',ARRAY['{uid(10)}'::uuid]); COMMIT", fail='23505',auth=True)
        self.assertEqual(self.run_sql(f"SELECT notes IS NULL FROM invoices WHERE id='{uid(101)}'").stdout.strip(), 't')
        self.assertEqual(self.run_sql('SELECT count(*) FROM invoice_bookings').stdout.strip(), '1')

    def test_recurring_legacy_unchanged(self):
        self.run_sql('UPDATE bookings SET recurring_billing=true')
        self.invoice(100)
        self.invoice(101,'2026-01-05','2026-01-15')
        self.sync(101)  # Partial overlap deliberately unchanged for recurring.
        self.invoice(102)
        self.sync(102,fail='23505')
        self.invoice(103,None,None,link='pivot')
        self.invoice(104,'2026-02-01','2026-02-10')
        self.sync(104)

    def test_org_isolation_even_with_privileged_visibility(self):
        # Deliberately inconsistent historical row tests explicit org predicate,
        # independently of RLS. Normal product org triggers disallow this setup.
        self.invoice(100,org=OTHER,link='pivot')
        self.invoice(101)
        self.run_sql(f"SELECT sync_invoice_bookings('{uid(101)}',ARRAY['{uid(10)}'::uuid])")
        self.sync(101)

    def test_existing_range_checks_and_multibooking_atomicity(self):
        self.invoice(100,booking=11)
        self.invoice(101,link='none')
        self.sync(101,(10,11),fail='23505')
        self.assertEqual(self.run_sql(f"SELECT count(*) FROM invoice_bookings WHERE invoice_id='{uid(101)}'").stdout.strip(),'0')
        for start,end in ((None,None),('2026-01-10','2026-01-01'),('2025-12-31','2026-01-01')):
            self.run_sql(f"DELETE FROM invoices WHERE id='{uid(101)}'")
            self.invoice(101,start,end,link='none')
            self.sync(101,fail='23514')

    def test_privileges_and_invoker_preserved(self):
        self.assertEqual(self.run_sql("SELECT prosecdef FROM pg_proc WHERE oid='sync_invoice_bookings(uuid,uuid[])'::regprocedure").stdout.strip(),'f')
        for role,expected in (('anon','f'),('authenticated','t'),('service_role','t')):
            self.assertEqual(self.run_sql(f"SELECT has_function_privilege('{role}','sync_invoice_bookings(uuid,uuid[])','EXECUTE')").stdout.strip(),expected)

    def test_completed_trigger_function_has_no_rpc_grants(self):
        signature = 'guard_completed_recurring_invoice_overlap()'
        self.assertEqual(self.run_sql(f"SELECT prosecdef FROM pg_proc WHERE oid='{signature}'::regprocedure").stdout.strip(),'f')
        for role in ('anon','authenticated','service_role'):
            self.assertEqual(self.run_sql(f"SELECT has_function_privilege('{role}','{signature}','EXECUTE')").stdout.strip(),'f')

    def test_real_concurrent_overlap_serialized(self, first=None, second=None):
        self.invoice(100,link='none')
        self.invoice(101,'2026-01-05','2026-01-15',link='none')
        first = first or f"SELECT sync_invoice_bookings('{uid(100)}',ARRAY['{uid(10)}'::uuid])"
        second = second or f"SELECT sync_invoice_bookings('{uid(101)}',ARRAY['{uid(10)}'::uuid])"
        a = subprocess.Popen(self.command(),env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        b = None
        try:
            a.stdin.write(f"SET app.organization_id='{ORG}'; SET ROLE authenticated; BEGIN; {first};\n")
            a.stdin.flush()
            self.assertTrue(select.select([a.stdout],[],[],10)[0], 'First session did not synchronize')
            self.assertEqual(a.stdout.readline().strip(),'1')
            b = subprocess.Popen(self.command()+['-c',f"SET app.organization_id='{ORG}'; SET ROLE authenticated; SET application_name='overlap_0109_waiter'; {second};"],env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            deadline=time.monotonic()+8
            waiting=False
            while time.monotonic()<deadline:
                waiting=self.run_sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='overlap_0109_waiter' AND wait_event='advisory')").stdout.strip()=='t'
                if waiting: break
                time.sleep(.05)
            self.assertTrue(waiting,'Second real session did not wait on advisory lock')
            a.stdin.write('COMMIT;\n\\q\n'); a.stdin.flush()
            a.wait(timeout=10)
            self.assertEqual(a.returncode,0,a.stderr.read())
            _,error=b.communicate(timeout=10)
            self.assertNotEqual(b.returncode,0)
            self.assertIn('23505',error)
            self.assertEqual(self.run_sql('SELECT count(*) FROM invoice_bookings').stdout.strip(),'1')
        finally:
            for p in (a,b):
                if p and p.poll() is None:
                    p.terminate();p.wait(timeout=10)
                if p:
                    for stream in (p.stdin,p.stdout,p.stderr):
                        if stream and not stream.closed: stream.close()


    def complete_recurring(self):
        self.run_sql("UPDATE bookings SET recurring_billing=true,status='completed'")
        self.run_sql("INSERT INTO return_inspections SELECT id,forklift_id,organization_id,'2026-10-01T18:00:00Z' FROM bookings b WHERE NOT EXISTS (SELECT 1 FROM return_inspections ri WHERE ri.booking_id=b.id)")

    def test_completed_recurring_overlap_all_link_paths(self):
        for link in ('direct', 'pivot', 'both'):
            for start,end in (('2026-01-01','2026-01-10'), ('2026-01-05','2026-01-15'),
                              ('2026-01-10','2026-01-20'), ('2026-01-03','2026-01-08'),
                              ('2026-01-01','2026-01-30')):
                with self.subTest(link=link,start=start,end=end):
                    self.setUp()
                    self.complete_recurring()
                    self.invoice(100,link=link)
                    self.invoice(101,start,end,link='none')
                    self.sync(101,fail='23505')
                    self.assertEqual(self.run_sql(f"SELECT count(*) FROM invoice_bookings WHERE invoice_id='{uid(101)}'").stdout.strip(),'0')

    def test_completed_history_notes_and_changed_coverage(self):
        # Historical partial overlaps were allowed while booking was confirmed.
        self.run_sql('UPDATE bookings SET recurring_billing=true')
        self.invoice(100,link='pivot')
        self.invoice(101,'2026-01-05','2026-01-15',link='pivot')
        self.complete_recurring()
        self.run_sql(f"BEGIN; UPDATE invoices SET notes='preserved' WHERE id='{uid(101)}'; SELECT sync_invoice_bookings('{uid(101)}',ARRAY['{uid(10)}'::uuid]); COMMIT",auth=True)
        self.assertEqual(self.run_sql(f"SELECT notes FROM invoices WHERE id='{uid(101)}'").stdout.strip(),'preserved')
        self.run_sql(f"UPDATE invoices SET billing_period_end='2026-01-16' WHERE id='{uid(101)}'",fail='23505',auth=True)
        self.assertEqual(self.run_sql(f"SELECT billing_period_end FROM invoices WHERE id='{uid(101)}'").stdout.strip(),'2026-01-15')

    def test_completed_direct_writes_and_resurrection(self):
        self.complete_recurring()
        self.invoice(100,link='pivot')
        self.run_sql(f"INSERT INTO invoices(id,organization_id,invoice_number,booking_id,status,billing_period_start,billing_period_end,notes) VALUES ('{uid(999)}','{ORG}','I999','{uid(10)}','draft','2026-01-05','2026-01-15',NULL)",fail='23505',auth=True)
        self.invoice(101,'2026-01-11','2026-01-20',link='direct')
        self.sync(101)
        self.run_sql(f"UPDATE invoices SET notes='normal' WHERE id='{uid(101)}'",auth=True)
        self.sync(101)
        self.run_sql(f"UPDATE invoices SET billing_period_start='2026-01-10' WHERE id='{uid(101)}'",fail='23505',auth=True)
        self.invoice(102,link='none')
        self.run_sql(f"UPDATE invoices SET booking_id='{uid(10)}' WHERE id='{uid(102)}'",fail='23505',auth=True)
        self.run_sql(f"INSERT INTO invoice_bookings VALUES ('{uid(102)}','{uid(10)}',0,'{ORG}')",fail='23505',auth=True)
        self.invoice(103,status='cancelled',link='direct')
        self.run_sql(f"UPDATE invoices SET status='draft' WHERE id='{uid(103)}'",fail='23505',auth=True)
        self.run_sql(f"UPDATE invoices SET status='cancelled' WHERE id='{uid(100)}'",auth=True)
        self.sync(102)

    def test_completed_unknown_historical_coverage_fails_closed(self):
        for start,end in ((None,None),(None,'2026-01-10'),('2026-01-01',None),('2026-01-20','2026-01-10')):
            with self.subTest(start=start,end=end):
                self.setUp()
                self.invoice(100,start,end,link='pivot')
                self.complete_recurring()
                self.invoice(101,'2026-02-01','2026-02-10',link='none')
                self.sync(101,fail='23505')

    def test_completed_real_concurrent_overlap(self):
        self.complete_recurring()
        self.test_real_concurrent_overlap_serialized()



    def test_completed_reorder_history_preserves_coverage(self):
        self.run_sql('UPDATE bookings SET recurring_billing=true')
        self.invoice(100,link='pivot')
        self.invoice(101,'2026-01-05','2026-01-15',link='pivot')
        self.run_sql(f"INSERT INTO invoice_bookings VALUES ('{uid(101)}','{uid(11)}',1,'{ORG}')")
        self.complete_recurring()
        self.sync(101,(11,10))
        self.assertEqual(self.run_sql(f"SELECT line_index FROM invoice_bookings WHERE invoice_id='{uid(101)}' AND booking_id='{uid(10)}'").stdout.strip(),'1')
        self.sync(101,(10,10),fail='23505')
        self.assertEqual(self.run_sql(f"SELECT count(*) FROM invoice_bookings WHERE invoice_id='{uid(101)}'").stdout.strip(),'2')

    def test_completed_concurrent_direct_pivot_and_sync(self):
        self.complete_recurring()
        self.test_real_concurrent_overlap_serialized(
            f"INSERT INTO invoice_bookings VALUES ('{uid(100)}','{uid(10)}',0,'{ORG}') RETURNING 1")

    def test_completed_stronger_snapshot_rejected(self):
        self.complete_recurring()
        self.invoice(100,link='none')
        for isolation in ('REPEATABLE READ','SERIALIZABLE'):
            self.run_sql(f"BEGIN ISOLATION LEVEL {isolation}; SELECT sync_invoice_bookings('{uid(100)}',ARRAY['{uid(10)}'::uuid]); COMMIT",fail='40001',auth=True)
        self.assertEqual(self.run_sql('SELECT count(*) FROM invoice_bookings').stdout.strip(),'0')

    def test_completed_direct_update_vs_save_lock_order_fails_fast(self):
        # Mirrors the save RPC's booking-advisory -> invoice-row order. The
        # competing direct UPDATE owns its invoice row before its AFTER trigger.
        self.complete_recurring()
        self.invoice(100,link='pivot')
        self.invoice(101,'2026-01-11','2026-01-20',link='pivot')
        a = subprocess.Popen(self.command(),env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        try:
            a.stdin.write(f"SET app.organization_id='{ORG}'; SET ROLE authenticated; BEGIN; SELECT lock_bookings_for_billing(ARRAY['{uid(10)}'::uuid]); SELECT 1;\n"); a.stdin.flush()
            self.assertTrue(select.select([a.stdout],[],[],10)[0])
            marker = a.stdout.readline().strip()
            if not marker: marker = a.stdout.readline().strip()
            self.assertEqual(marker, '1')
            # No wait cycle: the direct writer gets a retryable error promptly.
            self.run_sql(f"SET statement_timeout='3s'; UPDATE invoices SET billing_period_start='2026-01-05' WHERE id='{uid(101)}'",fail='55P03',auth=True)
            a.stdin.write(f"UPDATE invoices SET notes='safe' WHERE id='{uid(101)}'; COMMIT;\n\\q\n"); a.stdin.flush()
            a.wait(timeout=10)
            self.assertEqual(a.returncode,0,a.stderr.read())
            self.run_sql(f"UPDATE invoices SET billing_period_start='2026-01-05' WHERE id='{uid(101)}'",fail='23505',auth=True)
            self.assertEqual(self.run_sql(f"SELECT billing_period_start FROM invoices WHERE id='{uid(101)}'").stdout.strip(),'2026-01-11')
        finally:
            if a.poll() is None: a.terminate(); a.wait(timeout=10)
            for stream in (a.stdin,a.stdout,a.stderr):
                if stream and not stream.closed: stream.close()

    def test_completed_direct_pivot_vs_direct_invoice_fails_fast(self):
        self.complete_recurring()
        self.invoice(100,link='none')
        self.invoice(101,'2026-01-05','2026-01-15',link='none')
        a = subprocess.Popen(self.command(),env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        try:
            a.stdin.write(f"SET app.organization_id='{ORG}'; SET ROLE authenticated; BEGIN; INSERT INTO invoice_bookings VALUES ('{uid(100)}','{uid(10)}',0,'{ORG}') RETURNING 1;\n"); a.stdin.flush()
            self.assertTrue(select.select([a.stdout],[],[],10)[0])
            self.assertEqual(a.stdout.readline().strip(),'1')
            self.run_sql(f"SET statement_timeout='3s'; UPDATE invoices SET booking_id='{uid(10)}' WHERE id='{uid(101)}'",fail='55P03',auth=True)
            a.stdin.write('COMMIT;\n\\q\n'); a.stdin.flush(); a.wait(timeout=10)
            self.assertEqual(a.returncode,0,a.stderr.read())
            self.run_sql(f"UPDATE invoices SET booking_id='{uid(10)}' WHERE id='{uid(101)}'",fail='23505',auth=True)
            self.assertEqual(self.run_sql(f"SELECT booking_id IS NULL FROM invoices WHERE id='{uid(101)}'").stdout.strip(),'t')
        finally:
            if a.poll() is None: a.terminate(); a.wait(timeout=10)
            for stream in (a.stdin,a.stdout,a.stderr):
                if stream and not stream.closed: stream.close()

    def test_completed_tenant_isolation(self):
        self.complete_recurring()
        self.test_org_isolation_even_with_privileged_visibility()

    def test_completed_multibooking_rollback_and_range_checks(self):
        self.complete_recurring()
        self.test_existing_range_checks_and_multibooking_atomicity()



    def test_completed_mixed_history_notes_keep_deferred_validation(self):
        self.run_sql(f"UPDATE bookings SET recurring_billing=true WHERE id='{uid(10)}'")
        self.invoice(100,link='pivot')
        self.invoice(101,'2026-01-05','2026-01-15',link='pivot')
        self.run_sql(f"INSERT INTO invoice_bookings VALUES ('{uid(101)}','{uid(11)}',1,'{ORG}')")
        self.run_sql(f"UPDATE bookings SET status='completed' WHERE id='{uid(10)}'")
        self.run_sql("""CREATE OR REPLACE FUNCTION test_deferred_hook() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF current_setting('test.reject_deferred',true)='yes' THEN
            RAISE EXCEPTION 'deferred validation retained' USING ERRCODE='23514';
          END IF; RETURN NULL; END $$;
          CREATE CONSTRAINT TRIGGER test_deferred_hook AFTER UPDATE ON invoice_bookings
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_deferred_hook();""")
        try:
            self.run_sql(f"BEGIN; UPDATE invoices SET notes='mixed preserved' WHERE id='{uid(101)}'; SELECT sync_invoice_bookings('{uid(101)}',ARRAY['{uid(10)}'::uuid,'{uid(11)}'::uuid]); COMMIT",auth=True)
            self.assertEqual(self.run_sql(f"SELECT notes FROM invoices WHERE id='{uid(101)}'").stdout.strip(),'mixed preserved')
            self.run_sql(f"BEGIN; SET LOCAL test.reject_deferred='yes'; UPDATE invoices SET notes='must rollback' WHERE id='{uid(101)}'; SELECT sync_invoice_bookings('{uid(101)}',ARRAY['{uid(10)}'::uuid,'{uid(11)}'::uuid]); COMMIT",fail='23514',auth=True)
            self.assertEqual(self.run_sql(f"SELECT notes FROM invoices WHERE id='{uid(101)}'").stdout.strip(),'mixed preserved')
        finally:
            self.run_sql('DROP TRIGGER test_deferred_hook ON invoice_bookings; DROP FUNCTION test_deferred_hook();')



    def test_completed_noop_does_not_bypass_update_rls(self):
        self.complete_recurring()
        self.invoice(100,link='pivot')
        self.run_sql("""CREATE POLICY deny_test_update ON invoice_bookings AS RESTRICTIVE FOR UPDATE TO authenticated
          USING (current_setting('test.deny_update',true) IS DISTINCT FROM 'yes');""")
        try:
            self.run_sql(f"SET test.deny_update='yes'; SELECT sync_invoice_bookings('{uid(100)}',ARRAY['{uid(10)}'::uuid]);",fail='42501',auth=True)
        finally:
            self.run_sql('DROP POLICY deny_test_update ON invoice_bookings')



    def test_completed_return_cutoff_timezone_and_adjacent_end(self):
        self.complete_recurring()
        # UTC Jan11 is still Jan10 in Monterrey.
        self.run_sql("UPDATE return_inspections SET inspected_at='2026-01-11T05:59:59Z'")
        self.invoice(100,link='none')
        self.sync(100)
        self.invoice(101,'2026-01-11','2026-01-11',link='none')
        self.sync(101,fail='23514')

    def test_completed_missing_wrong_unit_or_tenant_return_fails_closed(self):
        for kind in ('missing','wrong_unit','wrong_tenant','duplicate','duplicate_wrong_unit','future_same_day','infinite','before_start','future'):
            with self.subTest(kind=kind):
                self.setUp(); self.complete_recurring()
                if kind=='missing': self.run_sql('DELETE FROM return_inspections')
                elif kind=='wrong_unit': self.run_sql(f"UPDATE return_inspections SET forklift_id='{uid(999)}'")
                elif kind=='wrong_tenant': self.run_sql(f"UPDATE return_inspections SET organization_id='{OTHER}'")
                elif kind=='duplicate': self.run_sql('INSERT INTO return_inspections SELECT * FROM return_inspections')
                elif kind=='duplicate_wrong_unit': self.run_sql(f"INSERT INTO return_inspections SELECT booking_id,'{uid(999)}',organization_id,inspected_at FROM return_inspections")
                elif kind=='future_same_day': self.run_sql("UPDATE return_inspections SET inspected_at=CURRENT_TIMESTAMP + INTERVAL '1 minute'")
                else:
                    timestamp={'infinite':'infinity','before_start':'2025-12-01T18:00:00Z','future':'2099-01-01T18:00:00Z'}[kind]
                    self.run_sql(f"UPDATE return_inspections SET inspected_at='{timestamp}'")
                self.invoice(100,link='none'); self.sync(100,fail='23514')
                self.assertEqual(self.run_sql('SELECT count(*) FROM invoice_bookings').stdout.strip(),'0')

    def test_completed_historical_notes_preserve_missing_return(self):
        self.run_sql('UPDATE bookings SET recurring_billing=true')
        self.invoice(100,link='pivot')
        self.run_sql("UPDATE bookings SET status='completed'")
        self.run_sql(f"BEGIN; UPDATE invoices SET notes='legacy no return retained' WHERE id='{uid(100)}'; SELECT sync_invoice_bookings('{uid(100)}',ARRAY['{uid(10)}'::uuid]); COMMIT",auth=True)
        self.assertEqual(self.run_sql(f"SELECT notes FROM invoices WHERE id='{uid(100)}'").stdout.strip(),'legacy no return retained')



    def test_completed_late_return_allows_rent_without_extending_booking(self):
        self.complete_recurring()
        self.run_sql("UPDATE bookings SET end_date='2026-01-10'; UPDATE return_inspections SET inspected_at='2026-01-20T18:00:00Z'")
        self.invoice(100,'2026-01-11','2026-01-20',link='none')
        self.sync(100)
        self.assertEqual(self.run_sql(f"SELECT end_date FROM bookings WHERE id='{uid(10)}'").stdout.strip(),'2026-01-10')
        self.invoice(101,'2026-01-21','2026-01-21',link='none')
        self.sync(101,fail='23514')
        self.run_sql("UPDATE bookings SET status='confirmed'")
        self.invoice(102,'2026-01-11','2026-01-15',link='none')
        self.sync(102,fail='23514')



    def test_completed_late_recovery_ambiguous_history_fails_closed(self):
        for items in ('null','{}','[]','[{"description":"old rent"}]','[{"line_kind":"manual"}]','[{"line_kind":"charge"}]'):
            with self.subTest(items=items):
                self.setUp(); self.complete_recurring()
                self.run_sql("UPDATE bookings SET end_date='2026-01-10'; UPDATE return_inspections SET inspected_at='2026-01-20T18:00:00Z'")
                self.invoice(100,link='pivot')
                self.run_sql(f"UPDATE invoices SET line_items='{items}'::jsonb WHERE id='{uid(100)}'")
                self.invoice(101,'2026-01-11','2026-01-20',link='none')
                self.sync(101,fail='23514')
                self.run_sql(f"UPDATE invoices SET status='cancelled' WHERE id='{uid(100)}'")
                self.sync(101)

    def test_completed_late_recovery_candidate_and_group_are_unambiguous(self):
        self.complete_recurring()
        self.run_sql("UPDATE bookings SET end_date='2026-01-10'; UPDATE return_inspections SET inspected_at='2026-01-20T18:00:00Z'")
        self.invoice(100,'2026-01-11','2026-01-20',link='none')
        self.run_sql(f"UPDATE invoices SET line_items=jsonb_build_array(jsonb_build_object('line_kind','manual')) WHERE id='{uid(100)}'")
        self.sync(100,fail='23514')
        self.run_sql(f"UPDATE invoices SET line_items=jsonb_build_array(jsonb_build_object('line_kind','rental')) WHERE id='{uid(100)}'")
        self.sync(100,(10,11),fail='23514')
        self.assertEqual(self.run_sql('SELECT count(*) FROM invoice_bookings').stdout.strip(),'0')
        self.sync(100)

    def test_completed_late_recovery_grouped_history_requires_review(self):
        self.complete_recurring()
        self.run_sql("UPDATE bookings SET end_date='2026-01-10'; UPDATE return_inspections SET inspected_at='2026-01-20T18:00:00Z'")
        self.invoice(100,link='none'); self.sync(100,(10,11))  # Contractual grouping remains supported.
        self.invoice(101,'2026-01-11','2026-01-20',link='none')
        self.sync(101,fail='23514')
        self.run_sql(f"UPDATE invoices SET notes='history retained' WHERE id='{uid(100)}'",auth=True)
        self.sync(100,(10,11))


if __name__ == '__main__':
    unittest.main(verbosity=2)
