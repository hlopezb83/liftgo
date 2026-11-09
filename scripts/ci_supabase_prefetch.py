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
import subprocess
import sys
import time


CLI_VERSION = "2.34.0"
REGISTRY = "public.ecr.aws"
LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
PULL_TIMEOUT_SECONDS = 240
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


def prefetch(profile: str, env: dict[str, str]) -> None:
    images = images_for_profile(profile, env)
    version = subprocess.run(
        ["supabase", "--version"], check=True, capture_output=True, text=True, timeout=15, env=env,
    ).stdout.strip()
    if version != CLI_VERSION:
        raise ValueError("Supabase CLI version differs from the reviewed image inventory")

    started_at = time.monotonic()
    failures = []
    # Four/six fixed tasks only. The context waits for every subprocess, also
    # after a failure; no orphan pulls or unobserved futures cross into startup.
    with ThreadPoolExecutor(max_workers=len(images)) as pool:
        futures = {
            pool.submit(
                subprocess.run, ["docker", "pull", "--quiet", image],
                check=True, capture_output=True, text=True, timeout=PULL_TIMEOUT_SECONDS, env=env,
            ): image
            for image in images
        }
        for future in as_completed(futures):
            image = futures[future]
            try:
                future.result()
            except subprocess.TimeoutExpired:
                failures.append(f"{image}: pull timed out")
            except subprocess.CalledProcessError as error:
                failures.append(f"{image}: docker pull exited {error.returncode}")
            except OSError:
                failures.append(f"{image}: could not execute docker pull")
            else:
                print(f"Fetched {image}", flush=True)

    if failures:
        raise RuntimeError("Supabase image prefetch failed: " + "; ".join(sorted(failures)))
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
