"""Guardas que permiten quitar el reset sin aceptar una base restaurada o incompleta."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import contextlib
import io
import json
import subprocess
import sys
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
                "sourcefile": ci.DB_DATA_DIRECTORY + "/postgresql.auto.conf" if off else None,
                "pending_restart": False, "context": "sighup", "data_directory": ci.DB_DATA_DIRECTORY,
                "postmaster_started_at": "2026-10-29T21:00:00"}

    def run_guard(self, profile="rls", fail_at=None, row_change=None, reload_value="t", *, check_sources=False,
                  identity_change=None, admin_fail=None, ownership_error=None, later_row_change=None, change_after_history=False):
        events = []
        state = {"off": False, "query": 0}
        self.admin_operations = []
        self.normal_sql = []

        def run(command, **kwargs):
            if command[:2] == ["supabase", "start"]:
                events.append("start")
                config = tomllib.loads(self.config.read_text())
                self.assertIs(config["db"]["migrations"]["enabled"], False)
                self.assertIs(config["db"]["seed"]["enabled"], False)
                self.assertEqual(command, ["supabase", "start", "-x", ci.START_EXCLUDES[profile]])
                self.assertTrue(self.backup.exists())
            elif command == ["supabase", "migration", "up", "--local"]:
                self.assertEqual(self.admin_operations, ["identity", "cron-off", "reload", "verify"])
                events.append("history")
                self.assertEqual(self.config.read_bytes(), self.replay)
                self.assertEqual(self.backup.read_bytes(), self.replay)
            else:
                self.fail("Unexpected runtime command in mock: " + repr(command))
            if fail_at == events[-1]:
                raise subprocess.CalledProcessError(1, command)
            return subprocess.CompletedProcess(command, 0)

        def psql(sql):
            self.normal_sql.append(sql)
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
                if state["query"] > 1 and later_row_change and (not change_after_history or "history" in events):
                    row.update(later_row_change(state["query"]) if callable(later_row_change) else later_row_change)
                return [json.dumps(row)]
            else:
                self.fail("Unexpected SQL through the normal postgres connection")
            if fail_at == events[-1]:
                raise subprocess.CalledProcessError(1, ["psql"])
            return []

        def admin(container_id, operation):
            self.assertEqual(container_id, "a" * 64)
            self.assertNotIn("history", events)
            self.admin_operations.append(operation)
            if operation == admin_fail:
                raise subprocess.TimeoutExpired(["docker", "exec"], 15)
            if operation == "identity":
                identity = {"current_user": "supabase_admin", "session_user": "supabase_admin", "rolsuper": True,
                            "database": "postgres", "data_directory": ci.DB_DATA_DIRECTORY,
                            "postmaster_started_at": self.row()["postmaster_started_at"]}
                identity.update(identity_change or {})
                return [json.dumps(identity)]
            if operation == "cron-off":
                events.append("alter")
                state["off"] = True
            elif operation == "reload":
                events.append("reload")
                if fail_at == "interrupt":
                    raise KeyboardInterrupt()
                return [reload_value]
            elif operation == "verify":
                return [json.dumps(self.row())]
            else:
                self.fail("Unexpected privileged operation")
            if fail_at == events[-1]:
                raise subprocess.CalledProcessError(1, ["psql"])
            return []

        source_check = contextlib.nullcontext() if check_sources else mock.patch.object(ci, "check_http_sources")
        with source_check, mock.patch.object(ci.subprocess, "run", side_effect=run), mock.patch.object(ci, "psql", side_effect=psql), \
                mock.patch.object(ci, "owned_db_container", return_value="a" * 64, side_effect=ownership_error), \
                mock.patch.object(ci, "admin_cron_command", side_effect=admin), mock.patch.object(ci.time, "sleep"):
            try:
                ci.start_guarded(profile, self.config, self.backup)
            finally:
                self.events = events
        return events

    @contextlib.contextmanager
    def runner_pipeline(self):
        """Real Git/source/patcher pipeline; only Docker, Supabase and SQL mocked."""
        root = Path(__file__).parents[2]
        fixture = Path(self.directory.name) / "checkout"
        git_dir = subprocess.check_output(["git", "-C", str(root), "rev-parse", "--path-format=absolute", "--git-common-dir"], text=True).strip()
        revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
        # Temporary repository reads the existing local objects directly. This
        # also works with shallow checkouts, without clone's upload-pack shell.
        subprocess.run(["git", "init", "--quiet", str(fixture)], check=True, capture_output=True)
        (fixture / ".git/objects/info/alternates").write_text(
            (Path(git_dir) / "objects").as_posix() + "\n", encoding="utf-8", newline="\n")
        update = subprocess.run(["git", "-C", str(fixture), "update-ref", "--no-deref", "HEAD", revision], capture_output=True)
        self.assertEqual(update.returncode, 0, update.stderr.decode("utf-8", errors="replace"))
        subprocess.run(["git", "-C", str(fixture), "-c", "core.autocrlf=false", "restore", "--source=HEAD", "--worktree", "--",
                        *ci.SOURCE_TREES, "scripts/patch_legacy_migrations.py", "supabase/config.toml"],
                       check=True, capture_output=True)
        with contextlib.chdir(fixture):
            ci.preflight_sources()  # Real canonical trees, file bytes and patcher pin.
            originals = {name: (Path("supabase/migrations") / name).read_bytes() for name in ci.HTTP_SOURCES}
            legacy_spec = spec_from_file_location("legacy_pipeline", Path("scripts/patch_legacy_migrations.py"))
            legacy = module_from_spec(legacy_spec)
            legacy_spec.loader.exec_module(legacy)
            read_text, write_text = Path.read_text, Path.write_text
            # Match the Ubuntu runner's UTF-8/LF filesystem I/O on Windows too;
            # the actual pinned patcher main and all transformations run unchanged.
            with mock.patch.object(sys, "argv", ["patch_legacy_migrations.py"]), contextlib.redirect_stdout(io.StringIO()), \
                    mock.patch.object(Path, "read_text", lambda path: read_text(path, encoding="utf-8")), \
                    mock.patch.object(Path, "write_text", lambda path, text: write_text(path, text, encoding="utf-8", newline="\n")):
                self.assertEqual(legacy.main(), 0)
            for name, before in originals.items():
                after = (Path("supabase/migrations") / name).read_bytes()
                self.assertEqual(ci.re.findall(rb"\$cmd\$(.*?)\$cmd\$", before, ci.re.S),
                                 ci.re.findall(rb"\$cmd\$(.*?)\$cmd\$", after, ci.re.S))
            with self.assertRaises(ValueError):
                ci.check_http_sources()  # The canonical phase never accepts runner bytes.
            ci.check_http_sources(after_patching=True)
            env = {"GITHUB_ACTIONS": "true", "DB_URL": ci.LOCAL_DB_URL}
            with mock.patch.dict(ci.os.environ, env), mock.patch.object(sys, "argv", ["ci_database.py", "prepare"]), \
                    mock.patch.object(ci, "command_lines", return_value=[]) as docker, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(ci.main(), 0)
                self.assertEqual([call.args[0] for call in docker.call_args_list], [
                    ["docker", "volume", "ls", "--format", "{{.Name}}"],
                    ["docker", "ps", "-a", "--format", "{{.Names}}"],
                ])
            self.config = Path("supabase/config.toml").resolve()
            self.backup = Path("supabase/config.toml.ci-runtime-backup").resolve()
            self.replay = self.config.read_bytes()
            yield fixture

    def test_real_runner_pipeline_accepts_only_exact_patcher_output(self):
        with self.runner_pipeline():
            for profile in ("rls", "ab"):
                with self.subTest(profile=profile):
                    events = self.run_guard(profile, check_sources=True)
                    self.assertEqual(events[:5], ["start", "empty", "observation", "alter", "reload"])
                    self.assertEqual(events[-2:], ["history", "observation"])
                    self.assertEqual(self.config.read_bytes(), self.replay)
                    self.assertFalse(self.backup.exists())

    def test_real_runner_pipeline_rejects_unexpected_changes_before_start(self):
        with self.runner_pipeline():
            for name in ci.HTTP_SOURCES:
                path = Path("supabase/migrations") / name
                runner = path.read_bytes()
                canonical = (Path(__file__).parents[2] / path).read_bytes()
                mutations = [runner + b"\n-- unexpected runner edit\n"]
                if runner != canonical:
                    mutations.append(canonical)  # Wrong phase is not an alternative hash.
                for data in mutations:
                    path.write_bytes(data)
                    with self.subTest(file=name, canonical=data == canonical), self.assertRaises(ValueError):
                        self.run_guard(check_sources=True)
                    self.assertEqual(self.events, [])
                    self.assertFalse(self.backup.exists())
                path.write_bytes(runner)
            unknown = Path("drizzle/migrations/9999_unknown.sql")
            for sql in ("SELECT net.http_get('x');", "ALTER SYSTEM SET cron.launch_active_jobs='on';"):
                unknown.write_text(sql, encoding="utf-8")
                with self.subTest(sql=sql), self.assertRaises(ValueError):
                    self.run_guard(check_sources=True)
                self.assertEqual(self.events, [])
                self.assertFalse(self.backup.exists())
            unknown.unlink()

    def test_successful_order_and_exact_recovery_with_both_profiles(self):
        for profile in ("rls", "ab"):
            with self.subTest(profile=profile):
                events = self.run_guard(profile)
                self.assertEqual(events[:5], ["start", "empty", "observation", "alter", "reload"])
                self.assertEqual(events[5:7], ["observation", "observation"])
                self.assertEqual(events[-2:], ["history", "observation"])
                self.assertEqual(self.config.read_bytes(), self.replay)
                self.assertFalse(self.backup.exists())
                self.assertEqual(self.admin_operations, ["identity", "cron-off", "reload", "verify"])
                self.assertEqual(set(self.normal_sql), {ci.EMPTY_BOOTSTRAP, ci.CRON_QUERY})

    def test_administrator_dispatch_has_only_fixed_operations_and_exact_argv(self):
        self.assertEqual(set(ci.ADMIN_SQL), {"identity", "cron-off", "reload", "verify"})
        for operation in ci.ADMIN_SQL:
            with self.subTest(operation=operation), mock.patch.object(ci, "command_lines", return_value=[]) as lines:
                ci.admin_cron_command("a" * 64, operation)
                self.assertEqual(lines.call_args.args[0], [
                    "docker", "exec", "a" * 64, "psql", "-h127.0.0.1", "-p5432", "-U", "supabase_admin",
                    "-dpostgres", "-X", "-w", "-vON_ERROR_STOP=1", "-Atc", ci.ADMIN_SQL[operation],
                ])
                self.assertEqual(lines.call_args.kwargs, {"timeout": 15})
        for container, operation in (("a" * 64, "SELECT 1"), ("a" * 64, "identity; DROP ROLE postgres"), ("--other", "identity")):
            with self.subTest(container=container, operation=operation), mock.patch.object(ci, "command_lines") as lines, self.assertRaises(ValueError):
                ci.admin_cron_command(container, operation)
            lines.assert_not_called()
        self.assertEqual(ci.ADMIN_SQL["cron-off"], "ALTER SYSTEM SET cron.launch_active_jobs = 'off'")
        self.assertEqual(ci.ADMIN_SQL["reload"], "SELECT pg_reload_conf()")

    def test_container_binding_requires_fresh_owned_running_image_and_loopback_port(self):
        created = ci.datetime.fromisoformat("2026-10-29T00:00:00+00:00")
        metadata = {"id": "a" * 64, "name": "/supabase_db_local", "image": ci.DB_IMAGE, "image_id": "sha256:" + "b" * 64,
                    "project": "local", "compose_project": "local", "running": True, "created": created.isoformat(),
                    "ports": [{"HostIp": "0.0.0.0", "HostPort": "54322"}]}
        image = {"id": metadata["image_id"], "tags": [ci.DB_IMAGE], "os": "linux", "architecture": "amd64"}

        def inspect(container=metadata, observed_image=image):
            return mock.patch.object(ci, "command_lines", side_effect=[[json.dumps(container)], [json.dumps(observed_image)]])

        with mock.patch.object(ci.time, "time", return_value=created.timestamp() + 1):
            with inspect() as lines:
                self.assertEqual(ci.owned_db_container("local", created.timestamp() - 1), "a" * 64)
                self.assertEqual([call.args[0] for call in lines.call_args_list], [
                    ["docker", "inspect", "--type", "container", "--format", ci.CONTAINER_VIEW, "supabase_db_local"],
                    ["docker", "image", "inspect", "--format", ci.IMAGE_VIEW, metadata["image_id"]],
                ])
                self.assertTrue(all(call.kwargs == {"timeout": 15} for call in lines.call_args_list))
                self.assertNotIn(".Config.Env", ci.CONTAINER_VIEW)
            for change in ({"id": "short"}, {"name": "/supabase_db_other"}, {"project": "other"}, {"compose_project": "other"},
                           {"running": False}, {"image": "postgres:17"}, {"image_id": "bad"}, {"created": "2000-01-01T00:00:00Z"},
                           {"created": "not-a-date"}, {"created": None}, {"ports": None},
                           {"ports": [{"HostIp": "127.0.0.1", "HostPort": "54323"}]},
                           {"ports": [{"HostIp": "192.0.2.1", "HostPort": "54322"}]}):
                with self.subTest(container=change), inspect({**metadata, **change}), self.assertRaises(ValueError):
                    ci.owned_db_container("local", created.timestamp() - 1)
            for change in ({"id": "sha256:" + "c" * 64}, {"tags": ["postgres:17"]}, {"os": "windows"}, {"architecture": "arm64"}):
                with self.subTest(image=change), inspect(observed_image={**image, **change}), self.assertRaises(ValueError):
                    ci.owned_db_container("local", created.timestamp() - 1)
            for rows in ([], ["{}", "{}"], ["[]"]):
                with self.subTest(rows=rows), mock.patch.object(ci, "command_lines", return_value=rows), self.assertRaises((ValueError, KeyError)):
                    ci.owned_db_container("local", created.timestamp() - 1)

    def test_wrong_administrator_identity_never_alters_or_runs_history(self):
        for change in ({"current_user": "postgres"}, {"session_user": "postgres"}, {"rolsuper": False}, {"rolsuper": "true"},
                       {"database": "other"}, {"data_directory": "/other"}, {"postmaster_started_at": "another-cluster"}):
            with self.subTest(identity=change), self.assertRaises(ValueError):
                self.run_guard(identity_change=change)
            self.assertEqual(self.admin_operations, ["identity"])
            self.assertNotIn("history", self.events)
            self.assertEqual(self.config.read_bytes(), self.replay)
            self.assertFalse(self.backup.exists())

    def test_administrator_or_inspect_failure_never_falls_back_or_runs_history(self):
        for operation in ci.ADMIN_SQL:
            with self.subTest(operation=operation), self.assertRaises(subprocess.TimeoutExpired):
                self.run_guard(admin_fail=operation)
            self.assertNotIn("history", self.events)
            self.assertEqual(set(self.normal_sql), {ci.EMPTY_BOOTSTRAP, ci.CRON_QUERY})
            self.assertEqual(self.config.read_bytes(), self.replay)
            self.assertFalse(self.backup.exists())
        with self.assertRaises(subprocess.TimeoutExpired):
            self.run_guard(ownership_error=subprocess.TimeoutExpired(["docker", "inspect"], 15))
        self.assertEqual(self.admin_operations, [])
        self.assertNotIn("history", self.events)
        self.assertEqual(self.config.read_bytes(), self.replay)

    def test_changed_normal_connection_identity_blocks_replay_or_fails_final_gate(self):
        for change in ({"data_directory": "/other", "sourcefile": "/other/postgresql.auto.conf"},
                       {"postmaster_started_at": "another-cluster"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.run_guard(later_row_change=change)
            self.assertNotIn("history", self.events)
            self.assertEqual(self.config.read_bytes(), self.replay)
            self.assertFalse(self.backup.exists())
        with self.assertRaises(ValueError):
            self.run_guard(later_row_change=lambda query: {"postmaster_started_at": "transient-other-cluster"} if query == 2 else {})
        self.assertEqual(self.normal_sql.count(ci.CRON_QUERY), 2)
        self.assertNotIn("history", self.events)
        self.assertEqual(self.config.read_bytes(), self.replay)
        with self.assertRaises(ValueError):
            self.run_guard(later_row_change={"postmaster_started_at": "another-cluster"}, change_after_history=True)
        self.assertIn("history", self.events)
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
                       {"pending_restart": True}, {"sourcefile": "/elsewhere.conf"}, {"sourcefile": None}):
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
    def assert_ab_project_marker_scope(self, text):
        # Source contract: the CLI reads SUPABASE_PROJECT_ID as a TOML override.
        # Keep it only in the Playwright step, never in job/global/GITHUB_ENV.
        marker = "SUPABASE_PROJECT_ID: local-ab-ephemeral"
        self.assertEqual(text.count("\n          " + marker + "\n"), 1)
        import re
        assignments = re.findall(r"(?m)^\s*SUPABASE_PROJECT_ID:\s*.*$", text)
        self.assertEqual(len(assignments), 1)
        steps = text.split("\n      - name: ")
        gate = next(step for step in steps if step.startswith("Ejecutar gate A/B (datos + Storage + portal)\n"))
        self.assertIn("        env:\n          " + marker + "\n", gate)
        self.assertIn("        run: bun run test:multitenant-ab", gate)
        for step in steps:
            if step is not gate:
                self.assertNotRegex(step, r"(?m)^\s*SUPABASE_PROJECT_ID:")
        export = next(step for step in steps if step.startswith("Exportar credenciales locales efímeras\n"))
        self.assertNotIn("SUPABASE_PROJECT_ID=", export)
        self.assertIn("      VITE_SUPABASE_PROJECT_ID: local-ab-ephemeral", text)
        dev_vars = next(step for step in steps if step.startswith("Crear .dev.vars efímero para Wrangler\n"))
        self.assertIn('echo "SUPABASE_PROJECT_ID=local-ab-ephemeral"', dev_vars)

    def test_ab_application_project_marker_cannot_override_cli_container_identity(self):
        root = Path(__file__).parents[2]
        text = (root / ".github/workflows/multi-tenant-ab.yml").read_text(encoding="utf-8")
        self.assert_ab_project_marker_scope(text)
        # Prove the old global setting and a future GITHUB_ENV leak are rejected.
        old_global = text.replace("          SUPABASE_PROJECT_ID: local-ab-ephemeral\n", "")
        old_global = old_global.replace("      VITE_SUPABASE_PROJECT_ID: local-ab-ephemeral\n",
                                        "      VITE_SUPABASE_PROJECT_ID: local-ab-ephemeral\n      SUPABASE_PROJECT_ID: local-ab-ephemeral\n")
        leaked = text.replace('            echo "SUPABASE_URL=$API_URL"',
                              '            echo "SUPABASE_PROJECT_ID=local-ab-ephemeral"\n            echo "SUPABASE_URL=$API_URL"')
        for invalid in (old_global, leaked):
            with self.subTest(global_override=invalid is old_global), self.assertRaises(AssertionError):
                self.assert_ab_project_marker_scope(invalid)

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
