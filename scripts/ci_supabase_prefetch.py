#!/usr/bin/env python3
"""Pull the exact CLI 2.34.0 bootstrap images concurrently; never start a DB.

The CLI downloads realtime/storage images to initialize their schemas even when
those services are excluded by the RLS profile. Only image downloads overlap:
the existing empty-DB, ownership, cron-OFF and migration guards remain unchanged.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import re
import subprocess
import sys
import time


CLI_VERSION = "2.34.0"
REGISTRY = "public.ecr.aws"
LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
PULL_TIMEOUT_SECONDS = 240
MAX_CONCURRENT_PULLS = 2
RETRY_DELAY_SECONDS = 2
BOOTSTRAP_IMAGES = (
    f"{REGISTRY}/supabase/postgres:17.4.1.068",
    f"{REGISTRY}/supabase/realtime:v2.41.11",
    f"{REGISTRY}/supabase/storage-api:v1.26.1",
    f"{REGISTRY}/supabase/gotrue:v2.177.0",
)
API_IMAGES = (
    f"{REGISTRY}/supabase/kong:2.8.1",
    f"{REGISTRY}/supabase/postgrest:v13.0.4",
)


def images_for_profile(profile: str, env: dict[str, str]) -> tuple[str, ...]:
    """No caller-provided image, registry, tag, Docker option or arbitrary URL."""
    if profile not in ("rls", "ab"):
        raise ValueError("Unsupported Supabase prefetch profile")
    if env.get("GITHUB_ACTIONS") != "true" or env.get("DB_URL") != LOCAL_DB_URL:
        raise ValueError("Prefetch requires the fixed disposable GitHub Actions database profile")
    if env.get("SUPABASE_INTERNAL_IMAGE_REGISTRY") != REGISTRY:
        raise ValueError("Supabase image registry differs from the reviewed inventory")
    return BOOTSTRAP_IMAGES + (API_IMAGES if profile == "ab" else ())


def diagnostic(error: BaseException, env: dict[str, str]) -> str:
    """Bounded Docker error evidence, without env values or signed/auth URLs."""
    if isinstance(error, subprocess.TimeoutExpired):
        return "prefetch time budget exhausted"
    raw = getattr(error, "stderr", None) or getattr(error, "stdout", None) or str(error)
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    for key, value in env.items():
        if len(value) >= 8 and re.search(r"token|password|secret|credential|key", key, re.I):
            raw = raw.replace(value, "[redacted]")
    raw = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", raw)
    raw = re.sub(r"[a-z][a-z0-9+.-]*://[^\s\"'<>]+", "[URL]", raw, flags=re.I)
    raw = re.sub(r"\b(?:Bearer|Basic)\s+\S+", "[authorization]", raw, flags=re.I)
    raw = re.sub(r"\b(?:token|password|secret|credential|access_key)(?:_\w+)?\s*[=:]\s*\S+",
                 "[credential]", raw, flags=re.I)
    # Single line and escaped percent prevent annotation/control injection.
    raw = " ".join(raw.split()).replace("%", "%25")
    return raw[:800] or type(error).__name__


def is_transient(error: BaseException) -> bool:
    if not isinstance(error, subprocess.CalledProcessError):
        return False
    raw = str(error.stderr or error.stdout or "").lower()
    # Never retry authentication, access denials, absent tags or local failures.
    if re.search(r"unauthori[sz]ed|forbidden|denied|manifest unknown|name unknown|not found|no space left|\b40[134]\b", raw):
        return False
    return bool(re.search(
        r"toomanyrequests|too many requests|rate exceeded|\b429\b|\b50[0234]\b|"
        r"connection reset|connection refused|temporary failure|i/o timeout|tls handshake timeout|"
        r"unexpected eof|context deadline exceeded|service unavailable", raw))


def pull_image(image: str, env: dict[str, str], deadline: float) -> None:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise subprocess.TimeoutExpired(["docker", "pull", "--quiet", image], PULL_TIMEOUT_SECONDS)
    subprocess.run(["docker", "pull", "--quiet", image], check=True, capture_output=True,
                   text=True, timeout=remaining, env=env)


def prefetch(profile: str, env: dict[str, str]) -> None:
    images = images_for_profile(profile, env)
    version = subprocess.run(
        ["supabase", "--version"], check=True, capture_output=True, text=True, timeout=15, env=env,
    ).stdout.strip()
    if version != CLI_VERSION:
        raise ValueError("Supabase CLI version differs from the reviewed image inventory")

    started_at = time.monotonic()
    deadline = started_at + PULL_TIMEOUT_SECONDS
    failures = {}
    # The first measured 4/6-way burst failed immediately for most pulls, while
    # all six public tags were independently confirmed available. Moderate the
    # burst; expose the exact sanitized error rather than assuming its cause.
    # The shared deadline includes queued pulls and any retry, not 240s each.
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_PULLS) as pool:
        futures = {
            pool.submit(pull_image, image, env, deadline): image
            for image in images
        }
        for future in as_completed(futures):
            image = futures[future]
            try:
                future.result()
            except (subprocess.SubprocessError, OSError) as error:
                failures[image] = error
                print(f"[prefetch] {image}: attempt 1 failed: {diagnostic(error, env)}", flush=True)
            else:
                print(f"Fetched {image}", flush=True)

    # Retry only observed transient errors, once, serially, after the first wave
    # has fully finished. Permanent failures remain fatal. No registry fallback.
    for image in images:
        error = failures.get(image)
        if error is None or not is_transient(error) or deadline - time.monotonic() <= RETRY_DELAY_SECONDS:
            continue
        time.sleep(RETRY_DELAY_SECONDS)
        print(f"[prefetch] Retrying transient pull once: {image}", flush=True)
        try:
            pull_image(image, env, deadline)
        except (subprocess.SubprocessError, OSError) as retry_error:
            failures[image] = retry_error
            print(f"[prefetch] {image}: attempt 2 failed: {diagnostic(retry_error, env)}", flush=True)
        else:
            del failures[image]
            print(f"Fetched {image} (attempt 2)", flush=True)

    if failures:
        raise RuntimeError("Supabase image prefetch failed: " + "; ".join(
            f"{image}: {diagnostic(error, env)}" for image, error in sorted(failures.items())))
    print(f"Supabase prefetch complete: {len(images)} images in {time.monotonic() - started_at:.1f}s")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("rls", "ab"), required=True)
    args = parser.parse_args(argv)
    try:
        prefetch(args.profile, dict(os.environ))
    except (ValueError, RuntimeError, subprocess.SubprocessError, OSError) as error:
        print(f"::error::{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
