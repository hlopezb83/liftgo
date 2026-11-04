"""Offline process/guard tests; these do not execute receipt SQL or a database."""

from importlib.util import module_from_spec, spec_from_file_location
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

spec = spec_from_file_location("control0123_receipt_runner", Path(__file__).with_name("run_control0123_receipt.py"))
runner = module_from_spec(spec)
spec.loader.exec_module(runner)

ENV = {"GITHUB_ACTIONS": "true", "DB_URL": runner.ci.LOCAL_DB_URL}
PIN = "3eb80b20b5acb18bbfe9726050ae8c22aa62e77fd908a6dceea9468b06ddb52d"


def ledger():
    return [{"id": 1, "hash": "a" * 64, "created_at": 1700000000000},
            {"id": 3, "hash": "b" * 64, "created_at": 1700000000001}]


def acls():
    # Deliberately retain observed extra privileges and grant options. The runner
    # must record them, not assume zero grants or silently rewrite a baseline.
    return [{"signature": signature, "exists": True, "oid": 100 + index,
             "owner_oid": 10, "owner_name": "fixture_owner",
             "proacl": "{fixture_reader=X*/fixture_owner}",
             "acl_entries": [{"grantor_oid": 10, "grantor_name": "fixture_owner",
                              "grantee_oid": 0, "grantee_name": "PUBLIC",
                              "privilege_type": "EXECUTE", "is_grantable": True}],
             "effective_execute": {"anon": True, "authenticated": True, "service_role": True}}
            for index, signature in enumerate(sorted(runner.FUNCTIONS))]


def output(*, ledger_pre=None, ledger_post=None, acl_post=None):
    rows = ledger() if ledger_pre is None else ledger_pre
    functions = acls()
    lines = [runner.PREFIX + "LEDGER_PRE=" + json.dumps(rows),
             runner.PREFIX + "ACL_PRE=" + json.dumps(functions),
             runner.PREFIX + "EXECUTED",
             runner.PREFIX + "LEDGER_POST=" + json.dumps(rows if ledger_post is None else ledger_post),
             runner.PREFIX + "ACL_POST=" + json.dumps(functions if acl_post is None else acl_post),
             runner.PREFIX + "PSQL_COMPLETE"]
    return ("\n".join(lines) + "\n").encode(), ("NOTICE:  " + runner.RECEIPT_NOTICE + "\n").encode()


