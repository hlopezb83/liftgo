#!/usr/bin/env python3
"""Run the pinned receipt on the already replayed, disposable RLS CI database.

This is a read-only receipt check, not a migration or a ledger registration.
ACL snapshots describe the six inherited functions AFTER migration 0123;
they are evidence of receipt preservation, not a pre-0123 ACL baseline.
"""

from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
spec = spec_from_file_location("receipt_ci_database", ROOT / "scripts/ci_database.py")
ci = module_from_spec(spec)
spec.loader.exec_module(ci)

RECEIPT = Path("docs/audits/2026-11-04/release-0123/control0123-receipt.sql")
RECEIPT_BYTES = 10649
RECEIPT_SHA256 = "3eb80b20b5acb18bbfe9726050ae8c22aa62e77fd908a6dceea9468b06ddb52d"
RECEIPT_NOTICE = "control0123: 18 functions, 12 grants, 2 tables, 7 triggers verified"
COMPLETE = "PASS control0123-receipt COMPLETE ledger=unchanged acl=unchanged functions=6"
PREFIX = "CONTROL0123_"
FUNCTIONS = (
    "public.get_quote_charge_availability(uuid[],uuid)",
    "public.guard_booking_quote_charge_origin()",
    "public.lock_invoice_quote_charge_link_change()",
    "public.normalize_quote_charge_identities()",
    "public.enforce_invoice_quote_charges()",
    "public.validate_invoice_quote_charge_links()",
)
ROLES = ("anon", "authenticated", "service_role")

LEDGER_SQL = """SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb)
FROM drizzle.__drizzle_migrations m"""
ACL_SQL = """SELECT jsonb_agg(jsonb_build_object(
  'signature', f.signature, 'exists', p.oid IS NOT NULL, 'oid', p.oid::bigint,
  'owner_oid', p.proowner::bigint, 'owner_name', pg_get_userbyid(p.proowner),
  'proacl', p.proacl::text,
  'acl_entries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'grantor_oid', a.grantor::bigint, 'grantor_name', pg_get_userbyid(a.grantor),
    'grantee_oid', a.grantee::bigint,
    'grantee_name', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'privilege_type', a.privilege_type, 'is_grantable', a.is_grantable
  ) ORDER BY a.grantor, a.grantee, a.privilege_type, a.is_grantable)
    FROM aclexplode(p.proacl) a), '[]'::jsonb),
  'effective_execute', jsonb_build_object(
    'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE'))
) ORDER BY f.signature)
FROM (VALUES
  ('public.get_quote_charge_availability(uuid[],uuid)'),
  ('public.guard_booking_quote_charge_origin()'),
  ('public.lock_invoice_quote_charge_link_change()'),
  ('public.normalize_quote_charge_identities()'),
  ('public.enforce_invoice_quote_charges()'),
  ('public.validate_invoice_quote_charge_links()')
) f(signature)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.signature)"""


def checked_receipt(root: Path) -> bytes:
    path = root / RECEIPT
    if path.is_symlink() or not path.is_file():
        raise ValueError("Pinned receipt must be a regular, non-symlink file")
    data = path.read_bytes()
    if len(data) != RECEIPT_BYTES or hashlib.sha256(data).hexdigest() != RECEIPT_SHA256:
        raise ValueError("Pinned receipt bytes or SHA256 changed; review required")
    return data


def observation(label: str, query: str) -> str:
    return f"SELECT '{PREFIX}{label}=' || ({query})::text;\n"


def sql_input(receipt: bytes) -> bytes:
    # Send the checked buffer itself, never reread it through psql \i or a copy.
    before = (
        "SET client_encoding = 'UTF8';\n"
        "SET client_min_messages = NOTICE;\n"
        "SET default_transaction_read_only = on;\n"
        + observation("LEDGER_PRE", LEDGER_SQL)
        + observation("ACL_PRE", ACL_SQL)
        + "BEGIN READ ONLY;\n"
        "SET LOCAL statement_timeout = '30s';\n"
        "SET LOCAL lock_timeout = '5s';\n"
    )
    after = (
        f"\n\\echo {PREFIX}EXECUTED\n"
        "ROLLBACK;\n"
        + observation("LEDGER_POST", LEDGER_SQL)
        + observation("ACL_POST", ACL_SQL)
        + f"\\echo {PREFIX}PSQL_COMPLETE\n"
    )
    return before.encode("utf-8") + receipt + after.encode("utf-8")


def json_marker(lines: list[str], label: str):
    marker = PREFIX + label + "="
    matches = [line[len(marker):] for line in lines if line.startswith(marker)]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {label} observation")
    try:
        return json.loads(matches[0])
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid {label} JSON") from error


def positive_integer(value) -> bool:
    return type(value) is int and value > 0


def validate_ledger(rows) -> None:
    if not isinstance(rows, list) or not rows:
        raise ValueError("Expected a nonempty, replayed migration ledger")
    previous = 0
    for row in rows:
        if not isinstance(row, dict) or not positive_integer(row.get("id")) \
                or row["id"] <= previous or not positive_integer(row.get("created_at")) \
                or not isinstance(row.get("hash"), str) or not re.fullmatch(r"[0-9a-f]{64}", row["hash"]):
            raise ValueError("Invalid or unordered migration ledger observation")
        previous = row["id"]


