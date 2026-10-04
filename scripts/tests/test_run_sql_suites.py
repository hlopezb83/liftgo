"""Regresiones de resultados falsamente verdes, sin conexión a una BD."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("sql_runner", ROOT / "scripts/run_sql_suites.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class SqlRunnerTests(unittest.TestCase):
    def run_result(self, mode, code=0, stdout="", stderr=""):
        result = subprocess.CompletedProcess(["psql"], code, stdout, stderr)
        with patch.object(runner.subprocess, "run", return_value=result) as execute:
            ok, _, _ = runner.run_file("unused-local-db", "unused.sql", mode)
        self.assertIn("ON_ERROR_STOP=1", execute.call_args.args[0])
        return ok

    def test_unexpected_sql_error_cannot_pass_with_zero_exit(self):
        for mode in ("strict", "smoke"):
            for message in (
                "ERROR: relation missing_table does not exist\n",
                "psql:test.sql:12: ERROR: current transaction is aborted\n",
                "FATAL: database is unavailable\n",
            ):
                with self.subTest(mode=mode, message=message):
                    self.assertFalse(self.run_result(mode, stderr=message))

    def test_nonzero_exit_fails_both_modes(self):
        for mode in ("strict", "smoke"):
            self.assertFalse(self.run_result(mode, code=3))

    def test_legacy_failed_assertion_fails_smoke(self):
        self.assertFalse(self.run_result("smoke", stderr="WARNING: FALLO expected balance\n"))

    def test_expected_error_caught_by_sql_is_not_an_unexpected_error(self):
        self.assertTrue(self.run_result("smoke", stderr="NOTICE: OK expected 42501 denied\n"))
        self.assertTrue(self.run_result("strict", stdout="OK\n"))

    def test_no_sql_suite_disables_error_stop(self):
        files = list((ROOT / "supabase/tests").rglob("*.sql"))
        self.assertGreater(len(files), 0)
        for path in files:
            with self.subTest(path=path.name):
                self.assertNotRegex(path.read_text(encoding="utf-8"), r"(?im)^\\set\s+ON_ERROR_STOP\s+off\b")


if __name__ == "__main__":
    unittest.main()
