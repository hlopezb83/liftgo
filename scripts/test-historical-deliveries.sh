#!/usr/bin/env bash
# Requires an EMPTY, disposable local PostgreSQL database and psql on PATH.
set -euo pipefail
case "${PGHOST:-}" in 127.0.0.1|localhost|/tmp/*) ;; *) echo 'Only an explicit local test host is supported' >&2; exit 1;; esac
case "${PGDATABASE:-}" in historical_delivery_test_*) ;; *) echo 'Use a disposable historical_delivery_test_* database' >&2; exit 1;; esac
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PSQL=(psql -X -v ON_ERROR_STOP=1)
"${PSQL[@]}" -c "DO \$\$ BEGIN IF current_user <> 'postgres' OR EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public') THEN RAISE EXCEPTION 'Requires postgres role and empty test database'; END IF; END \$\$;"
"${PSQL[@]}" -f "$ROOT/tests/sql/historical-delivery-fixture.sql"
if [[ "${HISTORICAL_TEST_DEFAULT_ACL:-0}" == 1 ]]; then
  "${PSQL[@]}" -f "$ROOT/tests/sql/historical-delivery-default-acl-fixture.sql"
fi
"${PSQL[@]}" -1 -f "$ROOT/drizzle/migrations/0126_delivery_historical_reconciliation.sql"
if [[ "${HISTORICAL_TEST_DEFAULT_ACL:-0}" == 1 ]]; then
  "${PSQL[@]}" -f "$ROOT/tests/sql/historical-delivery-default-acl-assertions.sql"
fi
"${PSQL[@]}" -c "UPDATE quotes SET quote_type='rental' WHERE id=(SELECT quote_id FROM invoices WHERE invoice_number='FAC-0026');"
if "${PSQL[@]}" -f "$ROOT/scripts/data-fixes/20261105_herren_historical_deliveries.sql"; then
  echo 'ERROR: mismatched sale accepted' >&2; exit 1
fi
"${PSQL[@]}" -c "DO \$\$ BEGIN IF EXISTS(SELECT FROM delivery_historical_reconciliations) OR EXISTS(SELECT FROM audit_logs) THEN RAISE EXCEPTION 'Not atomic'; END IF; END \$\$;"
"${PSQL[@]}" -c "UPDATE quotes SET quote_type='sale';"
"${PSQL[@]}" -f "$ROOT/scripts/data-fixes/20261105_herren_historical_deliveries.sql"
"${PSQL[@]}" -f "$ROOT/scripts/data-fixes/20261105_herren_historical_deliveries.sql"
"${PSQL[@]}" -f "$ROOT/tests/sql/historical-delivery-assertions.sql"
