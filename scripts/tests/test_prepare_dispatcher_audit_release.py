"""Offline generator checks; database behavior is tested separately."""
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "prepare-dispatcher-audit-release.py"
SPEC = importlib.util.spec_from_file_location("dispatcher_release", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseGeneratorTests(unittest.TestCase):
    def test_rejects_missing_or_sql_injected_fingerprint(self):
        for value in ("", "x" * 32, "'; COMMIT;", "A" * 32):
            with self.subTest(value=value), self.assertRaises(ValueError):
                MODULE.generate(value, "b" * 32)
            with self.subTest(ledger=value), self.assertRaises(ValueError):
                MODULE.generate("a" * 32, value)

    def test_canonical_order_and_single_commit(self):
        sql = MODULE.generate("a" * 32, "b" * 32)
        self.assertTrue(sql.rstrip().endswith("COMMIT;"))
        self.assertEqual(sql.count("\nCOMMIT;"), 1)
        self.assertEqual(sql.count("INSERT INTO drizzle.__drizzle_migrations"), 1)
        self.assertLess(sql.index("-- Bootstrap 0113"), sql.index("-- Apply the two reviewed"))
        self.assertLess(sql.index("-- Prove the canonical 0113"), sql.index("-- Record every target"))
        self.assertIn("LOCK TABLE public.role_permissions", sql)
        self.assertIn("Summary definition changed after preflight", sql)
        self.assertIn("Summary ACL/owner/security configuration changed", sql)
        self.assertIn("Ledger changed after preflight", sql)
        self.assertIn("Missing truthful permission audit event", sql)
        self.assertNotIn("SET LOCAL app.organization_id", sql)
        self.assertNotIn("SET LOCAL request.jwt", sql)

    def test_payloads_are_exact_and_hashes_match(self):
        import hashlib
        sql = MODULE.generate("a" * 32, "b" * 32)
        for tag in MODULE.TAGS:
            data = (MODULE.ROOT / "drizzle/migrations" / (tag + ".sql")).read_bytes()
            self.assertIn(data.decode(), sql)
            self.assertIn(hashlib.sha256(data).hexdigest(), sql)


if __name__ == "__main__":
    unittest.main()
