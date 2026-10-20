#!/usr/bin/env python3
"""Generate (never execute) the atomic 0111–0113 release SQL.

For a database verified at 0110. Requires a freshly read summary fingerprint.
No database URL, credentials, inferred organization or actor are accepted.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TAGS = (
    "0111_dispatcher_financial_permissions",
    "0112_dispatcher_customer_summary",
    "0113_global_role_permission_audit",
)
PRIOR_TAG = "0110_control0109_verified_release"


def generate(fingerprint, ledger_fingerprint, root=ROOT):
    if any(not re.fullmatch(r"[0-9a-f]{32}", value)
           for value in (fingerprint, ledger_fingerprint)):
        raise ValueError("Expected freshly verified lowercase MD5 fingerprints")
    directory = root / "drizzle/migrations"
    journal = json.loads((directory / "meta/_journal.json").read_text())["entries"]
    by_tag = {entry["tag"]: entry for entry in journal}
    prior = by_tag[PRIOR_TAG]
    targets = [by_tag[tag] for tag in TAGS]
    if [entry["idx"] for entry in targets] != [111, 112, 113]:
        raise ValueError("Unexpected migration order")
    if not prior["when"] < targets[0]["when"] < targets[1]["when"] < targets[2]["when"]:
        raise ValueError("Migration timestamps must be strictly ordered")
    payloads = [(directory / (tag + ".sql")).read_bytes() for tag in TAGS]
    hashes = [hashlib.sha256(payload).hexdigest() for payload in payloads]
    prior_hash = hashlib.sha256((directory / (PRIOR_TAG + ".sql")).read_bytes()).hexdigest()
    values = ",\n".join(
        f"('{digest}', {entry['when']})" for digest, entry in zip(hashes, targets)
    )
    sql111, sql112, sql113 = [payload.decode("utf-8") for payload in payloads]
    return f"""-- Generated only. Review and authorize the target before execution.
-- Canonical migration bytes remain unchanged; no tenant or actor is invented.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE drizzle.__drizzle_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.role_permissions IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'Normal trigger execution is required';
  END IF;
  IF (SELECT md5(string_agg(id::text || ':' || created_at::text || ':' || hash,
       ',' ORDER BY id)) FROM drizzle.__drizzle_migrations)
      IS DISTINCT FROM '{ledger_fingerprint}' THEN
    RAISE EXCEPTION 'Ledger changed after preflight';
  END IF;
  IF (SELECT max(created_at) FROM drizzle.__drizzle_migrations)
      IS DISTINCT FROM {prior['when']}::bigint THEN
    RAISE EXCEPTION 'Expected ledger head 0110; inspect current state, do not retry blindly';
  END IF;
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations
      WHERE created_at = {prior['when']} AND hash = '{prior_hash}') <> 1 THEN
    RAISE EXCEPTION '0110 receipt mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
      WHERE created_at >= {targets[0]['when']}
         OR hash IN ('{"','".join(hashes)}')) THEN
    RAISE EXCEPTION 'A target migration is already recorded';
  END IF;
  IF md5(pg_get_functiondef('public.get_customer_summary(uuid)'::regprocedure))
      IS DISTINCT FROM '{fingerprint}' THEN
    RAISE EXCEPTION 'Summary definition changed after preflight';
  END IF;
END $preflight$;
CREATE TEMP TABLE dispatcher_release_acl ON COMMIT DROP AS
  SELECT proacl, proowner, prosecdef, proconfig
  FROM pg_proc WHERE oid = 'public.get_customer_summary(uuid)'::regprocedure;

-- Bootstrap 0113 without advancing the migration ledger.
{sql113}
CREATE TEMP TABLE dispatcher_release_expected ON COMMIT DROP AS
  SELECT id FROM public.role_permissions
    WHERE role = 'dispatcher'
      AND module IN ('Facturas','Pagos','Gastos','MRR','Facturas de Proveedor',
        'Flujo de Caja','Cuentas Bancarias','Conciliación Bancaria')
      AND access_level <> 'none';
CREATE TEMP TABLE dispatcher_release_event_count ON COMMIT DROP AS
  SELECT count(*) AS total FROM public.role_permission_audit_events;
-- Apply the two reviewed, immutable migrations.
{sql111}
{sql112}
-- Prove the canonical 0113 replay is non-destructive/idempotent.
{sql113}
DO $postconditions$
BEGIN
  IF (SELECT count(*) FROM public.role_permission_audit_events) <>
      (SELECT total FROM dispatcher_release_event_count) +
      (SELECT count(*) FROM dispatcher_release_expected) THEN
    RAISE EXCEPTION 'Unexpected global audit event count';
  END IF;
  IF EXISTS (SELECT 1 FROM dispatcher_release_expected e WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permission_audit_events a
    WHERE a.record_id = e.id AND a.transaction_id = txid_current()
      AND a.action = 'UPDATE' AND a.new_data->>'access_level' = 'none'
      AND a.actor_user_id IS NOT DISTINCT FROM auth.uid()
      AND a.database_session_user = session_user
  )) THEN
    RAISE EXCEPTION 'Missing truthful permission audit event';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_permissions
      WHERE role = 'dispatcher'
        AND module IN ('Facturas','Pagos','Gastos','MRR','Facturas de Proveedor',
          'Flujo de Caja','Cuentas Bancarias','Conciliación Bancaria')
        AND access_level <> 'none') THEN
    RAISE EXCEPTION 'Dispatcher financial permission remains';
  END IF;
  IF EXISTS (
    SELECT proacl,proowner,prosecdef,proconfig FROM dispatcher_release_acl
    EXCEPT
    SELECT proacl,proowner,prosecdef,proconfig FROM pg_proc
      WHERE oid = 'public.get_customer_summary(uuid)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Summary ACL/owner/security configuration changed';
  END IF;
END $postconditions$;
-- Record every target in canonical order, only after all postconditions pass.
INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES
{values};
COMMIT;
"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-summary-md5", required=True)
    parser.add_argument("--expected-ledger-md5", required=True)
    args = parser.parse_args()
    print(generate(args.expected_summary_md5, args.expected_ledger_md5), end="")
