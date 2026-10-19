#!/usr/bin/env python3
"""Focused real-Postgres regression for migration 0109, not a full schema replay.

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
            booking_number text NOT NULL, start_date date, end_date date, recurring_billing boolean);
          CREATE TABLE invoices (id uuid PRIMARY KEY, organization_id uuid NOT NULL, invoice_number text,
            booking_id uuid REFERENCES bookings, status text NOT NULL DEFAULT 'draft',
            billing_period_start date, billing_period_end date, notes text);
          CREATE TABLE invoice_bookings (invoice_id uuid REFERENCES invoices, booking_id uuid REFERENCES bookings,
            line_index integer, organization_id uuid DEFAULT current_setting('app.organization_id')::uuid,
            PRIMARY KEY(invoice_id,booking_id));
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
        cls.run_sql(f"""INSERT INTO bookings VALUES ('{uid(10)}','{ORG}','B10','2026-01-01','2026-12-31',false);
          INSERT INTO invoices VALUES ('{uid(100)}','{ORG}','H1','{uid(10)}','draft','2026-01-01','2026-01-20',NULL),
          ('{uid(101)}','{ORG}','H2','{uid(10)}','draft','2026-01-10','2026-01-25',NULL);""")
        cls.run_sql((ROOT / 'drizzle/migrations/0109_nonrecurring_invoice_period_overlap.sql').read_text())
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
        self.run_sql('TRUNCATE invoice_bookings,invoices,bookings;')
        for n in (10, 11):
            self.run_sql(f"INSERT INTO bookings VALUES ('{uid(n)}','{ORG}','B{n}','2026-01-01','2026-12-31',false)")

    def invoice(self, n, start='2026-01-01', end='2026-01-10', status='draft', link='direct', booking=10, org=ORG):
        date = lambda d: 'NULL' if d is None else f"'{d}'"
        direct = f"'{uid(booking)}'" if link in ('direct', 'both') else 'NULL'
        self.run_sql(f"INSERT INTO invoices VALUES ('{uid(n)}','{org}','I{n}',{direct},'{status}',{date(start)},{date(end)},NULL)")
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

    def test_real_concurrent_overlap_serialized(self):
        self.invoice(100,link='none')
        self.invoice(101,'2026-01-05','2026-01-15',link='none')
        a = subprocess.Popen(self.command(),env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        b = None
        try:
            a.stdin.write(f"SET app.organization_id='{ORG}'; SET ROLE authenticated; BEGIN; SELECT sync_invoice_bookings('{uid(100)}',ARRAY['{uid(10)}'::uuid]);\n")
            a.stdin.flush()
            self.assertTrue(select.select([a.stdout],[],[],10)[0], 'First session did not synchronize')
            self.assertEqual(a.stdout.readline().strip(),'1')
            b = subprocess.Popen(self.command()+['-c',f"SET app.organization_id='{ORG}'; SET ROLE authenticated; SET application_name='overlap_0109_waiter'; SELECT sync_invoice_bookings('{uid(101)}',ARRAY['{uid(10)}'::uuid]);"],env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
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


if __name__ == '__main__':
    unittest.main(verbosity=2)