class ReceiptRunnerTests(unittest.TestCase):
    def fixture(self, data=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        path = root / runner.RECEIPT
        path.parent.mkdir(parents=True)
        path.write_bytes(runner.checked_receipt(runner.ROOT) if data is None else data)
        return root

    def test_independent_exact_source_pin(self):
        data = runner.checked_receipt(runner.ROOT)
        self.assertEqual(len(data), 10649)
        self.assertEqual(hashlib.sha256(data).hexdigest(), PIN)
        self.assertEqual(runner.RECEIPT_SHA256, PIN)
        self.assertEqual(runner.RECEIPT_BYTES, 10649)
        self.assertNotIn(b"\r", data)
        self.assertTrue(data.endswith(b"\n"))
        canonical = runner.ROOT / "drizzle/migrations/0124_control0123_verified_release.sql"
        self.assertEqual(canonical.read_bytes(), data, "Canonical 0124 must retain the exact reviewed receipt bytes")

    def test_already_registered_0124_ledger_is_preserved_without_another_record(self):
        rows = [
            {"id": 123, "hash": "8303a6bcbf0846555a77ec00e8f7fe1dd7656462181c72fdac7f23373b96c681",
             "created_at": 1793746800000},
            {"id": 124, "hash": PIN, "created_at": 1793809897588},
        ]
        observed = runner.checked_output(*output(ledger_pre=rows))
        self.assertEqual(observed["ledger_pre"], rows)
        self.assertEqual(observed["ledger_post"], rows)
        self.assertEqual(len(observed["ledger_post"]), 2)
        self.assertEqual(sum(row["hash"] == PIN for row in observed["ledger_post"]), 1)

    def test_rejects_non_ci_or_other_database_before_process(self):
        for env in ({}, {"DB_URL": runner.ci.LOCAL_DB_URL},
                    {**ENV, "DB_URL": "postgresql://postgres:postgres@localhost:54322/postgres"},
                    {**ENV, "DB_URL": "postgresql://remote.invalid/postgres"}):
            with self.subTest(env=env), mock.patch.object(runner.subprocess, "run") as process, \
                    mock.patch.object(runner, "checked_receipt") as source, self.assertRaises(ValueError):
                runner.run_receipt(env)
            source.assert_not_called()
            process.assert_not_called()

    def test_source_mutations_never_launch_psql(self):
        original = runner.checked_receipt(runner.ROOT)
        for data in (original + b"\n", original.replace(b"\n", b"\r\n"),
                     b"\xef\xbb\xbf" + original, original.replace(b"portable", b"PORTABLE", 1)):
            with self.subTest(length=len(data)), mock.patch.object(runner.subprocess, "run") as process, \
                    self.assertRaisesRegex(ValueError, "review required"):
                runner.run_receipt(ENV, self.fixture(data))
            process.assert_not_called()

    def test_missing_source_fails_without_process(self):
        root = self.fixture()
        (root / runner.RECEIPT).unlink()
        with mock.patch.object(runner.subprocess, "run") as process, self.assertRaises(ValueError):
            runner.run_receipt(ENV, root)
        process.assert_not_called()

    def test_checked_buffer_is_executed_once_with_readonly_wrapper(self):
        root = self.fixture()
        original = (root / runner.RECEIPT).read_bytes()

        def process(command, **kwargs):
            # A changed file after the hash check cannot replace the checked SQL.
            (root / runner.RECEIPT).write_bytes(b"SELECT 'unchecked';")
            self.assertEqual(command[0:3], ["psql", "-X", "-w"])
            self.assertIn("--set=ON_ERROR_STOP=1", command)
            self.assertEqual(command[-2:], ["--dbname", runner.ci.LOCAL_DB_URL])
            sql = kwargs["input"]
            self.assertIsInstance(sql, bytes)
            self.assertEqual(sql.count(original), 1)
            self.assertLess(sql.index(b"BEGIN READ ONLY;"), sql.index(original))
            self.assertLess(sql.index(original), sql.index(b"ROLLBACK;"))
            self.assertLess(sql.index(b"ROLLBACK;"), sql.index(b"CONTROL0123_LEDGER_POST="))
            self.assertGreater(sql.index(b"CONTROL0123_PSQL_COMPLETE"), sql.index(b"CONTROL0123_ACL_POST="))
            self.assertNotIn(b"\\i ", sql)
            self.assertNotIn(b"INSERT INTO", sql)
            self.assertEqual(kwargs["timeout"], 60)
            self.assertEqual(kwargs["cwd"], root)
            self.assertEqual(kwargs["env"]["PGCLIENTENCODING"], "UTF8")
            for name in ("PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PSQLRC", "PGHOSTADDR", "PGPASSFILE",
                         "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"):
                self.assertNotIn(name, kwargs["env"])
            return subprocess.CompletedProcess(command, 0, *output())

        env = {**ENV, "PGOPTIONS": "-c default_transaction_read_only=off", "PGSERVICE": "other",
               "PGSERVICEFILE": "/other", "PSQLRC": "/other", "PGHOSTADDR": "203.0.113.1",
               "PGPASSFILE": "/other", "PGHOST": "remote.invalid", "PGPORT": "5432", "PGUSER": "other",
               "PGPASSWORD": "synthetic", "PGDATABASE": "other"}
        with mock.patch.object(runner.subprocess, "run", side_effect=process) as call:
            evidence = runner.run_receipt(env, root)
        self.assertEqual(call.call_count, 1)
        saved = json.loads((root / "reports/control0123-receipt-evidence.json").read_text(encoding="utf-8"))
        self.assertEqual(saved, evidence)
        self.assertEqual(evidence["receipt_sha256"], PIN)
        self.assertEqual(evidence["acl_pre"], acls())
        self.assertTrue(evidence["ledger_unchanged"])
        self.assertIn("not a pre-0123 baseline", evidence["acl_capture_point"])

    def test_nonzero_exit_cannot_pass_even_with_valid_markers(self):
        root = self.fixture()
        with mock.patch.object(runner.subprocess, "run", return_value=subprocess.CompletedProcess([], 3, *output())), \
                self.assertRaisesRegex(ValueError, "exit 3"):
            runner.run_receipt(ENV, root)
        self.assertFalse((root / "reports/control0123-receipt-evidence.json").exists())
        self.assertTrue((root / "reports/control0123-receipt-psql.stderr.log").exists())

    def test_timeout_and_missing_binary_cannot_pass(self):
        for error in (subprocess.TimeoutExpired("psql", 60), FileNotFoundError("psql absent")):
            root = self.fixture()
            with self.subTest(error=type(error).__name__), mock.patch.object(runner.subprocess, "run", side_effect=error), \
                    self.assertRaises(type(error)):
                runner.run_receipt(ENV, root)
            self.assertFalse((root / "reports/control0123-receipt-evidence.json").exists())

    def test_failed_attempt_cannot_leave_stale_success_evidence(self):
        for mode in ("hash", "exit", "markers", "timeout"):
            root = self.fixture()
            reports = root / "reports"
            reports.mkdir()
            for name in ("control0123-receipt-evidence.json", "control0123-receipt-psql.stdout.log",
                         "control0123-receipt-psql.stderr.log"):
                (reports / name).write_text("STALE SUCCESS", encoding="utf-8")
            if mode == "hash":
                (root / runner.RECEIPT).write_bytes(b"unchecked")
            result = subprocess.CompletedProcess([], 3 if mode == "exit" else 0, b"", b"")
            error = subprocess.TimeoutExpired("psql", 60) if mode == "timeout" else None
            with self.subTest(mode=mode), mock.patch.object(runner.subprocess, "run", return_value=result, side_effect=error), \
                    self.assertRaises((ValueError, subprocess.TimeoutExpired)):
                runner.run_receipt(ENV, root)
            self.assertFalse((reports / "control0123-receipt-evidence.json").exists())
            for path in reports.iterdir():
                self.assertNotIn(b"STALE SUCCESS", path.read_bytes())

    def test_missing_duplicate_or_reordered_markers_are_rejected(self):
        stdout, stderr = output()
        lines = stdout.splitlines()
        variants = [b"", b"\n".join(lines[:-1]), b"\n".join(lines[1:]),
                    stdout + lines[-1] + b"\n", stdout + b"CONTROL0123_UNKNOWN\n",
                    b"\n".join([lines[1], lines[0], *lines[2:]])]
        for value in variants:
            with self.subTest(value=value[:50]), self.assertRaises(ValueError):
                runner.checked_output(value, stderr)

    def test_exact_source_notice_is_required_once(self):
        stdout, stderr = output()
        for value in (b"", stderr + stderr, stderr.replace(b"18 functions", b"17 functions"),
                      b"NOTICE: skipped receipt\n"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                runner.checked_output(stdout, value)

    def test_sql_errors_and_warnings_fail_closed(self):
        stdout, stderr = output()
        for severity in ("ERROR", "FATAL", "PANIC", "WARNING"):
            with self.subTest(severity=severity), self.assertRaises(ValueError):
                runner.checked_output(stdout, stderr + f"{severity}: SQL failed\n".encode())

    def test_missing_malformed_or_null_json_is_rejected(self):
        stdout, stderr = output()
        for label in ("LEDGER_PRE", "LEDGER_POST", "ACL_PRE", "ACL_POST"):
            for payload in ("null", "{}", "[]", "not-json"):
                lines = stdout.decode().splitlines()
                marker = runner.PREFIX + label + "="
                changed = "\n".join(marker + payload if line.startswith(marker) else line for line in lines).encode()
                with self.subTest(label=label, payload=payload), self.assertRaises(ValueError):
                    runner.checked_output(changed, stderr)

    def test_any_ledger_row_change_is_rejected(self):
        for key, value in (("id", 4), ("hash", "c" * 64), ("created_at", 1700000000002)):
            changed = ledger()
            changed[-1][key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "changed the migration ledger"):
                runner.checked_output(*output(ledger_post=changed))
        for changed in (ledger()[:-1], ledger() + [{"id": 4, "hash": "d" * 64, "created_at": 1700000000003}]):
            with self.subTest(length=len(changed)), self.assertRaises(ValueError):
                runner.checked_output(*output(ledger_post=changed))

    def test_invalid_or_duplicate_ledger_identity_is_rejected(self):
        for key, value in (("id", True), ("id", 1), ("hash", "invalid"), ("created_at", None)):
            changed = ledger()
            changed[-1][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                runner.checked_output(*output(ledger_post=changed))

    def test_acl_raw_owner_grants_and_effective_changes_are_rejected(self):
        for key, value in (("owner_name", "another_owner"), ("owner_oid", 99), ("proacl", None)):
            changed = acls()
            changed[0][key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "changed inherited function"):
                runner.checked_output(*output(acl_post=changed))
        for key, value in (("grantor_oid", 11), ("grantee_oid", 22), ("is_grantable", False)):
            changed = acls()
            changed[0]["acl_entries"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                runner.checked_output(*output(acl_post=changed))
        for role in runner.ROLES:
            changed = acls()
            changed[0]["effective_execute"][role] = False
            with self.subTest(role=role), self.assertRaises(ValueError):
                runner.checked_output(*output(acl_post=changed))

    def test_exact_six_functions_and_complete_acl_evidence_required(self):
        changes = [acls()[:-1], [acls()[0]] * 6]
        for key in ("signature", "owner_name", "proacl", "acl_entries", "effective_execute"):
            value = acls()
            del value[0][key]
            changes.append(value)
        missing = acls()
        missing[0]["exists"] = False
        changes.append(missing)
        for changed in changes:
            with self.subTest(changed=changed[0]), self.assertRaises(ValueError):
                runner.checked_output(*output(acl_post=changed))

    def test_raw_null_acl_and_observed_extra_grants_are_preserved(self):
        stdout, stderr = output()
        observed = runner.checked_output(stdout, stderr)
        self.assertTrue(observed["acl_pre"][0]["effective_execute"]["anon"])
        value = acls()
        value[0]["proacl"] = None
        value[0]["acl_entries"] = []
        runner.validate_acl(value)

    def test_main_only_prints_complete_after_success(self):
        evidence = {"receipt_sha256": PIN, "receipt_bytes": 10649}
        for error in (ValueError("missing marker"), subprocess.TimeoutExpired("psql", 60), FileNotFoundError("psql")):
            with mock.patch.object(runner.sys, "argv", ["runner"]), \
                    mock.patch.object(runner, "run_receipt", side_effect=error), \
                    contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(runner.main(), 1)
            self.assertNotIn(runner.COMPLETE, stdout.getvalue())
        with mock.patch.object(runner.sys, "argv", ["runner"]), \
                mock.patch.object(runner, "run_receipt", return_value=evidence), \
                contextlib.redirect_stdout(io.StringIO()) as stdout:
            self.assertEqual(runner.main(), 0)
        self.assertEqual(stdout.getvalue().splitlines().count(runner.COMPLETE), 1)

    def test_workflow_requires_receipt_after_replay_before_any_fixtures(self):
        text = (runner.ROOT / ".github/workflows/rls-db-tests.yml").read_text(encoding="utf-8")
        name = "      - name: Verify exact control0123 receipt on full replayed schema"
        start = text.index(name)
        end = text.index("      - name:", start + len(name))
        step = text[start:end]
        self.assertLess(text.index("bun scripts/ci-drizzle-replay.mjs verify"), start)
        self.assertLess(start, text.index("Recurring invoice locking regression"))
        self.assertLess(start, text.index("RLS suites (supabase/tests/rls/*.sql)"))
        self.assertIn("set -euo pipefail", step)
        self.assertIn("python3 scripts/tests/run_control0123_receipt.py 2>&1 | tee reports/control0123-receipt.log", step)
        self.assertIn("grep -Fxc '" + runner.COMPLETE + "'", step)
        self.assertNotIn("continue-on-error", step)
        self.assertEqual(text.count('      - "' + runner.RECEIPT.as_posix() + '"'), 2)
        self.assertIn("python3 -m unittest discover -s scripts/tests -p test_control0123_receipt.py", text)


if __name__ == "__main__":
    unittest.main()