def validate_acl(rows) -> None:
    if not isinstance(rows, list) or len(rows) != len(FUNCTIONS) \
            or [row.get("signature") if isinstance(row, dict) else None for row in rows] != sorted(FUNCTIONS):
        raise ValueError("Expected the exact six inherited function ACL observations")
    for row in rows:
        if row.get("exists") is not True or not positive_integer(row.get("oid")) \
                or not positive_integer(row.get("owner_oid")) or not isinstance(row.get("owner_name"), str) \
                or not row["owner_name"] or (row.get("proacl") is not None and not isinstance(row["proacl"], str)) \
                or "proacl" not in row or not isinstance(row.get("acl_entries"), list):
            raise ValueError("Incomplete inherited function owner or raw ACL observation")
        effective = row.get("effective_execute")
        if not isinstance(effective, dict) or set(effective) != set(ROLES) \
                or any(type(effective[role]) is not bool for role in ROLES):
            raise ValueError("Incomplete effective EXECUTE evidence")
        for entry in row["acl_entries"]:
            if not isinstance(entry, dict) or not positive_integer(entry.get("grantor_oid")) \
                    or type(entry.get("grantee_oid")) is not int or entry["grantee_oid"] < 0 \
                    or any(not isinstance(entry.get(key), str) or not entry[key]
                           for key in ("grantor_name", "grantee_name", "privilege_type")) \
                    or type(entry.get("is_grantable")) is not bool:
                raise ValueError("Incomplete grantor, grantee or grant-option evidence")


def checked_output(stdout: bytes, stderr: bytes) -> dict:
    lines = stdout.decode("utf-8").splitlines()
    notices = stderr.decode("utf-8").splitlines()
    if any(re.search(r"(?:^|\s)(?:ERROR|FATAL|PANIC|WARNING):", line) for line in lines + notices):
        raise ValueError("psql emitted an SQL error or warning")
    expected_notice = re.compile(r"^NOTICE:\s+" + re.escape(RECEIPT_NOTICE) + r"$")
    if sum(bool(expected_notice.fullmatch(line)) for line in notices) != 1:
        raise ValueError("Expected exactly one successful source receipt NOTICE")
    expected_labels = ("LEDGER_PRE", "ACL_PRE", "EXECUTED", "LEDGER_POST", "ACL_POST", "PSQL_COMPLETE")
    markers = [line for line in lines if line.startswith(PREFIX)]
    if len(markers) != len(expected_labels) or any(
        not (line == PREFIX + label if label in ("EXECUTED", "PSQL_COMPLETE")
             else line.startswith(PREFIX + label + "="))
        for line, label in zip(markers, expected_labels)
    ):
        raise ValueError("Missing, duplicate or out-of-order receipt completion markers")
    ledger_pre = json_marker(lines, "LEDGER_PRE")
    ledger_post = json_marker(lines, "LEDGER_POST")
    acl_pre = json_marker(lines, "ACL_PRE")
    acl_post = json_marker(lines, "ACL_POST")
    validate_ledger(ledger_pre)
    validate_ledger(ledger_post)
    validate_acl(acl_pre)
    validate_acl(acl_post)
    if ledger_pre != ledger_post:
        raise ValueError("Receipt changed the migration ledger")
    if acl_pre != acl_post:
        raise ValueError("Receipt changed inherited function ownership or privileges")
    return {"ledger_pre": ledger_pre, "ledger_post": ledger_post, "acl_pre": acl_pre, "acl_post": acl_post}


def run_receipt(env: dict[str, str], root: Path = ROOT) -> dict:
    ci.require_local_ci(env)
    reports = root / "reports"
    reports.mkdir(exist_ok=True)
    for name in ("control0123-receipt-psql.stdout.log", "control0123-receipt-psql.stderr.log",
                 "control0123-receipt-evidence.json"):
        (reports / name).unlink(missing_ok=True)
    receipt = checked_receipt(root)
    # Inherited libpq options cannot redirect or weaken the fixed CI session.
    process_env = {key: value for key, value in env.items()
                   if not key.upper().startswith("PG") and key.upper() != "PSQLRC"}
    process_env["PGCLIENTENCODING"] = "UTF8"
    result = subprocess.run(
        ["psql", "-X", "-w", "--set=ON_ERROR_STOP=1", "--no-align", "--tuples-only", "--quiet",
         "--pset=pager=off", "--dbname", ci.LOCAL_DB_URL],
        input=sql_input(receipt), capture_output=True, env=process_env, cwd=root, timeout=60,
    )
    (reports / "control0123-receipt-psql.stdout.log").write_bytes(result.stdout)
    (reports / "control0123-receipt-psql.stderr.log").write_bytes(result.stderr)
    if result.returncode != 0:
        raise ValueError(f"Receipt psql failed with exit {result.returncode}; see reports/control0123-receipt-psql.stderr.log")
    observed = checked_output(result.stdout, result.stderr)
    evidence = {
        "scope": "Disposable RLS CI database after full Drizzle replay; read-only receipt, no migration registration",
        "acl_capture_point": "After migration 0123, immediately before and after the receipt; not a pre-0123 baseline",
        "receipt_path": RECEIPT.as_posix(), "receipt_bytes": len(receipt), "receipt_sha256": RECEIPT_SHA256,
        "source_notice": RECEIPT_NOTICE, "ledger_unchanged": True, "acl_unchanged": True,
        **observed,
    }
    (reports / "control0123-receipt-evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    return evidence


def main() -> int:
    try:
        if len(sys.argv) != 1:
            raise ValueError("Usage: python3 scripts/tests/run_control0123_receipt.py")
        evidence = run_receipt(dict(os.environ))
        print(f"PASS control0123-receipt SHA256 {evidence['receipt_sha256']} bytes={evidence['receipt_bytes']}")
        print(f"PASS control0123-receipt SOURCE {RECEIPT_NOTICE}")
        print(COMPLETE)
        return 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"control0123 receipt failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
