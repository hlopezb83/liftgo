"""Pruebas offline del kit de activación Facturapi 6 (sin red, sin backend).

Nunca escriben en supabase/functions: todo ocurre en carpetas temporales.
Ejecutar: python3 -m unittest discover -s qa/facturapi6-phase4 -p 'test_*.py'
"""
from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

KIT = Path(__file__).resolve().parent
REPO = KIT.parents[1]
REAL_FUNCTIONS = REPO / "supabase" / "functions"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, KIT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


act = _load("activation")
bm = _load("build_manifest")
MANIFEST = act.load_manifest()
RUN_ID = "fx6-prod-20261111T1300Z"
IN_WINDOW = datetime(2026, 11, 11, 13, 20, tzinfo=timezone.utc)


def _strip_sql_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


class TempTree(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.functions = self.root / "supabase" / "functions"
        for entry in MANIFEST["files"]:
            if entry["base_sha256"] is not None:
                dest = self.functions / entry["path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(KIT / "rollback" / entry["path"], dest)

    def tearDown(self):
        self._tmp.cleanup()

    def snapshot(self) -> dict[str, bytes]:
        return {
            str(p.relative_to(self.functions)): p.read_bytes()
            for p in sorted(self.functions.rglob("*"))
            if p.is_file()
        }


class KitIntegrity(unittest.TestCase):
    def test_kit_matches_manifest(self):
        act.verify_kit(MANIFEST)

    def test_manifest_is_current(self):
        self.assertEqual(bm.build(), MANIFEST)

    def test_real_tree_is_base_or_applied_never_mixed(self):
        self.assertIn(act.tree_state(MANIFEST, REAL_FUNCTIONS), {"base", "applied"})

    def test_deno_json_pins_exact_versions(self):
        staged = json.loads((KIT / "staged" / "deno.json").read_text())
        base = json.loads((KIT / "rollback" / "deno.json").read_text())
        self.assertEqual(staged["imports"]["facturapi"], "npm:facturapi@6.0.0")
        self.assertEqual(base["imports"]["facturapi"], "npm:facturapi@5.2.0")
        other = {k: v for k, v in staged["imports"].items() if k != "facturapi"}
        self.assertEqual(other, {k: v for k, v in base["imports"].items() if k != "facturapi"})

    def test_lock_changes_only_facturapi_with_registry_integrity(self):
        staged = (KIT / "staged" / "deno.lock").read_text().splitlines()
        base = (KIT / "rollback" / "deno.lock").read_text().splitlines()
        self.assertEqual(len(staged), len(base))
        changed = [(b, s) for b, s in zip(base, staged) if b != s]
        self.assertEqual(len(changed), 4)
        lock = json.loads((KIT / "staged" / "deno.lock").read_text())
        self.assertEqual(lock["npm"]["facturapi@6.0.0"]["integrity"], MANIFEST["facturapi_integrity"])
        self.assertNotIn("facturapi@5.2.0", "\n".join(staged))
        for _, new in changed:
            self.assertIn("facturapi", new.replace(MANIFEST["facturapi_integrity"], "facturapi"))

    def test_deploy_list_covers_every_function_reaching_the_sdk(self):
        self.assertEqual(MANIFEST["deploy_functions"], bm.deploy_functions(REAL_FUNCTIONS))
        for name in ("stamp-cfdi", "stamp-credit-note", "stamp-payment-complement", "cancel-cfdi",
                     "download-cfdi", "refresh-cancellation-status", "process-cfdi-retry-queue",
                     "reconcile-stamping-invoices"):
            self.assertIn(name, MANIFEST["deploy_functions"])

    @unittest.skipUnless(shutil.which("patch"), "requiere GNU patch")
    def test_review_patch_produces_exactly_the_staged_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for entry in MANIFEST["files"]:
                if entry["base_sha256"] is not None:
                    dest = root / "supabase" / "functions" / entry["path"]
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(KIT / "rollback" / entry["path"], dest)
            subprocess.run(["patch", "-s", "-p1", "-i", str(KIT / "activation.patch")], cwd=root, check=True)
            self.assertEqual(act.tree_state(MANIFEST, root / "supabase" / "functions"), "applied")


class RunWindow(unittest.TestCase):
    def test_rejects_malformed_run_ids(self):
        for bad in ("", "fx6-preview-20261110T0623Z", "fx6-prod-20261111T1300", "fx6-prod-20261340T1300Z"):
            with self.assertRaises(act.ActivationError) as ctx:
                act.check_window(bad, IN_WINDOW)
            self.assertEqual(ctx.exception.code, act.EXIT_RUN_ID)

    def test_window_is_ten_minutes_before_to_sixty_after(self):
        start = datetime(2026, 11, 11, 13, 0, tzinfo=timezone.utc)
        act.check_window(RUN_ID, start - timedelta(minutes=10))
        act.check_window(RUN_ID, start + timedelta(minutes=60))
        for outside in (start - timedelta(minutes=11), start + timedelta(minutes=61), start + timedelta(days=1)):
            with self.assertRaises(act.ActivationError):
                act.check_window(RUN_ID, outside)


class Apply(TempTree):
    def test_apply_from_base_reaches_exact_staged_state(self):
        act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        self.assertEqual(act.tree_state(MANIFEST, self.functions), "applied")
        self.assertFalse((self.functions / "_shared/facturapi/sdk5_contract_test.ts").exists())
        self.assertEqual(
            (self.functions / "_shared/facturapi/client.ts").read_bytes(),
            (KIT / "staged/_shared/facturapi/client.ts").read_bytes(),
        )

    def test_apply_outside_window_changes_nothing(self):
        before = self.snapshot()
        with self.assertRaises(act.ActivationError):
            act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW + timedelta(hours=2))
        self.assertEqual(self.snapshot(), before)

    def test_apply_refuses_drift_and_changes_nothing(self):
        (self.functions / "_shared/facturapi/client.ts").write_text("// cambio operativo nuevo\n")
        before = self.snapshot()
        with self.assertRaises(act.ActivationError) as ctx:
            act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        self.assertEqual(ctx.exception.code, act.EXIT_STATE)
        self.assertEqual(self.snapshot(), before)

    def test_apply_twice_is_refused(self):
        act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        before = self.snapshot()
        with self.assertRaises(act.ActivationError) as ctx:
            act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        self.assertEqual(ctx.exception.code, act.EXIT_STATE)
        self.assertEqual(self.snapshot(), before)

    def test_tampered_kit_is_refused_before_touching_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            kit = Path(tmp) / "kit"
            shutil.copytree(KIT, kit, ignore=shutil.ignore_patterns("__pycache__"))
            (kit / "staged/_shared/facturapi/client.ts").write_text("// alterado\n")
            before = self.snapshot()
            with self.assertRaises(act.ActivationError) as ctx:
                act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW, kit=kit)
            self.assertEqual(ctx.exception.code, act.EXIT_KIT)
            self.assertEqual(self.snapshot(), before)

    def test_write_failure_midway_restores_base(self):
        real_write = act._write_atomic
        calls = {"n": 0}

        def flaky(dest, data):
            calls["n"] += 1
            if calls["n"] == 3:
                raise OSError("disco lleno simulado")
            real_write(dest, data)

        with mock.patch.object(act, "_write_atomic", side_effect=flaky):
            with self.assertRaises(act.ActivationError) as ctx:
                act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        self.assertEqual(ctx.exception.code, act.EXIT_STATE)
        self.assertEqual(act.tree_state(MANIFEST, self.functions), "base")


