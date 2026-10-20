#!/usr/bin/env python3
"""Real PostgreSQL focused regression for 0111/0112, not full schema replay.

RUN_LOCAL_SUMMARY_TESTS=1 PGHOST=127.0.0.1 PGPORT=... PGUSER=postgres \
  python3 scripts/tests/test_dispatcher_customer_summary.py
Creates/drops only its randomly named disposable database on loopback.
Uses minimal tables/helpers; the checked-in RLS SQL suite also runs in full CI.
"""
import json
import os
from pathlib import Path
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
A = '11200000-0000-4000-8000-000000000001'
B = '11200000-0000-4000-8000-000000000002'
C = '11200000-0000-4000-8000-000000000003'


def uid(n):
    return f'11200000-0000-4000-8000-{n:012d}'


@unittest.skipUnless(os.getenv('RUN_LOCAL_SUMMARY_TESTS') == '1', 'explicit local PostgreSQL opt-in required')
class SummaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('PGHOST') not in ('127.0.0.1', 'localhost', '::1'):
            raise RuntimeError('Only explicitly selected loopback PostgreSQL is allowed')
        cls.database = 'summary_0112_' + uuid.uuid4().hex
        server_env = {**os.environ, 'PGHOSTADDR': '::1' if os.environ['PGHOST'] == '::1' else '127.0.0.1'}
        cls.env = {**server_env, 'PGDATABASE': cls.database}
        subprocess.run(['createdb', cls.database], env=server_env, check=True, timeout=15)
        cls.addClassCleanup(lambda: subprocess.run(['dropdb', '--if-exists', cls.database], env=server_env, check=True, timeout=15))
        cls.sql('''
          DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
          END $$;
          CREATE SCHEMA auth;
          CREATE TYPE app_role AS ENUM ('admin','administrativo','auditor','ventas','dispatcher','mechanic','customer');
          CREATE TABLE auth.users (id uuid PRIMARY KEY,email text,created_at timestamptz,updated_at timestamptz);
          CREATE TABLE organizations (id uuid PRIMARY KEY,name text,slug text);
          CREATE TABLE organization_memberships (organization_id uuid,auth_user_id uuid,member_type text);
          CREATE TABLE user_roles (user_id uuid PRIMARY KEY,role app_role);
          CREATE TABLE customers (id uuid PRIMARY KEY,name text,created_by_organization_id uuid);
          CREATE TABLE organization_customers (organization_id uuid,customer_id uuid);
          CREATE TABLE customer_portal_accounts (organization_id uuid,customer_id uuid,auth_user_id uuid,email text,status text DEFAULT 'active');
          CREATE TABLE forklifts (id uuid PRIMARY KEY,name text,model text,organization_id uuid);
          CREATE TABLE bookings (id uuid PRIMARY KEY,customer_id uuid,forklift_id uuid,start_date date,end_date date,booking_number text,status text,organization_id uuid);
          CREATE TABLE invoices (id uuid PRIMARY KEY,invoice_number text,customer_id uuid,status text,line_items jsonb,subtotal numeric,tax_amount numeric,total numeric,organization_id uuid,
            issued_at timestamptz DEFAULT now(),due_date date,moneda text DEFAULT 'MXN',tipo_cambio numeric DEFAULT 1,cancellation_status text);
          ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
          -- No authenticated policy: the definer RPC must enforce its own restriction.
          CREATE VIEW v_invoices_with_balance AS SELECT i.*, false AS fx_missing, 0::numeric AS paid_amount,
             0::numeric AS credited_amount, total AS balance, 0 AS payments_fx_missing FROM invoices i;
          CREATE TABLE role_permissions (role app_role,module text,access_level text,updated_at timestamptz DEFAULT now(),UNIQUE(role,module));
          CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
        ''')
        cls.sql('''
          CREATE FUNCTION has_role(u uuid,r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT FROM user_roles WHERE user_id=u AND role=r) $$;
          CREATE FUNCTION current_portal_customer_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT customer_id FROM customer_portal_accounts WHERE auth_user_id=auth.uid() AND status='active' LIMIT 1 $$;
          CREATE FUNCTION current_internal_organization_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT organization_id FROM organization_memberships WHERE auth_user_id=auth.uid() AND member_type='internal' LIMIT 1 $$;
          CREATE FUNCTION is_internal_member(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT FROM organization_memberships WHERE auth_user_id=u AND member_type='internal') $$;
          CREATE FUNCTION fx_is_missing(m text,r numeric) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT upper(coalesce(m,'MXN'))<>'MXN' AND (r IS NULL OR r<=0) $$;
          GRANT USAGE ON SCHEMA public,auth TO authenticated;
          GRANT SELECT ON invoices TO authenticated;
        ''')
        old = (ROOT / 'drizzle/migrations/0044_multi_org_customer_reads_link_rep_guard.sql').read_text()
        old = old[old.index('CREATE OR REPLACE FUNCTION public.get_customer_summary('):]
        cls.sql(old[:old.index('-- ─')])
        cls.sql('REVOKE ALL ON FUNCTION get_customer_summary(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION get_customer_summary(uuid) TO authenticated,service_role;')
        cls.sql((ROOT / 'drizzle/migrations/0112_dispatcher_customer_summary.sql').read_text())

    @classmethod
    def sql(cls, sql, auth=None, error=None):
        if auth is not None:
            claims = json.dumps({'sub': uid(auth), 'role': 'authenticated'})
            sql = f"SET ROLE authenticated; SET request.jwt.claims='{claims}'; " + sql
        p = subprocess.run(['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',sql],
                           env=cls.env,text=True,capture_output=True,timeout=20)
        if error:
            assert p.returncode and error in p.stderr, p.stderr
        else:
            assert p.returncode == 0, p.stderr
        return p.stdout.strip()

    def setUp(self):
        self.sql('TRUNCATE auth.users,organizations,organization_memberships,user_roles,customers,organization_customers,customer_portal_accounts,forklifts,bookings,invoices,role_permissions;')
        # Reuse the complete CI suite fixtures, stopping before SET ROLE.
        fixture = (ROOT / 'supabase/tests/rls/dispatcher_customer_summary.sql').read_text()
        self.sql(fixture[fixture.index('DO $$'):fixture.index('SET LOCAL ROLE')])

    def summary(self, actor=10, customer=C):
        return json.loads(self.sql(f"SELECT get_customer_summary('{customer}');",auth=actor))

    def test_dispatcher_operational_only_and_org_scoped(self):
        data=self.summary()
        self.assertEqual([b['booking_number'] for b in data['bookings']], ['SUMMARY-A'])
        self.assertEqual(data['invoices'],[])
        self.assertTrue(all(value==0 for value in data['totals'].values()))
        self.assertEqual(self.sql('SELECT count(*) FROM invoices',auth=10),'0')
        self.assertEqual(self.summary(customer=uid(4))['bookings'],[])

    def test_authorized_roles_keep_financial_contract(self):
        for actor in range(11,15):
            with self.subTest(actor=actor):
                data=self.summary(actor)
                self.assertEqual([i['invoice_number'] for i in data['invoices']],['SUMMARY-INV-A'])
                self.assertEqual(data['totals']['total_invoiced'],1160)

    def test_portal_residual_dispatcher_retains_only_own_customer(self):
        self.assertEqual(self.summary(20)['totals']['total_invoiced'],1160)
        self.sql(f"SELECT get_customer_summary('{uid(4)}')",auth=20,error='42501')

    def test_no_auth_or_unrelated_role_does_not_gain_access(self):
        self.sql(f"SELECT get_customer_summary('{C}')",error='42501')
        self.sql(f"SELECT get_customer_summary('{C}')",auth=15,error='42501')

    def test_multirole_financial_priority_preserved(self):
        # Current DB enforces one role/user, but function keeps UI priority if
        # legacy multi-role rows are present. Change only this disposable schema.
        self.sql('ALTER TABLE user_roles DROP CONSTRAINT user_roles_pkey')
        try:
            for role in ('admin','administrativo','auditor','ventas'):
                self.sql(f"INSERT INTO user_roles VALUES ('{uid(10)}','{role}')")
                self.assertEqual(self.summary()['totals']['total_invoiced'],1160)
                self.sql(f"DELETE FROM user_roles WHERE user_id='{uid(10)}' AND role='{role}'")
        finally:
            self.sql('ALTER TABLE user_roles ADD PRIMARY KEY(user_id)')

    def test_acl_search_path_and_definer_preserved(self):
        self.assertEqual(self.sql("SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid='get_customer_summary(uuid)'::regprocedure"),'t')
        self.assertEqual(self.sql("SELECT has_function_privilege('anon','get_customer_summary(uuid)','EXECUTE')"),'f')
        self.assertEqual(self.sql("SELECT has_function_privilege('authenticated','get_customer_summary(uuid)','EXECUTE')"),'t')

    def test_permission_matrix_only_restricts_dispatcher_finance_idempotently(self):
        self.sql("INSERT INTO role_permissions(role,module,access_level) VALUES ('dispatcher','Facturas','read'),('dispatcher','Reservas','full'),('dispatcher','Reportes','read'),('admin','Facturas','full'),('auditor','Facturas','read')")
        migration=(ROOT/'drizzle/migrations/0111_dispatcher_financial_permissions.sql').read_text()
        self.sql(migration)
        first=self.sql('SELECT jsonb_agg(to_jsonb(p) ORDER BY role,module) FROM role_permissions p')
        self.sql(migration)
        self.assertEqual(first,self.sql('SELECT jsonb_agg(to_jsonb(p) ORDER BY role,module) FROM role_permissions p'))
        rows=json.loads(first)
        self.assertEqual({(r['role'],r['module']):r['access_level'] for r in rows},
          {('dispatcher','Facturas'):'none',('dispatcher','Reservas'):'full',('dispatcher','Reportes'):'read',('admin','Facturas'):'full',('auditor','Facturas'):'read'})

    def test_complete_ci_sql_suite_with_focused_schema(self):
        self.sql('TRUNCATE auth.users,organizations,organization_memberships,user_roles,customers,organization_customers,customer_portal_accounts,forklifts,bookings,invoices,role_permissions;')
        self.sql((ROOT/'supabase/tests/rls/dispatcher_customer_summary.sql').read_text())

if __name__ == '__main__':
    unittest.main(verbosity=2)
