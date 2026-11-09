#!/usr/bin/env python3
"""Supervise two fixed quality branches with bounded descendant cleanup."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import subprocess
import time

SPEC = spec_from_file_location('browser_supervisor', Path(__file__).with_name('run-browser-acceptance.py'))
supervisor = module_from_spec(SPEC)
SPEC.loader.exec_module(supervisor)
BRANCHES = ('static', 'build-smoke')


def main():
    supervisor.enable_subreaper()
    children, results = {}, {}
    with supervisor.signal_handlers():
        try:
            for branch in BRANCHES:
                children[branch] = subprocess.Popen(['bash', f'scripts/quality-{branch}.sh'],
                    stdin=subprocess.DEVNULL, start_new_session=True)
            deadline = time.monotonic() + 540
            while len(results) < len(children) and not supervisor.STOP_SIGNAL:
                for branch, child in children.items():
                    code = child.poll()
                    if code is not None:
                        results[branch] = code
                if time.monotonic() >= deadline:
                    break
                time.sleep(.05)
        finally:
            clean = supervisor.cleanup_descendants()
            for child in children.values():
                child.wait(timeout=1)
    if supervisor.STOP_SIGNAL:
        return 128 + supervisor.STOP_SIGNAL
    return int(not clean or len(results) != len(BRANCHES) or any(results.values()))


if __name__ == '__main__':
    raise SystemExit(main())