class Rollback(TempTree):
    def test_rollback_from_applied_restores_exact_base(self):
        before = self.snapshot()
        act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        act.rollback(MANIFEST, self.functions, RUN_ID)
        self.assertEqual(self.snapshot(), before)

    def test_rollback_is_never_blocked_by_window(self):
        act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        act.rollback(MANIFEST, self.functions, "fx6-prod-20200101T0000Z")
        self.assertEqual(act.tree_state(MANIFEST, self.functions), "base")

    def test_rollback_from_partial_activation(self):
        act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        shutil.copyfile(KIT / "rollback/deno.json", self.functions / "deno.json")
        self.assertEqual(act.tree_state(MANIFEST, self.functions), "partial")
        act.rollback(MANIFEST, self.functions, RUN_ID)
        self.assertEqual(act.tree_state(MANIFEST, self.functions), "base")

    def test_rollback_refuses_foreign_changes(self):
        act.apply(MANIFEST, self.functions, RUN_ID, IN_WINDOW)
        (self.functions / "_shared/facturapi/client.ts").write_text("// hotfix posterior\n")
        before = self.snapshot()
        with self.assertRaises(act.ActivationError) as ctx:
            act.rollback(MANIFEST, self.functions, RUN_ID)
        self.assertEqual(ctx.exception.code, act.EXIT_STATE)
        self.assertEqual(self.snapshot(), before)


