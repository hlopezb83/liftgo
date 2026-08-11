#!/usr/bin/env python3
"""Ejecuta suites SQL (RLS / smoke) contra una DB Postgres y emite un reporte JUnit.

Uso:
  python3 scripts/run_sql_suites.py \
      --db-url "$DB_URL" \
      --dir supabase/tests/rls \
      --junit reports/rls-db-junit.xml \
      --suite-name "RLS DB" \
      --mode strict

Modos:
  strict  Cada .sql corre con ON_ERROR_STOP=1. Cualquier error de psql
          (incluida una RAISE EXCEPTION de la suite) marca el test como fallido.
          Es el modo de supabase/tests/rls/*.sql, que terminan en ROLLBACK.
  smoke   Los smoke de supabase/tests/*.sql usan `\\set ON_ERROR_STOP off` y
          reportan con RAISE WARNING 'FALLO ...'. Se falla el caso si aparece
          "FALLO" en la salida o si psql retorna != 0.
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import subprocess
import sys
import time
from xml.sax.saxutils import escape, quoteattr

FALLO_RE = re.compile(r"\bFALLO\b")


def run_file(db_url: str, path: str, mode: str) -> tuple[bool, str, float]:
    cmd = ["psql", db_url, "-X", "-q", "-f", path]
    if mode == "strict":
        cmd[2:2] = ["-v", "ON_ERROR_STOP=1"]
    started = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - started
    output = (proc.stdout or "") + (proc.stderr or "")
    ok = proc.returncode == 0
    if ok and mode == "smoke" and FALLO_RE.search(output):
        ok = False
    return ok, output.strip(), elapsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-url", required=True)
    parser.add_argument("--dir", required=True)
    parser.add_argument("--junit", required=True)
    parser.add_argument("--suite-name", default="SQL")
    parser.add_argument("--mode", choices=["strict", "smoke"], default="strict")
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Incluir .sql de subdirectorios (por defecto solo el nivel dado).",
    )
    args = parser.parse_args()

    pattern = os.path.join(args.dir, "**", "*.sql") if args.recursive else os.path.join(args.dir, "*.sql")
    files = sorted(glob.glob(pattern, recursive=args.recursive))
    if not files:
        print(f"::error::No se encontraron archivos .sql en {args.dir}")
        return 1

    cases: list[tuple[str, bool, str, float]] = []
    failures = 0
    for path in files:
        name = os.path.basename(path)
        ok, output, elapsed = run_file(args.db_url, path, args.mode)
        if not ok:
            failures += 1
            print(f"::error file={path}::{args.suite_name}: {name} FALLÓ")
            print(output)
        else:
            print(f"OK  {name} ({elapsed:.2f}s)")
        cases.append((path, ok, output, elapsed))

    os.makedirs(os.path.dirname(args.junit) or ".", exist_ok=True)
    total_time = sum(c[3] for c in cases)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<testsuites name={quoteattr(args.suite_name)} tests="{len(cases)}" '
        f'failures="{failures}" time="{total_time:.3f}">',
        f'  <testsuite name={quoteattr(args.suite_name)} tests="{len(cases)}" '
        f'failures="{failures}" time="{total_time:.3f}">',
    ]
    for path, ok, output, elapsed in cases:
        classname = args.suite_name.replace(" ", "_")
        lines.append(
            f'    <testcase classname={quoteattr(classname)} '
            f'name={quoteattr(os.path.basename(path))} time="{elapsed:.3f}">'
        )
        if not ok:
            lines.append(
                f'      <failure message={quoteattr(f"{os.path.basename(path)} falló")}>'
                f"{escape(output[-8000:])}</failure>"
            )
        lines.append("    </testcase>")
    lines += ["  </testsuite>", "</testsuites>", ""]

    with open(args.junit, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    print(f"\n{args.suite_name}: {len(cases) - failures}/{len(cases)} suites OK → {args.junit}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
