"""Guardas que permiten quitar el reset sin aceptar una base restaurada o incompleta."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import json
import subprocess
import tempfile
import unittest
from unittest import mock
import tomllib

spec = spec_from_file_location("ci_database", Path(__file__).parents[1] / "ci_database.py")
ci = module_from_spec(spec)
spec.loader.exec_module(ci)


class LocalCiDatabaseTests(unittest.TestCase):
    def test_remote_and_non_ci_destinations_are_rejected(self):
        for env in ({}, {"DB_URL": ci.LOCAL_DB_URL},
                    {"GITHUB_ACTIONS": "true", "DB_URL": "postgresql://remote/postgres"}):
            with self.subTest(env=env), self.assertRaises(ValueError):
                ci.require_local_ci(env)
        ci.require_local_ci({"GITHUB_ACTIONS": "true", "DB_URL": ci.LOCAL_DB_URL})

    def test_empty_runner_is_required_without_deleting_anything(self):
        ci.assert_pristine("local", ["other_volume"], ["unrelated"])
        for volumes, containers in [
            (["supabase_db_local"], []), ([], ["supabase_auth_local"]),
            ([], ["supabase_db_local"]),
        ]:
            with self.subTest(volumes=volumes, containers=containers), self.assertRaises(ValueError):
                ci.assert_pristine("local", volumes, containers)

    def test_seed_is_disabled_without_changing_other_settings(self):
        for content in [
            'project_id = "local"\n[auth]\nenabled = true\n',
            'project_id = "local"\n[db.seed]\nenabled = true\nsql_paths = ["./seed.sql"]\n',
            'project_id = "local"\n[db.seed]\nsql_paths = ["./seed.sql"]\n[auth]\nenabled = true\n',
        ]:
            with self.subTest(content=content):
                before = tomllib.loads(content)
                result = ci.disable_seed(content)
                after = tomllib.loads(result)
                self.assertFalse(after["db"]["seed"]["enabled"])
                self.assertEqual(after.get("auth"), before.get("auth"))
                self.assertEqual(after["db"]["seed"].get("sql_paths"),
                                 before.get("db", {}).get("seed", {}).get("sql_paths"))
                self.assertEqual(ci.disable_seed(result), result)

    def test_unrecognized_seed_format_fails_closed(self):
        with self.assertRaises(ValueError):
            ci.disable_seed('project_id = "local"\n[db]\nseed = { enabled = true }\n')

    def test_migrations_are_compared_by_version_not_only_count(self):
        ci.verify_versions(["001_first.sql", "002_next.sql"], ["002", "001"])
        for applied in [[], ["001"], ["001", "003"], ["001", "002", "003"], ["001", "001"]]:
            with self.subTest(applied=applied), self.assertRaises(ValueError):
                ci.verify_versions(["001_first.sql", "002_next.sql"], applied)

    def test_empty_duplicate_and_malformed_histories_are_rejected(self):
        for files in [[], ["001_first.sql", "001_again.sql"], ["bad.sql"]]:
            with self.subTest(files=files), self.assertRaises(ValueError):
                ci.verify_versions(files, ["001"])


class GuardedBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = Path(self.directory.name) / "config.toml"
        self.backup = Path(self.directory.name) / "backup.toml"
        self.replay = b'project_id = "local"\n[db.seed]\nenabled = false\n'
        self.config.write_bytes(self.replay)

    @staticmethod
    def row(off=True):
        return {"name": "cron.launch_active_jobs", "setting": "off" if off else "on",
                "source": "configuration file" if off else "default",
                "sourcefile": "/data/postgresql.auto.conf" if off else None,
                "pending_restart": False, "context": "sighup", "data_directory": "/data"}

    def run_guard(self, profile="rls", fail_at=None, row_change=None, reload_value="t"):
        events = []
        state = {"off": False, "query": 0}

        def run(command, **kwargs):
            if command[:2] == ["supabase", "start"]:
                events.append("start")
                config = tomllib.loads(self.config.read_text())
                self.assertIs(config["db"]["migrations"]["enabled"], False)
                self.assertIs(config["db"]["seed"]["enabled"], False)
                self.assertEqual(command, ["supabase", "start", "-x", ci.START_EXCLUDES[profile]])
                self.assertTrue(self.backup.exists())
            elif command == ["supabase", "migration", "up", "--local"]:
                events.append("history")
                self.assertEqual(self.config.read_bytes(), self.replay)
                self.assertEqual(self.backup.read_bytes(), self.replay)
            else:
                self.fail("Unexpected runtime command in mock: " + repr(command))
            if fail_at == events[-1]:
                raise subprocess.CalledProcessError(1, command)
            return subprocess.CompletedProcess(command, 0)

        def psql(sql):
            if sql == ci.EMPTY_BOOTSTRAP:
                events.append("empty")
            elif sql == ci.CRON_QUERY:
                events.append("observation")
                state["query"] += 1
                if fail_at == "sql-timeout":
                    raise subprocess.TimeoutExpired(["psql"], 15)
                if fail_at == "missing-guc":
                    return []
                row = self.row(state["off"])
                if row_change:
                    row.update(row_change)
                return [json.dumps(row)]
            elif sql == "ALTER SYSTEM SET cron.launch_active_jobs = 'off'":
                events.append("alter")
                state["off"] = True
                self.assertNotIn("BEGIN", sql)
            elif sql == "SELECT pg_reload_conf()":
                events.append("reload")
                if fail_at == "interrupt":
                    raise KeyboardInterrupt()
                return [reload_value]
            else:
                self.fail("Unexpected SQL in mock")
            if fail_at == events[-1]:
                raise subprocess.CalledProcessError(1, ["psql"])
            return []

        with mock.patch.object(ci, "check_http_sources"), mock.patch.object(ci.subprocess, "run", side_effect=run), mock.patch.object(ci, "psql", side_effect=psql), mock.patch.object(ci.time, "sleep"):
            try:
                ci.start_guarded(profile, self.config, self.backup)
            finally:
                self.events = events
        return events

    def test_successful_order_and_exact_recovery_with_both_profiles(self):
        for profile in ("rls", "ab"):
            with self.subTest(profile=profile):
                events = self.run_guard(profile)
                self.assertEqual(events[:5], ["start", "empty", "observation", "alter", "reload"])
                self.assertEqual(events[5:7], ["observation", "observation"])
                self.assertEqual(events[-2:], ["history", "observation"])
                self.assertEqual(self.config.read_bytes(), self.replay)
                self.assertFalse(self.backup.exists())

    def test_failure_never_applies_history_and_restores_config(self):
        for failure in ("start", "empty", "missing-guc", "alter", "interrupt"):
            with self.subTest(failure=failure), self.assertRaises((ValueError, subprocess.CalledProcessError, KeyboardInterrupt)):
                self.run_guard(fail_at=failure)
            self.assertNotIn("history", self.events)
            self.assertEqual(self.config.read_bytes(), self.replay)
            self.assertFalse(self.backup.exists())

    def test_reload_rejection_never_applies_history(self):
        with self.assertRaises(ValueError):
            self.run_guard(reload_value="f")
        self.assertNotIn("history", self.events)
        self.assertEqual(self.config.read_bytes(), self.replay)

    def test_unsupported_or_never_off_image_fails_closed(self):
        for change in ({"context": "postmaster"}, {"pending_restart": "false"},
                       {"setting": "on"}, {"source": "session"},
                       {"pending_restart": True}, {"sourcefile": "/elsewhere.conf"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.run_guard(row_change=change)
            self.assertNotIn("history", self.events)
            self.assertEqual(self.config.read_bytes(), self.replay)

    def test_history_failure_still_leaves_exact_replay_config(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_guard(fail_at="history")
        self.assertEqual(self.config.read_bytes(), self.replay)
        self.assertFalse(self.backup.exists())

    def test_restore_failure_prevents_history_and_retains_backup(self):
        with mock.patch.object(ci, "restore_config", side_effect=OSError("fixture restore failed")), self.assertRaises(OSError):
            self.run_guard()
        self.assertNotIn("history", self.events)
        self.assertEqual(self.backup.read_bytes(), self.replay)
        ci.restore_config(self.config, self.backup)
        self.assertEqual(self.config.read_bytes(), self.replay)

    def test_stale_backup_is_not_overwritten(self):
        self.backup.write_bytes(b"previous attempt")
        with mock.patch.object(ci.subprocess, "run") as run, self.assertRaises(ValueError):
            ci.start_guarded("rls", self.config, self.backup)
        run.assert_not_called()
        self.assertEqual(self.backup.read_bytes(), b"previous attempt")

    def test_bootstrap_copy_does_not_mutate_exact_replay_bytes(self):
        for replay in (self.replay, self.replay + b"[db.migrations]\nenabled = true\nschema_paths = []\n"):
            result = ci.bootstrap_config(replay)
            parsed = tomllib.loads(result.decode())
            self.assertIs(parsed["db"]["migrations"]["enabled"], False)
            self.assertIs(parsed["db"]["seed"]["enabled"], False)
            self.assertEqual(parsed["project_id"], "local")

    def test_ambiguous_or_unsafe_replay_config_is_rejected(self):
        for replay in (b'project_id="local"\n', b'project_id="local"\n[db.seed]\nenabled=true\n',
                       self.replay + b'[db]\nmigrations={enabled=true}\n',
                       self.replay + b'[db.migrations]\nenabled=false\n'):
            with self.subTest(replay=replay), self.assertRaises(ValueError):
                ci.bootstrap_config(replay)

    def test_profile_services_remain_distinct_and_closed(self):
        self.assertEqual(ci.START_EXCLUDES["rls"], "studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,mailpit,postgres-meta,supavisor,kong,postgrest")
        self.assertEqual(ci.START_EXCLUDES["ab"], "studio,imgproxy,logflare,vector,edge-runtime,realtime,mailpit,postgres-meta,supavisor")
        with self.assertRaises(ValueError):
            ci.start_guarded("catalog", self.config, self.backup)

    def test_psql_arguments_have_no_shell_and_errors_are_blocking(self):
        with mock.patch.object(ci, "command_lines", return_value=["t"]) as lines:
            self.assertEqual(ci.psql("SELECT pg_reload_conf()"), ["t"])
        self.assertEqual(lines.call_args.args[0], ["psql", ci.LOCAL_DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", "SELECT pg_reload_conf()"])
        self.assertEqual(lines.call_args.kwargs["timeout"], 15)
        self.assertTrue(ci.EMPTY_BOOTSTRAP.endswith("END; $guard$;"))

    def test_separate_cleanup_recovers_an_interrupted_bootstrap(self):
        self.backup.write_bytes(self.replay)
        self.config.write_bytes(ci.bootstrap_config(self.replay))
        ci.restore_config(self.config, self.backup)

    def test_backup_survives_release_for_recovery_during_history(self):
        self.backup.write_bytes(self.replay)
        self.config.write_bytes(ci.bootstrap_config(self.replay))
        ci.restore_config(self.config, self.backup, keep_backup=True)
        self.assertEqual(self.config.read_bytes(), self.replay)
        self.assertEqual(self.backup.read_bytes(), self.replay)
        ci.restore_config(self.config, self.backup)
        self.assertEqual(self.config.read_bytes(), self.replay)
        self.assertFalse(self.backup.exists())

    def test_incomplete_or_foreign_backup_cannot_replace_current_config(self):
        for backup in (self.replay.rstrip(b"\n"), self.replay.replace(b'"local"', b'"other-project"')):
            self.backup.write_bytes(backup)
            with self.subTest(backup=backup), self.assertRaises(ValueError):
                ci.restore_config(self.config, self.backup)
            self.assertEqual(self.config.read_bytes(), self.replay)
            self.assertEqual(self.backup.read_bytes(), backup)

    def test_failed_backup_publication_leaves_config_intact_and_no_runtime(self):
        with mock.patch.object(ci, "publish_backup", side_effect=OSError("fixture publication failure")), mock.patch.object(ci, "check_http_sources"), mock.patch.object(ci.subprocess, "run") as run, self.assertRaises(OSError):
            ci.start_guarded("rls", self.config, self.backup)
        run.assert_not_called()
        self.assertEqual(self.config.read_bytes(), self.replay)
        self.assertFalse(self.backup.exists())
        self.assertEqual(list(self.config.parent.glob(".ci-db-*")), [])

    def test_backup_publication_does_not_overwrite_a_stale_file(self):
        self.backup.write_bytes(b"foreign backup")
        with self.assertRaises(OSError):
            ci.write_atomic(self.backup, self.replay, exclusive=True)
        self.assertEqual(self.backup.read_bytes(), b"foreign backup")

    def test_changed_database_port_is_rejected_before_start(self):
        self.config.write_bytes(self.replay + b"[db]\nport=54323\n")
        with mock.patch.object(ci, "check_http_sources"), mock.patch.object(ci.subprocess, "run") as run, self.assertRaises(ValueError):
            ci.start_guarded("rls", self.config, self.backup)
        run.assert_not_called()
        self.assertFalse(self.backup.exists())

    def test_psql_timeout_restores_config_and_never_runs_history(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            self.run_guard(fail_at="sql-timeout")
        self.assertNotIn("history", self.events)
        self.assertEqual(self.config.read_bytes(), self.replay)
        self.assertFalse(self.backup.exists())
        self.assertEqual(self.config.read_bytes(), self.replay)
        ci.restore_config(self.config, self.backup)


class SourceAndWorkflowTests(unittest.TestCase):
    def test_real_reviewed_http_files_are_only_stored_commands(self):
        # Reads source bytes only; no SQL, services or subprocess are executed.
        root = Path(__file__).parents[2]
        ci.check_http_sources(root)

    def test_changed_http_file_or_unknown_direct_call_is_rejected(self):
        root = Path(__file__).parents[2]
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            (fixture / "supabase/migrations").mkdir(parents=True)
            (fixture / "drizzle/migrations").mkdir(parents=True)
            for name in ci.HTTP_SOURCES:
                (fixture / "supabase/migrations" / name).write_bytes((root / "supabase/migrations" / name).read_bytes())
            ci.check_http_sources(fixture)
            unknown = fixture / "drizzle/migrations/9999_unknown.sql"
            for sql in ("DO $$ BEGIN PERFORM net.http_post(url := 'x'); END $$;",
                        "SELECT net.http_get('x');", "ALTER SYSTEM SET cron.launch_active_jobs='on';"):
                unknown.write_text(sql, encoding="utf-8")
                with self.subTest(sql=sql), self.assertRaises(ValueError):
                    ci.check_http_sources(fixture)
            unknown.unlink()
            first = fixture / "supabase/migrations" / next(iter(ci.HTTP_SOURCES))
            first.write_bytes(first.read_bytes() + b"\nSELECT net.http_post('x');\n")
            with self.assertRaises(ValueError):
                ci.check_http_sources(fixture)

    def test_unreviewed_source_tree_is_rejected_before_reading_or_running_sql(self):
        with mock.patch.object(ci, "command_lines", return_value=[]), mock.patch.object(ci, "check_http_sources") as check, self.assertRaises(ValueError):
            ci.preflight_sources()
        check.assert_not_called()

    def test_workflows_wire_preflight_bootstrap_replay_and_cleanup_in_order(self):
        root = Path(__file__).parents[2]
        for filename, profile in (("rls-db-tests.yml", "rls"), ("multi-tenant-ab.yml", "ab")):
            text = (root / ".github/workflows" / filename).read_text(encoding="utf-8")
            with self.subTest(workflow=filename):
                self.assertLess(text.index("ci_database.py preflight"), text.index("run: python3 scripts/patch_legacy_migrations.py"))
                self.assertLess(text.index("ci_database.py prepare"), text.index("ci_database.py start-guarded --profile " + profile))
                self.assertLess(text.index("ci_database.py start-guarded --profile " + profile), text.index("ci_database.py verify"))
                self.assertIn("ci_database.py check-cron-off", text)
                self.assertIn("ci_database.py restore-config", text)
                self.assertIn("trap 'cron_bootstrap_status=$?; trap - EXIT;", text)
                self.assertIn('restore-config || cron_bootstrap_status=1; exit "$cron_bootstrap_status"', text)
                self.assertIn("test_ci_database.py", text)
                self.assertNotRegex(text, r"(?m)^\s+supabase start(?:\s|$)")
                self.assertIn("bun scripts/ci-drizzle-replay.mjs prepare", text)
                self.assertIn("bunx drizzle-kit migrate --config=drizzle.ci.config.ts", text)
                self.assertIn("bun scripts/ci-drizzle-replay.mjs verify", text)
                self.assertIn("supabase stop --no-backup || true", text)
        rls = (root / ".github/workflows/rls-db-tests.yml").read_text(encoding="utf-8")
        ab = (root / ".github/workflows/multi-tenant-ab.yml").read_text(encoding="utf-8")
        self.assertIn("--mode strict", rls)
        self.assertIn("--mode smoke", rls)
        self.assertIn("bun run test:multitenant-ab", ab)


if __name__ == "__main__":
    unittest.main()