class CronSql(unittest.TestCase):
    JOBS = set(MANIFEST["fiscal_cron_jobs"])
    FORBIDDEN = re.compile(
        r"\b(unschedule|cron\.schedule|insert|update|delete|drop|truncate|grant|revoke|create|alter\s+(table|role|function))\b",
        re.I,
    )

    def read(self, name: str) -> str:
        return _strip_sql_comments((KIT / "sql" / name).read_text())

    def test_only_the_two_fiscal_jobs_are_referenced(self):
        self.assertEqual(self.JOBS, {"process-cfdi-retry-queue-5min", "reconcile-stamping-invoices-5min"})
        for name in ("cron_status.sql", "cron_pause.sql", "cron_resume.sql"):
            found = set(re.findall(r"'([a-z0-9-]+-5min)'", self.read(name)))
            self.assertEqual(found, self.JOBS, name)

    def test_never_reads_the_command_with_the_cron_secret(self):
        for name in ("cron_status.sql", "cron_pause.sql", "cron_resume.sql"):
            self.assertNotRegex(self.read(name), r"\bcommand\b", name)

    def test_status_is_read_only(self):
        sql = self.read("cron_status.sql")
        self.assertNotRegex(sql, self.FORBIDDEN)
        self.assertNotIn("alter_job", sql)

    def test_pause_and_resume_only_toggle_active_and_fail_closed(self):
        for name, value, guard in (("cron_pause.sql", "false", "AND active"), ("cron_resume.sql", "true", "AND NOT active")):
            sql = self.read(name)
            self.assertNotRegex(sql, self.FORBIDDEN, name)
            self.assertEqual(re.findall(r"cron\.alter_job\(jobid, active := (\w+)\)", sql), [value], name)
            self.assertEqual(sql.count("cron.alter_job"), 1, name)
            self.assertIn(guard, sql)
            self.assertRegex(sql, r"IF v_\w+ <> 2 THEN\s+RAISE EXCEPTION")


class VerifySql(unittest.TestCase):
    def test_verification_is_read_only_tenant_scoped_and_secret_free(self):
        sql = _strip_sql_comments((KIT / "sql" / "verify_elogistix.sql").read_text())
        self.assertNotRegex(sql, CronSql.FORBIDDEN)
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        self.assertEqual(len(statements), 5)
        for statement in statements:
            self.assertTrue(statement.upper().startswith("SELECT"), statement[:40])
        for statement in statements[:4]:
            self.assertIn(f"organization_id = '{MANIFEST['test_tenant']}'", statement)
        for forbidden in (r"facturapi_(test|live)_key", r"api_key", r"\bcfdi_xml\b(?!_)", r"\bpayload\b", r"\blast_error\b"):
            self.assertNotRegex(sql, forbidden)
        for uuid_ref in re.findall(r"\w*cfdi_uuid[^,\n]*", sql):
            self.assertIn("IS NOT NULL", uuid_ref)
        self.assertEqual(sql.count("__WINDOW_START__"), 4)


class Cli(unittest.TestCase):
    def test_check_on_real_tree_succeeds_without_writing(self):
        before = {p: p.stat().st_mtime_ns for p in REAL_FUNCTIONS.rglob("*") if p.is_file()}
        result = subprocess.run([sys.executable, str(KIT / "activation.py"), "check"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(result.stdout, r"estado=(base|applied)")
        after = {p: p.stat().st_mtime_ns for p in REAL_FUNCTIONS.rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    def test_apply_cli_requires_run_id_and_changes_nothing(self):
        result = subprocess.run(
            [sys.executable, str(KIT / "activation.py"), "apply", "--functions-dir", "/nonexistent"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, act.EXIT_RUN_ID)


if __name__ == "__main__":
    unittest.main()
