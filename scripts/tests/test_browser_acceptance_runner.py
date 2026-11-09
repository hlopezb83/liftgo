"""Offline runner contracts; subprocess fixtures never run a browser or build."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import contextlib
import io
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = Path(__file__).parents[2]
SCRIPT = ROOT / "scripts/run-browser-acceptance.py"
spec = spec_from_file_location("browser_acceptance_runner", SCRIPT)
runner = module_from_spec(spec)
spec.loader.exec_module(runner)
ENV = {"SMOKE_REUSE_BUILD": "1", "CI": "true", "PATH": os.environ.get("PATH", "")}
EXPECTED = {
    "mobile": ["playwright.mobile.config.ts", "--output", "test-results/mobile"],
    "invoice": ["playwright.invoice-ui.config.ts"],
    "quotes": ["playwright.quotes-design.config.ts"],
    "inventory": ["playwright.inventory-design.config.ts"],
    "bookings": ["tests/bookings/playwright.config.ts"],
    "group-c-app": ["playwright.group-c-design.config.ts"],
    "group-c-components": ["playwright.group-c-component.config.ts"],
}


class RunnerContractTests(unittest.TestCase):
    def setUp(self):
        runner.STOP_SIGNAL = 0
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.logs = Path(self.directory.name)

    def test_exact_seven_commands_have_no_build_filter_worker_or_retry_override(self):
        self.assertEqual(set(runner.CONFIGS), set(EXPECTED))
        for suite, suffix in EXPECTED.items():
            self.assertEqual(runner.suite_command(suite),
                             ["node", "node_modules/@playwright/test/cli.js", "test", "--config", *suffix])
        self.assertEqual(tuple(runner.GROUPS.values()), (
            ("mobile", "invoice"), ("quotes", "inventory", "bookings"),
            ("group-c-app",), ("group-c-components",)))
        self.assertCountEqual([suite for suites in runner.GROUPS.values() for suite in suites], EXPECTED)
        with self.assertRaises(KeyError):
            runner.suite_command("mobile --grep skipped")

    def test_reuses_build_keeps_ci_and_has_no_evidence_collisions(self):
        roots = []
        for suite in EXPECTED:
            original = {**ENV, "GROUP_C_EVIDENCE_DIR": "test-results/group-c", "GROUP_C_BUILD_DIR": "elsewhere"}
            env = runner.suite_environment(suite, original)
            self.assertEqual(env["CI"], "true")
            self.assertEqual(env["SMOKE_REUSE_BUILD"], "1")
            self.assertEqual(env["GROUP_C_BUILD_DIR"], ".")
            self.assertEqual(env["SMOKE_BASE_URL"], "http://127.0.0.1:4173")
            self.assertEqual(env["SMOKE_PROXY_URL"], "http://127.0.0.1:4174")
            self.assertEqual(original["GROUP_C_BUILD_DIR"], "elsewhere")
            roots.append(env["PLAYWRIGHT_HTML_OUTPUT_DIR"])
        self.assertEqual(len(set(roots)), 7)
        for suite in ("group-c-app", "group-c-components"):
            self.assertEqual(runner.suite_environment(suite, ENV)["GROUP_C_EVIDENCE_DIR"], f"test-results/{suite}")
        self.assertIn(["--output", "test-results/mobile"], [runner.suite_command("mobile")[-2:]])
        configs = {
            "invoice": 'outputDir: "test-results/invoice-ui"',
            "quotes": 'outputDir: "test-results/quotes-design"',
            "inventory": 'outputDir: "test-results/inventory-design"',
            "bookings": 'outputDir: "../../test-results/bookings"',
        }
        for suite, marker in configs.items():
            self.assertIn(marker, (ROOT / runner.CONFIGS[suite]).read_text())
        self.assertIn('outputDir: `${evidenceRoot}/app-results`', (ROOT / runner.CONFIGS["group-c-app"]).read_text())
        self.assertIn('outputDir: `${evidenceRoot}/component-results`', (ROOT / runner.CONFIGS["group-c-components"]).read_text())

    def test_concurrent_groups_keep_disjoint_fixed_listening_ports(self):
        expected = {
            "playwright.quotes-design.config.ts": (4187, 4188),
            "playwright.inventory-design.config.ts": (4187, 4188),
            "tests/bookings/playwright.config.ts": (4186, 4189),
            "tests/design-group-c/paths.ts": (4194, 4195, 4196, 4197),
        }
        for path, ports in expected.items():
            source = (ROOT / path).read_text()
            for port in ports:
                self.assertIn(f'http://127.0.0.1:{port}', source)
        groups = [{4173, 4174}, {4187, 4188, 4186, 4189}, {4195, 4196}, {4194, 4197}]
        for index, ports in enumerate(groups):
            for other in groups[index + 1:]:
                self.assertFalse(ports & other)

    def test_missing_reuse_guard_fails_before_any_process(self):
        for value in (None, "0", "true"):
            env = {} if value is None else {"SMOKE_REUSE_BUILD": value}
            with self.subTest(value=value), mock.patch.object(runner.subprocess, "Popen") as spawn:
                with self.assertRaises(ValueError):
                    runner.run_all(env)
                spawn.assert_not_called()
        with self.assertRaises(ValueError):
            runner.suite_environment("unknown", ENV)

    def test_four_groups_start_before_poll_and_all_failures_are_collected(self):
        started = []
        children = []

        def launch(command, **kwargs):
            self.assertEqual(command[:3], [sys.executable, str(SCRIPT.resolve()), "--group"])
            self.assertIs(kwargs["shell"], False)
            self.assertIs(kwargs["start_new_session"], True)
            self.assertEqual(kwargs["cwd"], ROOT)
            self.assertEqual(kwargs["env"], ENV)
            started.append(command[-1])
            child = mock.Mock()
            def poll():
                self.assertEqual(len(started), 4, "All four groups must launch before waiting")
                return 9 if command[-1] in ("mobile-invoice", "group-c-app") else 0
            child.poll.side_effect = poll
            children.append(child)
            return child

        with mock.patch.object(runner, "enable_subreaper"), mock.patch.object(runner, "cleanup_descendants", return_value=True), \
                mock.patch.object(runner.subprocess, "Popen", side_effect=launch), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.run_all(ENV), 1)
        self.assertEqual(started, list(runner.GROUPS))
        self.assertEqual(output.getvalue().count("group "), 4)
        for child in children:
            child.wait.assert_called_once_with(timeout=1)

    def test_group_sequences_continue_after_failed_suite(self):
        for group, suites in runner.GROUPS.items():
            codes = [17] + [0] * (len(suites) - 1)
            with self.subTest(group=group), mock.patch.object(runner, "enable_subreaper"), \
                    mock.patch.object(runner, "cleanup_descendants", return_value=True), \
                    mock.patch.object(runner, "run_suite", side_effect=codes) as run:
                self.assertEqual(runner.run_group(group, ENV, self.logs), 1)
                self.assertEqual([call.args[0] for call in run.call_args_list], list(suites))
                report = json.loads((self.logs / f"{group}.json").read_text())
                self.assertEqual([entry["exit_code"] for entry in report["suites"]], codes)

    def test_success_requires_every_suite_and_cleanup(self):
        with mock.patch.object(runner, "enable_subreaper"), \
                mock.patch.object(runner, "cleanup_descendants", return_value=True), \
                mock.patch.object(runner, "run_suite", return_value=0) as run:
            self.assertEqual(runner.run_group("quotes-inventory-bookings", ENV, self.logs), 0)
            self.assertEqual(run.call_count, 3)
        with mock.patch.object(runner, "enable_subreaper"), \
                mock.patch.object(runner, "cleanup_descendants", return_value=False), \
                mock.patch.object(runner, "run_suite", return_value=0):
            self.assertEqual(runner.run_group("quotes-inventory-bookings", ENV, self.logs), 1)

    def test_unclean_suite_stops_only_unsafe_group_and_cannot_pass(self):
        with mock.patch.object(runner, "enable_subreaper"), \
                mock.patch.object(runner, "cleanup_descendants", return_value=True), \
                mock.patch.object(runner, "run_suite", return_value=125) as run:
            self.assertEqual(runner.run_group("mobile-invoice", ENV, self.logs), 1)
            self.assertEqual(run.call_count, 1)

    def test_cancelled_group_does_not_launch_next_suite_and_is_nonzero(self):
        def cancel(*_args):
            runner.request_stop(signal.SIGTERM, None)
            return 143
        with mock.patch.object(runner, "enable_subreaper"), \
                mock.patch.object(runner, "cleanup_descendants", return_value=True), \
                mock.patch.object(runner, "run_suite", side_effect=cancel) as run:
            self.assertEqual(runner.run_group("mobile-invoice", ENV, self.logs), 143)
            self.assertEqual(run.call_count, 1)

    def test_parent_timeout_cleans_all_owned_processes_and_fails(self):
        child = mock.Mock()
        child.poll.return_value = None
        with mock.patch.object(runner, "enable_subreaper"), \
                mock.patch.object(runner, "RUN_TIMEOUT_SECONDS", 0), \
                mock.patch.object(runner, "cleanup_descendants", return_value=True) as cleanup, \
                mock.patch.object(runner.subprocess, "Popen", return_value=child), \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(runner.run_all(ENV), 1)
            cleanup.assert_called_once()

    def test_partial_supervisor_launch_failure_cleans_started_groups(self):
        with mock.patch.object(runner, "enable_subreaper"), \
                mock.patch.object(runner, "cleanup_descendants", return_value=True) as cleanup, \
                mock.patch.object(runner.subprocess, "Popen", side_effect=[mock.Mock(), OSError("spawn failed")]):
            with self.assertRaises(OSError):
                runner.run_all(ENV)
            cleanup.assert_called_once()

    def test_pid_identity_change_never_signals_reused_pid(self):
        for identity in (None, (10, 987)):
            with mock.patch.object(runner, "process_identity", return_value=identity), mock.patch.object(runner.os, "kill") as kill:
                runner.signal_owned(1234, 456, signal.SIGKILL)
                kill.assert_not_called()
        with mock.patch.object(runner, "process_identity", return_value=(10, 456)), mock.patch.object(runner.os, "kill") as kill:
            runner.signal_owned(1234, 456, signal.SIGTERM)
            kill.assert_called_once_with(1234, signal.SIGTERM)

    def test_descendant_scan_excludes_siblings_ancestors_and_unrelated_processes(self):
        entries = [Path(f"/proc/{pid}") for pid in (1, 10, 20, 21, 22, 23, 30)]
        identities = {1: (0, 1), 10: (1, 10), 20: (10, 20), 21: (20, 21),
                      22: (21, 22), 23: (10, 23), 30: (1, 30)}
        with mock.patch.object(runner.os, "getpid", return_value=20), \
                mock.patch.object(runner.Path, "iterdir", return_value=entries), \
                mock.patch.object(runner, "process_identity", side_effect=identities.get):
            self.assertEqual(runner.descendants(), {21: 21, 22: 22})

    def test_subreaper_requirement_fails_closed(self):
        with mock.patch.object(runner.sys, "platform", "darwin"), self.assertRaises(RuntimeError):
            runner.enable_subreaper()
        library = mock.Mock()
        library.prctl.return_value = -1
        with mock.patch.object(runner.ctypes, "CDLL", return_value=library), self.assertRaises(OSError):
            runner.enable_subreaper()

    def test_cli_does_not_accept_arbitrary_command_or_suite_filter(self):
        for args in (["--group", "other"], ["--command", "true"], ["--grep", "one"]):
            with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()), \
                    self.assertRaises(SystemExit) as raised:
                runner.main(args)
            self.assertEqual(raised.exception.code, 2)


@unittest.skipUnless(sys.platform == "linux", "Linux ownership and subreaper contracts")
class RealSubprocessCleanupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def supervisor_source(self, payload: str, timeout: float = 0.25, suite: str = "mobile") -> str:
        return f'''
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location("runner", {str(SCRIPT)!r})
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
r.enable_subreaper()
r.suite_command = lambda suite: [sys.executable, "-c", {payload!r}]
with r.signal_handlers():
    result = r.run_suite({suite!r}, {{"SMOKE_REUSE_BUILD":"1"}}, pathlib.Path({str(self.root)!r}), timeout={timeout!r}, cleanup_grace=0.1)
print("RESULT", result, flush=True)
sys.exit(result)
'''

    def assert_pid_gone(self, pid: int):
        self.assertFalse(Path(f"/proc/{pid}").exists(), f"Owned descendant {pid} survived cleanup")

    def test_success_and_failure_exit_codes_and_unique_logs(self):
        for suite, code in (("mobile", 0), ("invoice", 17)):
            source = self.supervisor_source(f'print("fixture {suite}"); raise SystemExit({code})', timeout=3, suite=suite)
            result = subprocess.run([sys.executable, "-c", source], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, code, result.stdout + result.stderr)
            self.assertIn(f"fixture {suite}", (self.root / f"{suite}.log").read_text())
        self.assertTrue((self.root / "mobile.log").exists())
        self.assertTrue((self.root / "invoice.log").exists())

    def detached_payload(self) -> str:
        child = f'''
import os, signal, time
from pathlib import Path
signal.signal(signal.SIGTERM, signal.SIG_IGN)
Path({str(self.root / "detached.pid")!r}).write_text(str(os.getpid()))
while True: time.sleep(0.05)
'''
        return f'''
import os, subprocess, sys, time
from pathlib import Path
Path({str(self.root / "leader.pid")!r}).write_text(str(os.getpid()))
subprocess.Popen([sys.executable, "-c", {child!r}], start_new_session=True)
while True: time.sleep(0.05)
'''

    def test_timeout_kills_and_reaps_detached_term_ignoring_grandchild(self):
        source = self.supervisor_source(self.detached_payload(), timeout=0.5)
        result = subprocess.run([sys.executable, "-c", source], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 124, result.stdout + result.stderr)
        for name in ("leader.pid", "detached.pid"):
            self.assert_pid_gone(int((self.root / name).read_text()))
        self.assertIn("suite timeout", (self.root / "mobile.log").read_text())

    def test_sigterm_cleans_detached_descendants_and_returns_143(self):
        source = self.supervisor_source(self.detached_payload(), timeout=30)
        process = subprocess.Popen([sys.executable, "-c", source], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            while not (self.root / "detached.pid").exists():
                if process.poll() is not None or time.monotonic() > deadline:
                    self.fail("Fixture failed to create detached child")
                time.sleep(0.02)
            process.send_signal(signal.SIGTERM)
            stdout, stderr = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 143, stdout + stderr)
            for name in ("leader.pid", "detached.pid"):
                self.assert_pid_gone(int((self.root / name).read_text()))
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()

    def test_successful_leader_cannot_leave_detached_child_behind(self):
        child = f'import os,time; from pathlib import Path; Path({str(self.root / "orphan.pid")!r}).write_text(str(os.getpid())); time.sleep(30)'
        payload = f'''
import subprocess,sys,time
from pathlib import Path
subprocess.Popen([sys.executable,"-c",{child!r}],start_new_session=True)
while not Path({str(self.root / "orphan.pid")!r}).exists(): time.sleep(0.01)
'''
        result = subprocess.run([sys.executable, "-c", self.supervisor_source(payload, timeout=3)],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_pid_gone(int((self.root / "orphan.pid").read_text()))


if __name__ == "__main__":
    unittest.main()
