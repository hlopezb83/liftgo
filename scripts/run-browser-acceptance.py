#!/usr/bin/env python3
"""Run all seven existing browser suites in four fixed, isolated process groups.

Linux supervisors are child subreapers: Playwright's detached web servers and
browser grandchildren remain owned and are terminated/reaped after every suite,
including timeouts and cancellation. This runner never builds or filters tests.
"""
from __future__ import annotations

import argparse
import contextlib
import ctypes
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / "test-results/browser-runner"
SUITE_TIMEOUT_SECONDS = 300
RUN_TIMEOUT_SECONDS = 960
CLEANUP_GRACE_SECONDS = 3
STOP_SIGNAL = 0
CONFIGS = {
    "mobile": "playwright.mobile.config.ts",
    "invoice": "playwright.invoice-ui.config.ts",
    "quotes": "playwright.quotes-design.config.ts",
    "inventory": "playwright.inventory-design.config.ts",
    "bookings": "tests/bookings/playwright.config.ts",
    "group-c-app": "playwright.group-c-design.config.ts",
    "group-c-components": "playwright.group-c-component.config.ts",
}
GROUPS = {
    "mobile-invoice": ("mobile", "invoice"),
    "quotes-inventory-bookings": ("quotes", "inventory", "bookings"),
    "group-c-app": ("group-c-app",),
    "group-c-components": ("group-c-components",),
}

LANES = {"a": ("mobile-invoice", "group-c-app"), "b": ("quotes-inventory-bookings", "group-c-components")}

def suite_command(suite: str) -> list[str]:
    command = ["node", "node_modules/@playwright/test/cli.js", "test", "--config", CONFIGS[suite]]
    # Required even if a future mobile config inherits smoke's output root:
    # Playwright clears outputDir at startup and must not delete other suites.
    return command + (["--output", "test-results/mobile"] if suite == "mobile" else [])


def suite_environment(suite: str, source: dict[str, str]) -> dict[str, str]:
    if suite not in CONFIGS:
        raise ValueError("Unknown fixed browser suite")
    if source.get("SMOKE_REUSE_BUILD") != "1":
        raise ValueError("A previously validated synthetic build is required; this runner never builds")
    env = {**source, "SMOKE_REUSE_BUILD": "1", "GROUP_C_BUILD_DIR": ".",
           "SMOKE_BASE_URL": "http://127.0.0.1:4173", "SMOKE_PROXY_URL": "http://127.0.0.1:4174",
           "BOOKINGS_EVIDENCE_DIR": "test-results/bookings/evidence",
           "PLAYWRIGHT_HTML_OUTPUT_DIR": f"playwright-report/{suite}"}
    if suite.startswith("group-c-"):
        env["GROUP_C_EVIDENCE_DIR"] = f"test-results/{suite}"
    return env


def enable_subreaper() -> None:
    if sys.platform != "linux":
        raise RuntimeError("Browser acceptance requires Linux child-subreaper cleanup")
    # PR_SET_CHILD_SUBREAPER makes even setsid()/detached grandchildren owned by
    # this supervisor after their parent exits. Never change host/container policy.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "Cannot enable child-subreaper cleanup")


def request_stop(signum: int, _frame: object) -> None:
    global STOP_SIGNAL
    STOP_SIGNAL = signum


