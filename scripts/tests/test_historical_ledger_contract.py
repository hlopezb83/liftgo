#!/usr/bin/env python3
"""Execute the exact multi-org ledger gate on isolated PostgreSQL, including drift.

Opt in with RUN_LOCAL_SUMMARY_TESTS=1 and loopback PGHOST/PGPORT/PGUSER.
Uses the shared random disposable database fixture; never a product database.
This focused catalog regression complements, not replaces, full RLS replay.
"""
import os
import unittest
import test_dispatcher_customer_summary as fixture


@unittest.skipUnless(os.getenv('RUN_LOCAL_SUMMARY_TESTS') == '1', 'explicit local PostgreSQL opt-in required')
class HistoricalLedgerContractTests(unittest.TestCase):
    sql = classmethod(fixture.SummaryTests.sql.__func__)

    @classmethod
    def setUpClass(cls):
        fixture.SummaryTests.setUpClass.__func__(cls)
        cls.sql('''
          CREATE TABLE deliveries(id uuid PRIMARY KEY,organization_id uuid,type text,status text);
          CREATE FUNCTION organization_scope_matches(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          CREATE FUNCTION today_mty() RETURNS date LANGUAGE sql AS $$ SELECT current_date $$;
        ''')
        cls.sql((fixture.ROOT/'drizzle/migrations/0126_delivery_historical_reconciliation.sql').read_text())
        suite=(fixture.ROOT/'supabase/tests/rls/multi_org_scope_coverage.sql').read_text()
        cls.contract=suite.split('-- BEGIN historical ledger contract',1)[1]
        cls.contract=cls.contract[cls.contract.index('DO $ledger_contract$'):].split('-- END historical ledger contract.',1)[0]
        cls.sql('CREATE FUNCTION wrong_ledger_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;')

    def test_actual_0126_contract_passes(self):
        self.sql(self.contract)

    def test_inherited_owner_column_select_is_rejected(self):
        # Owners can revoke their ordinary table privileges while retaining
        # column privileges. Membership inherits those column grants without
        # inheriting the owner's SUPERUSER attribute. Everything rolls back.
        mutation = """DO $$ BEGIN
          EXECUTE format('REVOKE ALL ON delivery_historical_reconciliations FROM %I', current_user);
          EXECUTE format('GRANT SELECT(evidence) ON delivery_historical_reconciliations TO %I', current_user);
          EXECUTE format('GRANT %I TO anon', current_user);
          IF has_table_privilege('anon','delivery_historical_reconciliations','SELECT')
             OR NOT has_any_column_privilege('anon','delivery_historical_reconciliations','SELECT') THEN
            RAISE EXCEPTION 'Inherited-column fixture did not isolate the intended privilege';
          END IF;
        END $$;"""
        self.sql('BEGIN;'+mutation+self.contract+'ROLLBACK;',
                 error='historical ledger contract: effective privileges drift for anon')
        self.sql(self.contract)

    def test_mutations_fail_closed_and_leave_baseline_intact(self):
        table='public.delivery_historical_reconciliations'
        mutations=[
            f'GRANT INSERT ON {table} TO authenticated',
            f'GRANT SELECT ON {table} TO anon',
            f'GRANT SELECT ON {table} TO service_role',
            f'GRANT SELECT ON {table} TO PUBLIC',
            f'GRANT SELECT ON {table} TO authenticated WITH GRANT OPTION',
            f'REVOKE SELECT ON {table} FROM authenticated',
            f'GRANT UPDATE(reason) ON {table} TO authenticated',
            f'GRANT SELECT(evidence) ON {table} TO anon',
            f'ALTER TABLE {table} DISABLE ROW LEVEL SECURITY',
            f'ALTER TABLE {table} ALTER COLUMN organization_id DROP NOT NULL',
            f'CREATE POLICY unexpected ON {table} USING(true)',
            f'ALTER POLICY visible_delivery ON {table} USING(true)',
            f'ALTER POLICY org_scope_isolation ON {table} USING(true)',
            f'ALTER POLICY visible_delivery ON {table} TO PUBLIC',
            f'ALTER TABLE {table} DISABLE TRIGGER guard_delivery_historical_reconciliation',
            f'ALTER TABLE {table} DISABLE TRIGGER audit_delivery_historical_reconciliation',
            f'DROP TRIGGER guard_delivery_historical_reconciliation ON {table}',
            f'DROP TRIGGER audit_delivery_historical_reconciliation ON {table}',
            f'''DROP TRIGGER guard_delivery_historical_reconciliation ON {table};
                CREATE TRIGGER guard_delivery_historical_reconciliation BEFORE INSERT OR UPDATE OR DELETE
                ON {table} FOR EACH ROW EXECUTE FUNCTION wrong_ledger_trigger()''',
            f'''DROP TRIGGER audit_delivery_historical_reconciliation ON {table};
                CREATE TRIGGER audit_delivery_historical_reconciliation AFTER INSERT
                ON {table} FOR EACH ROW EXECUTE FUNCTION audit_delivery_historical_reconciliation()''',
            'GRANT EXECUTE ON FUNCTION guard_delivery_historical_reconciliation() TO authenticated',
            'GRANT EXECUTE ON FUNCTION audit_delivery_historical_reconciliation() TO PUBLIC',
            'ALTER FUNCTION guard_delivery_historical_reconciliation() SECURITY DEFINER',
            'ALTER FUNCTION audit_delivery_historical_reconciliation() SET search_path=public',
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                # Each psql connection closes on the expected error, rolling back
                # the mutation. The following connection verifies the baseline.
                self.sql('BEGIN;'+mutation+';'+self.contract+'ROLLBACK;',error='historical ledger contract:')
                self.sql(self.contract)


if __name__ == '__main__':
    unittest.main()
