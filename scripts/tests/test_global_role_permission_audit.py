#!/usr/bin/env python3
"""Focused PostgreSQL regression for global permission auditing and release.

RUN_LOCAL_SUMMARY_TESTS=1 PGHOST=127.0.0.1 PGPORT=... PGUSER=postgres \
  python3 scripts/tests/test_global_role_permission_audit.py
Reuses the disposable, loopback-only summary fixture. Not full schema replay.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
import test_dispatcher_customer_summary as summary_fixture
ROOT = summary_fixture.ROOT
uid = summary_fixture.uid

spec = importlib.util.spec_from_file_location('release_generator', ROOT/'scripts/prepare-dispatcher-audit-release.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


@unittest.skipUnless(__import__('os').getenv('RUN_LOCAL_SUMMARY_TESTS') == '1', 'explicit local PostgreSQL opt-in required')
class GlobalAuditTests(unittest.TestCase):
    sql = classmethod(summary_fixture.SummaryTests.sql.__func__)

    @classmethod
    def setUpClass(cls):
        summary_fixture.SummaryTests.setUpClass.__func__(cls)
        cls.sql('''
          ALTER TABLE role_permissions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
          CREATE SCHEMA drizzle;
          CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint);
          CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,payload jsonb,table_name text,record_id uuid);
          CREATE TABLE tenant_fixture(id uuid PRIMARY KEY,organization_id uuid NOT NULL,value text);
          CREATE FUNCTION audit_trigger_fn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
          BEGIN
            INSERT INTO audit_logs(organization_id,payload,table_name,record_id) VALUES
              (COALESCE((to_jsonb(NEW)->>'organization_id')::uuid,nullif(current_setting('app.organization_id',true),'')::uuid),to_jsonb(NEW),TG_TABLE_NAME,NEW.id);
            RETURN COALESCE(NEW,OLD);
          END $$;
          CREATE TRIGGER tenant_audit AFTER INSERT OR UPDATE ON tenant_fixture FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
        ''')

    def setUp(self):
        self.sql('''DROP TRIGGER IF EXISTS audit_role_permissions ON role_permissions;
          DROP TABLE IF EXISTS role_permission_audit_events;
          DROP FUNCTION IF EXISTS audit_global_role_permission_change();
          TRUNCATE drizzle.__drizzle_migrations,audit_logs,tenant_fixture;''')
        summary_fixture.SummaryTests.setUp(self)
        old=(ROOT/'drizzle/migrations/0044_multi_org_customer_reads_link_rep_guard.sql').read_text()
        old=old[old.index('CREATE OR REPLACE FUNCTION public.get_customer_summary('):]
        self.sql(old[:old.index('-- ─')])
        self.sql('''INSERT INTO role_permissions(role,module,access_level) VALUES
          ('dispatcher','Facturas','read'),('dispatcher','Reservas','full'),('admin','Facturas','full');
          INSERT INTO audit_logs(organization_id,payload) VALUES ('11200000-0000-4000-8000-000000000001','{"historical":true}');
          CREATE TRIGGER audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON role_permissions
            FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();''')
        prior=hashlib.sha256((ROOT/'drizzle/migrations/0110_control0109_verified_release.sql').read_bytes()).hexdigest()
        self.sql(f"INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ('{prior}',1792455001110)")
        self.fingerprint=self.sql("SELECT md5(pg_get_functiondef('get_customer_summary(uuid)'::regprocedure))")
        self.ledger_fingerprint=self.sql("SELECT md5(string_agg(id::text || ':' || created_at::text || ':' || hash, ',' ORDER BY id)) FROM drizzle.__drizzle_migrations")
        self.release=generator.generate(self.fingerprint,self.ledger_fingerprint)
        self.migration=(ROOT/'drizzle/migrations/0113_global_role_permission_audit.sql').read_text()

    def test_atomic_release_two_tenants_and_truthful_system_actor(self):
        self.sql("UPDATE role_permissions SET access_level='none' WHERE role='dispatcher' AND module='Facturas'",error='23502')
        self.sql(self.release)
        row=json.loads(self.sql('SELECT to_jsonb(e) FROM role_permission_audit_events e'))
        self.assertEqual(row['actor_kind'],'system')
        self.assertIsNone(row['actor_user_id'])
        self.assertEqual(row['database_session_user'],self.sql('SELECT session_user'))
        self.assertNotIn('organization_id',row)
        self.assertEqual(row['changed_fields'],['access_level'])
        self.assertEqual(row['old_data']['access_level'],'read')
        self.assertEqual(row['new_data']['access_level'],'none')
        self.assertEqual(self.sql('SELECT count(*) FROM organizations'),'2')
        self.assertEqual(self.sql("SELECT payload FROM audit_logs"),'{"historical": true}')
        self.assertEqual(self.sql('SELECT string_agg(created_at::text,\',\' ORDER BY created_at) FROM drizzle.__drizzle_migrations'),
                         '1792455001110,1792470000000,1792470000001,1792470000002')

    def test_insert_update_delete_and_noop_audit(self):
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        self.sql("INSERT INTO role_permissions(role,module,access_level) VALUES ('dispatcher','Gastos','read'); UPDATE role_permissions SET access_level='none' WHERE module='Gastos'; UPDATE role_permissions SET updated_at=now() WHERE module='Gastos'; DELETE FROM role_permissions WHERE module='Gastos';")
        rows=json.loads(self.sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY recorded_at) FROM role_permission_audit_events e'))
        self.assertEqual([x['action'] for x in rows],['INSERT','UPDATE','DELETE'])
        self.assertIsNone(rows[0]['old_data'])
        self.assertIsNone(rows[2]['new_data'])
        self.assertEqual(rows[1]['changed_fields'],['access_level'])
        self.assertEqual(set(rows[0]['new_data']),{'id','role','module','access_level'})

    def test_authenticated_actor_cannot_spoof_system_or_skip_e2e(self):
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        # Only this disposable fixture grants permission DML; journal stays closed.
        self.sql('GRANT SELECT,UPDATE ON role_permissions TO authenticated;')
        self.sql("SET app.audit_source='system'; SET app.e2e_seed='on'; UPDATE role_permissions SET access_level='none' WHERE role='dispatcher' AND module='Facturas';",auth=11)
        row=json.loads(self.sql('SELECT to_jsonb(e) FROM role_permission_audit_events e'))
        self.assertEqual(row['actor_kind'],'user')
        self.assertEqual(row['actor_user_id'],uid(11))

    def test_acl_denies_all_application_roles(self):
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        for role in ('anon','authenticated','service_role'):
            for privilege in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE'):
                self.assertEqual(self.sql(f"SELECT has_table_privilege('{role}','role_permission_audit_events','{privilege}')"),'f')
            self.assertEqual(self.sql(f"SELECT has_function_privilege('{role}','audit_global_role_permission_change()','EXECUTE')"),'f')
        self.sql('SELECT * FROM role_permission_audit_events',auth=11,error='42501')
        self.assertEqual(self.sql("SELECT relrowsecurity FROM pg_class WHERE oid='role_permission_audit_events'::regclass"),'t')
        self.assertEqual(self.sql("SELECT count(*) FROM pg_policy WHERE polrelid='role_permission_audit_events'::regclass AND NOT polpermissive AND pg_get_expr(polqual,polrelid)='false'"),'1')

    def test_reapply_preserves_events_and_tenant_trigger(self):
        self.sql(self.release)
        before=self.sql('SELECT jsonb_agg(to_jsonb(e)) FROM role_permission_audit_events e')
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        self.assertEqual(before,self.sql('SELECT jsonb_agg(to_jsonb(e)) FROM role_permission_audit_events e'))
        self.sql("INSERT INTO tenant_fixture VALUES ('11200000-0000-4000-8000-000000000090','11200000-0000-4000-8000-000000000002','tenant B change')")
        self.assertEqual(self.sql('SELECT count(*) FROM audit_logs'),'2')
        self.assertEqual(self.sql("SELECT organization_id FROM audit_logs WHERE payload->>'value'='tenant B change'"),'11200000-0000-4000-8000-000000000002')

    def test_rollback_removes_global_bootstrap_and_ledger_and_updates(self):
        failing=self.release.replace('-- Record every target',"SELECT 1/0;\n-- Record every target")
        self.sql(failing,error='22012')
        self.assertEqual(self.sql("SELECT to_regclass('public.role_permission_audit_events') IS NULL"),'t')
        self.assertEqual(self.sql("SELECT access_level FROM role_permissions WHERE role='dispatcher' AND module='Facturas'"),'read')
        self.assertEqual(self.sql('SELECT count(*) FROM drizzle.__drizzle_migrations'),'1')
        self.assertEqual(self.sql("SELECT md5(pg_get_functiondef('get_customer_summary(uuid)'::regprocedure))"),self.fingerprint)
        self.assertEqual(self.sql("SELECT tgfoid::regprocedure::text FROM pg_trigger WHERE tgname='audit_role_permissions'"),'audit_trigger_fn()')

    def test_shape_policy_and_trigger_drift_fail_closed(self):
        self.sql('CREATE TABLE role_permission_audit_events(unexpected text)')
        self.sql('BEGIN;'+self.migration+'COMMIT;',error='column contract drift')
        self.assertEqual(self.sql("SELECT count(*) FROM information_schema.columns WHERE table_name='role_permission_audit_events'"),'1')
        self.sql('DROP TABLE role_permission_audit_events; BEGIN;'+self.migration+'COMMIT;')
        self.sql('CREATE POLICY unexpected ON role_permission_audit_events USING(true)')
        self.sql('BEGIN;'+self.migration+'COMMIT;',error='Unexpected global permission audit relation')
        self.sql('DROP POLICY unexpected ON role_permission_audit_events; ALTER TABLE role_permissions DISABLE TRIGGER audit_role_permissions')
        self.sql('BEGIN;'+self.migration+'COMMIT;',error='Unexpected existing role_permissions audit trigger')

    def test_defaults_constraints_and_owner_drift_fail_closed(self):
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        self.sql('ALTER TABLE role_permission_audit_events ALTER transaction_id SET DEFAULT 0')
        self.sql('BEGIN;'+self.migration+'COMMIT;',error='default contract drift')
        self.sql('ALTER TABLE role_permission_audit_events ALTER transaction_id SET DEFAULT txid_current(); ALTER TABLE role_permission_audit_events DROP CONSTRAINT role_permission_audit_actor_consistent')
        self.sql('BEGIN;'+self.migration+'COMMIT;',error='constraint contract drift')

    def test_release_preflight_rejects_fingerprints_replica_and_existing_target(self):
        for invalid in (generator.generate('0'*32,self.ledger_fingerprint),
                        generator.generate(self.fingerprint,'0'*32),
                        'SET session_replication_role=replica;'+self.release):
            self.sql(invalid,error='ERROR')
            self.assertEqual(self.sql("SELECT to_regclass('role_permission_audit_events') IS NULL"),'t')
            self.assertEqual(self.sql('SELECT count(*) FROM drizzle.__drizzle_migrations'),'1')
            self.assertEqual(self.sql("SELECT access_level FROM role_permissions WHERE role='dispatcher' AND module='Facturas'"),'read')
        self.sql("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ('already-target',1792470000000)")
        fp=self.sql("SELECT md5(string_agg(id::text || ':' || created_at::text || ':' || hash, ',' ORDER BY id)) FROM drizzle.__drizzle_migrations")
        self.sql(generator.generate(self.fingerprint,fp),error='ERROR')
        self.assertEqual(self.sql("SELECT to_regclass('role_permission_audit_events') IS NULL"),'t')
        self.assertEqual(self.sql('SELECT count(*) FROM drizzle.__drizzle_migrations'),'2')

    def test_ci_sql_contract_in_focused_fixture(self):
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        self.sql('CREATE TRIGGER booking_audit AFTER INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn()')
        try:
            self.sql((ROOT/'supabase/tests/rls/global_role_permission_audit.sql').read_text())
        finally:
            self.sql('DROP TRIGGER booking_audit ON bookings')
        self.assertEqual(self.sql('SELECT count(*) FROM role_permission_audit_events'),'0')

    def test_scope_coverage_gate_rejects_global_audit_grants(self):
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        source=(ROOT/'supabase/tests/rls/multi_org_scope_coverage.sql').read_text()
        start=source.index("    IF r.table_name = 'role_permission_audit_events' THEN")
        end=source.index('\n    IF r.tiene_org OR',start)
        block=source[start:end]
        gate="""DO $$ DECLARE r record; v_fallas text[] := ARRAY[]::text[];
          BEGIN
            SELECT 'role_permission_audit_events'::text AS table_name,
              EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='role_permission_audit_events'::regclass AND attname='organization_id' AND NOT attisdropped) AS tiene_org,
              (SELECT count(*) FROM pg_policy WHERE polrelid='role_permission_audit_events'::regclass) AS n_policies INTO r;
        """+block+"""
            IF cardinality(v_fallas)>0 THEN RAISE EXCEPTION '%',array_to_string(v_fallas, '; '); END IF;
          END $$;"""
        self.sql(gate)
        self.sql('GRANT SELECT ON role_permission_audit_events TO authenticated')
        self.sql(gate,error='exige global owner-only')
        self.sql('REVOKE SELECT ON role_permission_audit_events FROM authenticated')
        self.sql(gate)

    def platform_defaults(self):
        self.sql("""DO $$ BEGIN
          IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='qa_platform_sandbox') THEN CREATE ROLE qa_platform_sandbox BYPASSRLS; END IF;
          IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='qa_platform_project') THEN CREATE ROLE qa_platform_project BYPASSRLS; END IF;
          END $$;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO qa_platform_sandbox,qa_platform_project;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO qa_platform_project;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO qa_platform_sandbox,qa_platform_project;
          CREATE TABLE public.qa_unrelated_table(id serial, value text);
          CREATE FUNCTION public.qa_unrelated_function() RETURNS integer LANGUAGE sql AS 'SELECT 1';
        """)
        self.addCleanup(lambda: self.sql("""
          DROP TABLE IF EXISTS public.qa_unrelated_table;
          DROP FUNCTION IF EXISTS public.qa_unrelated_function();
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT,INSERT ON TABLES FROM qa_platform_sandbox,qa_platform_project;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM qa_platform_project;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT,USAGE ON SEQUENCES FROM qa_platform_sandbox,qa_platform_project;
        """))
        return self.platform_snapshot()

    def platform_snapshot(self):
        return self.sql("""SELECT jsonb_build_object(
          'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d),
          'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_class c WHERE relname IN ('qa_unrelated_table','qa_unrelated_table_id_seq')),
          'function',(SELECT to_jsonb(p) FROM pg_proc p WHERE oid='qa_unrelated_function()'::regprocedure),
          'sequences',(SELECT jsonb_agg(oid ORDER BY oid) FROM pg_class WHERE relkind='S'))""")

    def test_platform_defaults_are_hardened_only_on_new_audit_objects(self):
        before=self.platform_defaults()
        # Canonical migration remains fail-closed without this release prelude.
        self.sql('BEGIN;'+self.migration+'COMMIT;',error='owner-only')
        self.assertEqual(before,self.platform_snapshot())
        self.sql(self.release)
        self.assertEqual(before,self.platform_snapshot())
        for role in ('qa_platform_sandbox','qa_platform_project'):
            self.assertEqual(self.sql(f"SELECT has_table_privilege('{role}','role_permission_audit_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')"),'f')
            self.assertEqual(self.sql(f"SELECT has_function_privilege('{role}','audit_global_role_permission_change()','EXECUTE')"),'f')
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        self.assertEqual(before,self.platform_snapshot())
        for tag in generator.TAGS:
            digest=hashlib.sha256((ROOT/'drizzle/migrations'/f'{tag}.sql').read_bytes()).hexdigest()
            self.assertEqual(self.sql(f"SELECT count(*) FROM drizzle.__drizzle_migrations WHERE hash='{digest}'"),'1')

    def test_platform_default_release_failure_rolls_back_everything(self):
        before=self.platform_defaults()
        failing=self.release.replace('-- Record every target',"SELECT 1/0;\n-- Record every target")
        self.sql(failing,error='22012')
        self.assertEqual(before,self.platform_snapshot())
        self.assertEqual(self.sql("SELECT to_regclass('role_permission_audit_events') IS NULL AND to_regprocedure('audit_global_role_permission_change()') IS NULL"),'t')
        self.assertEqual(self.sql('SELECT count(*) FROM drizzle.__drizzle_migrations'),'1')
        self.assertEqual(self.sql("SELECT access_level FROM role_permissions WHERE role='dispatcher' AND module='Facturas'"),'read')
        self.assertEqual(self.sql("SELECT md5(pg_get_functiondef('get_customer_summary(uuid)'::regprocedure))"),self.fingerprint)
        self.assertEqual(self.sql("SELECT tgfoid::regprocedure::text FROM pg_trigger WHERE tgname='audit_role_permissions'"),'audit_trigger_fn()')

    def test_bootstrap_rejects_preexisting_objects_without_touching_them(self):
        self.sql('CREATE TABLE role_permission_audit_events(unexpected text)')
        self.sql(self.release,error='bootstrap objects already exist')
        self.assertEqual(self.sql("SELECT count(*) FROM information_schema.columns WHERE table_name='role_permission_audit_events'"),'1')
        self.sql("DROP TABLE role_permission_audit_events; CREATE FUNCTION audit_global_role_permission_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unrelated'; END $$")
        before=self.sql("SELECT pg_get_functiondef('audit_global_role_permission_change()'::regprocedure)")
        self.sql(self.release,error='bootstrap objects already exist')
        self.assertEqual(before,self.sql("SELECT pg_get_functiondef('audit_global_role_permission_change()'::regprocedure)"))
        self.assertEqual(self.sql('SELECT count(*) FROM drizzle.__drizzle_migrations'),'1')

    def test_failed_audit_insert_rolls_back_permission_change(self):
        self.sql('BEGIN;'+self.migration+'COMMIT;')
        self.sql("ALTER TABLE role_permission_audit_events ADD CONSTRAINT deliberate_failure CHECK(action <> 'UPDATE')")
        self.sql("UPDATE role_permissions SET access_level='none' WHERE role='dispatcher' AND module='Facturas'",error='23514')
        self.assertEqual(self.sql("SELECT access_level FROM role_permissions WHERE role='dispatcher' AND module='Facturas'"),'read')

if __name__=='__main__':
    unittest.main(verbosity=2)
