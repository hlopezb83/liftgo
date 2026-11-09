"""Offline contracts: exact image pulls, bounded concurrency and fail-closed exits."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import contextlib
import io
import subprocess
import threading
import time
import unittest
from unittest import mock


ROOT = Path(__file__).parents[2]
spec = spec_from_file_location("ci_supabase_prefetch", ROOT / "scripts/ci_supabase_prefetch.py")
prefetch = module_from_spec(spec)
spec.loader.exec_module(prefetch)

ENV = {
    "GITHUB_ACTIONS": "true",
    "DB_URL": "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "SUPABASE_INTERNAL_IMAGE_REGISTRY": "public.ecr.aws",
}
RLS_IMAGES = (
    "public.ecr.aws/supabase/postgres:17.4.1.068",
    "public.ecr.aws/supabase/realtime:v2.41.11",
    "public.ecr.aws/supabase/storage-api:v1.26.1",
    "public.ecr.aws/supabase/gotrue:v2.177.0",
)
AB_IMAGES = RLS_IMAGES + (
    "public.ecr.aws/supabase/kong:2.8.1",
    "public.ecr.aws/supabase/postgrest:v13.0.4",
)


class SupabasePrefetchTests(unittest.TestCase):
    def run_prefetch(self, profile="ab", pull_error=None):
        images = AB_IMAGES if profile == "ab" else RLS_IMAGES
        # Every fixed pull must be in flight before any completes. A serial
        # implementation, fewer workers or a dropped image breaks the barrier.
        barrier = threading.Barrier(len(images), timeout=5)
        finished = []
        calls = []
        lock = threading.Lock()

        def run(command, **kwargs):
            with lock:
                calls.append((command, kwargs))
            self.assertEqual(kwargs["env"], ENV)
            self.assertIs(kwargs["check"], True)
            self.assertIs(kwargs["capture_output"], True)
            self.assertIs(kwargs["text"], True)
            self.assertNotIn("shell", kwargs)
            if command == ["supabase", "--version"]:
                self.assertEqual(kwargs["timeout"], 15)
                return subprocess.CompletedProcess(command, 0, stdout="2.34.0\n")
            self.assertEqual(command[:3], ["docker", "pull", "--quiet"])
            self.assertEqual(len(command), 4)
            self.assertIn(command[3], images)
            self.assertEqual(kwargs["timeout"], 240)
            barrier.wait()
            if command[3] == images[0] and pull_error:
                with lock:
                    finished.append(command[3])
                raise pull_error
            time.sleep(0.01)  # Peers must still be awaited after the first failure.
            with lock:
                finished.append(command[3])
            return subprocess.CompletedProcess(command, 0, stdout="sha256:mock-digest\n")

        output = io.StringIO()
        with mock.patch.object(prefetch.subprocess, "run", side_effect=run), contextlib.redirect_stdout(output):
            if pull_error:
                with self.assertRaises(RuntimeError) as raised:
                    prefetch.prefetch(profile, ENV)
                self.assertIn(images[0], str(raised.exception))
                self.assertNotIn("prefetch complete", output.getvalue())
            else:
                prefetch.prefetch(profile, ENV)
                self.assertIn(f"complete: {len(images)} images", output.getvalue())
        self.assertEqual(calls[0][0], ["supabase", "--version"])
        self.assertEqual(len(calls), len(images) + 1)
        self.assertCountEqual([command[3] for command, _ in calls[1:]], images)
        self.assertCountEqual(finished, images)

    def test_rls_exact_inventory_is_fetched_concurrently(self):
        self.assertEqual(prefetch.images_for_profile("rls", ENV), RLS_IMAGES)
        self.run_prefetch("rls")

    def test_ab_exact_inventory_is_fetched_concurrently(self):
        self.assertEqual(prefetch.images_for_profile("ab", ENV), AB_IMAGES)
        self.run_prefetch("ab")

    def test_failed_pull_is_fatal_and_all_other_pulls_are_awaited(self):
        self.run_prefetch(pull_error=subprocess.CalledProcessError(23, ["docker", "pull"]))

    def test_timed_out_pull_is_fatal_and_all_other_pulls_are_awaited(self):
        self.run_prefetch(pull_error=subprocess.TimeoutExpired(["docker", "pull"], 240))

    def test_unavailable_docker_is_fatal_and_all_other_pulls_are_awaited(self):
        self.run_prefetch(pull_error=FileNotFoundError("docker"))

    def test_invalid_profile_fails_before_any_command(self):
        for profile in ("", "prod", "rls; touch /tmp/forbidden", "ab --all"):
            with self.subTest(profile=profile), mock.patch.object(prefetch.subprocess, "run") as run:
                with self.assertRaises(ValueError):
                    prefetch.prefetch(profile, ENV)
                run.assert_not_called()

    def test_environment_validation_fails_before_any_command(self):
        for key, value in (
            ("GITHUB_ACTIONS", None), ("GITHUB_ACTIONS", "false"),
            ("DB_URL", None), ("DB_URL", "postgresql://postgres:postgres@remote/postgres"),
            ("DB_URL", ENV["DB_URL"] + "?host=remote"),
            ("SUPABASE_INTERNAL_IMAGE_REGISTRY", None),
            ("SUPABASE_INTERNAL_IMAGE_REGISTRY", "docker.io"),
            ("SUPABASE_INTERNAL_IMAGE_REGISTRY", "public.ecr.aws.attacker.invalid"),
        ):
            env = dict(ENV)
            if value is None:
                del env[key]
            else:
                env[key] = value
            with self.subTest(key=key, value=value), mock.patch.object(prefetch.subprocess, "run") as run:
                with self.assertRaises(ValueError):
                    prefetch.prefetch("ab", env)
                run.assert_not_called()

    def test_wrong_cli_version_prevents_all_pulls(self):
        for version in ("", "2.34.1\n", "2.34.0\nmalformed", "v2.34.0"):
            result = subprocess.CompletedProcess(["supabase", "--version"], 0, stdout=version)
            with self.subTest(version=version), mock.patch.object(prefetch.subprocess, "run", return_value=result) as run:
                with self.assertRaises(ValueError):
                    prefetch.prefetch("ab", ENV)
                self.assertEqual(run.call_count, 1)
                self.assertEqual(run.call_args.args[0], ["supabase", "--version"])

    def test_cli_probe_failures_prevent_all_pulls(self):
        for error in (FileNotFoundError("supabase"),
                      subprocess.CalledProcessError(1, ["supabase", "--version"]),
                      subprocess.TimeoutExpired(["supabase", "--version"], 15)):
            with self.subTest(error=type(error).__name__), mock.patch.object(prefetch.subprocess, "run", side_effect=error) as run:
                with self.assertRaises(type(error)):
                    prefetch.prefetch("ab", ENV)
                self.assertEqual(run.call_count, 1)

    def test_main_returns_nonzero_for_every_operational_failure(self):
        for error in (ValueError("bad profile"), RuntimeError("pull failed"),
                      FileNotFoundError("docker"), subprocess.TimeoutExpired(["supabase"], 15),
                      subprocess.CalledProcessError(1, ["supabase"])):
            with self.subTest(error=type(error).__name__), mock.patch.object(prefetch, "prefetch", side_effect=error), \
                    contextlib.redirect_stderr(io.StringIO()) as stderr:
                self.assertEqual(prefetch.main(["--profile", "ab"]), 1)
                self.assertIn("::error::", stderr.getvalue())

    def test_main_success_uses_current_environment(self):
        with mock.patch.dict(prefetch.os.environ, ENV, clear=True), mock.patch.object(prefetch, "prefetch") as run:
            self.assertEqual(prefetch.main(["--profile", "rls"]), 0)
        run.assert_called_once_with("rls", ENV)

    def test_cli_rejects_arbitrary_image_or_missing_profile(self):
        for args in ([], ["--profile", "prod"], ["--profile", "ab", "--image", "untrusted/latest"]):
            with self.subTest(args=args), mock.patch.object(prefetch, "prefetch") as run, \
                    contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                prefetch.main(args)
            self.assertEqual(error.exception.code, 2)
            run.assert_not_called()

    def test_database_guard_image_and_cli_workflow_pins_match(self):
        source = (ROOT / "scripts/ci_database.py").read_text()
        self.assertIn(f'DB_IMAGE = "{RLS_IMAGES[0]}"', source)
        self.assertIn(f'LOCAL_DB_URL = "{ENV["DB_URL"]}"', source)
        for filename, profile in (("rls-db-tests.yml", "rls"), ("multi-tenant-ab.yml", "ab")):
            with self.subTest(workflow=filename):
                workflow = (ROOT / ".github/workflows" / filename).read_text()
                self.assertEqual(workflow.count("version: " + prefetch.CLI_VERSION), 1)
                self.assertEqual(workflow.count('      - "scripts/ci_supabase_prefetch.py"'), 2)
                self.assertIn("python3 -m unittest discover -s scripts/tests -p test_ci_supabase_prefetch.py", workflow)
                prepare = workflow.index("run: python3 scripts/ci_database.py prepare")
                pull = workflow.index(f"run: python3 scripts/ci_supabase_prefetch.py --profile {profile}")
                start = workflow.index(f"python3 scripts/ci_database.py start-guarded --profile {profile}")
                self.assertLess(prepare, pull)
                self.assertLess(pull, start)


if __name__ == "__main__":
    unittest.main()