@contextlib.contextmanager
def signal_handlers():
    previous = {sig: signal.signal(sig, request_stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def process_identity(pid: int) -> tuple[int, int] | None:
    try:
        # comm may contain spaces/parentheses; fields after its final ')' start
        # with state, PPID, ... and field 22 is starttime. Never inspect environ.
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return int(fields[1]), int(fields[19])
    except (FileNotFoundError, ProcessLookupError):
        return None


def descendants() -> dict[int, int]:
    rows = {}
    for entry in Path("/proc").iterdir():
        if entry.name.isdecimal():
            identity = process_identity(int(entry.name))
            if identity:
                rows[int(entry.name)] = identity
    owned = {os.getpid()}
    result = {}
    while True:
        added = {pid for pid, (ppid, _started) in rows.items() if ppid in owned and pid not in owned}
        if not added:
            return result
        owned.update(added)
        result.update({pid: rows[pid][1] for pid in added})


def signal_owned(pid: int, started: int, signum: int) -> None:
    identity = process_identity(pid)
    # A disappearing process/PID reuse must never signal another process.
    if identity is not None and identity[1] == started:
        try:
            os.kill(pid, signum)
        except ProcessLookupError:
            pass


def reap_children() -> None:
    while True:
        try:
            if os.waitpid(-1, os.WNOHANG)[0] == 0:
                return
        except ChildProcessError:
            return


def cleanup_descendants(grace: float = CLEANUP_GRACE_SECONDS) -> bool:
    deadline = time.monotonic() + grace
    notified = set()
    while True:
        reap_children()
        remaining = descendants()
        if not remaining:
            return True
        for pid, started in remaining.items():
            if (pid, started) not in notified:
                signal_owned(pid, started, signal.SIGTERM)
                notified.add((pid, started))
        if time.monotonic() >= deadline:
            break
        time.sleep(0.05)
    # Re-scan while killing: children can become adopted or fork during a
    # graceful shutdown. Subreaping prevents detached orphans escaping this tree.
    deadline = time.monotonic() + 2
    while True:
        reap_children()
        remaining = descendants()
        if not remaining:
            return True
        for pid, started in remaining.items():
            signal_owned(pid, started, signal.SIGKILL)
        if time.monotonic() >= deadline:
            reap_children()
            return not descendants()
        time.sleep(0.05)


def run_suite(suite: str, env: dict[str, str], log_dir: Path = LOG_DIR,
              timeout: float = SUITE_TIMEOUT_SECONDS, cleanup_grace: float = CLEANUP_GRACE_SECONDS) -> int:
    command = suite_command(suite)
    child_env = suite_environment(suite, env)
    log_dir.mkdir(parents=True, exist_ok=True)
    result = 1
    child = None
    with (log_dir / f"{suite}.log").open("w") as log:
        try:
            child = subprocess.Popen(command, cwd=ROOT, env=child_env, stdin=subprocess.DEVNULL,
                                     stdout=log, stderr=subprocess.STDOUT, shell=False, start_new_session=True)
            deadline = time.monotonic() + timeout
            while True:
                if STOP_SIGNAL:
                    result = 128 + STOP_SIGNAL
                    log.write(f"\nRunner cancelled by signal {STOP_SIGNAL}\n")
                    break
                code = child.poll()
                if code is not None:
                    result = code if code >= 0 else 128 - code
                    break
                if time.monotonic() >= deadline:
                    result = 124
                    log.write(f"\nRunner suite timeout after {timeout}s\n")
                    break
                time.sleep(0.05)
        except OSError as error:
            log.write(f"\nCould not launch suite: {error}\n")
            result = 127
        finally:
            if not cleanup_descendants(cleanup_grace):
                log.write("\nRunner could not clean all descendants; group must stop\n")
                result = 125
            if child is not None:
                child.wait(timeout=1)
    # Keep full logs as artifacts and expose their final summaries in Actions.
    print(f"::group::Browser acceptance {suite} summary", flush=True)
    print("\n".join((log_dir / f"{suite}.log").read_text(errors="replace").splitlines()[-40:]), flush=True)
    print("::endgroup::", flush=True)
    print(f"[browser acceptance] {suite}: exit {result}; log {log_dir / (suite + '.log')}", flush=True)
    return result


def run_group(group: str, env: dict[str, str], log_dir: Path = LOG_DIR) -> int:
    suites = GROUPS[group]
    enable_subreaper()
    records = []
    with signal_handlers():
        try:
            for suite in suites:
                if STOP_SIGNAL:
                    break
                started = time.monotonic()
                code = run_suite(suite, env, log_dir)
                records.append({"suite": suite, "exit_code": code, "seconds": round(time.monotonic() - started, 2)})
                # Ordinary test failures do not suppress any later suite. Only
                # cancellation or an unsafe cleanup failure stops this group.
                if code == 125:
                    break
        finally:
            clean = cleanup_descendants()
            log_dir.mkdir(parents=True, exist_ok=True)
            (log_dir / f"{group}.json").write_text(json.dumps({"group": group, "suites": records, "cleanup": clean}, indent=2) + "\n")
    if STOP_SIGNAL:
        return 128 + STOP_SIGNAL
    return int(not clean or len(records) != len(suites) or any(row["exit_code"] != 0 for row in records))


def run_all(env: dict[str, str], lane: str | None = None) -> int:
    groups = tuple(GROUPS) if lane is None else LANES[lane]
    # Validate build reuse before launching even one supervisor.
    for suite in CONFIGS:
        suite_environment(suite, env)
    enable_subreaper()
    children = {}
    results = {}
    with signal_handlers():
        try:
            for group in groups:
                if STOP_SIGNAL:
                    break
                children[group] = subprocess.Popen(
                    [sys.executable, str(Path(__file__).resolve()), "--group", group],
                    cwd=ROOT, env=env, stdin=subprocess.DEVNULL, shell=False, start_new_session=True)
            deadline = time.monotonic() + RUN_TIMEOUT_SECONDS
            while len(results) < len(children) and not STOP_SIGNAL:
                for group, child in children.items():
                    code = child.poll()
                    if code is not None and group not in results:
                        results[group] = code
                        print(f"[browser acceptance] group {group}: exit {code}", flush=True)
                if time.monotonic() >= deadline:
                    print("::error::Browser acceptance supervisor timeout", file=sys.stderr)
                    break
                time.sleep(0.05)
        finally:
            clean = cleanup_descendants()
            for child in children.values():
                child.wait(timeout=1)
    if STOP_SIGNAL:
        return 128 + STOP_SIGNAL
    return int(not clean or len(results) != len(groups) or any(code != 0 for code in results.values()))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group", choices=tuple(GROUPS), help=argparse.SUPPRESS)
    parser.add_argument("--lane", choices=tuple(LANES))
    args = parser.parse_args(argv)
    if args.group and args.lane:
        parser.error("group and lane are mutually exclusive")
    try:
        return run_group(args.group, dict(os.environ)) if args.group else run_all(dict(os.environ), args.lane)
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(f"::error::{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
