#!/usr/bin/env python3
"""Hace BLOQUEANTES los smoke SQL autocontenidos.

El paso general de smoke en rls-db-tests.yml es informativo (`continue-on-error`)
porque muchas suites históricas asumen datos que no existen en una base recién
creada. Los smoke listados en `supabase/tests/selfcontained.txt` sí crean sus
propias fixtures, así que un fallo suyo es real y debe romper el CI.

Uso: check-selfcontained-smoke.py <junit.xml> <lista.txt>
"""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def main() -> int:
    junit_path, list_path = Path(sys.argv[1]), Path(sys.argv[2])

    expected = {
        line.strip()
        for line in list_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }
    if not expected:
        print("::error::La lista de smoke autocontenidos está vacía.")
        return 1

    if not junit_path.exists():
        print(f"::error::No se generó {junit_path}: el paso de smoke no llegó a correr.")
        return 1

    seen, failed = set(), []
    for case in ET.parse(junit_path).getroot().iter("testcase"):
        name = case.get("name", "")
        if name not in expected:
            continue
        seen.add(name)
        problems = list(case.iter("failure")) + list(case.iter("error"))
        if problems:
            detail = (problems[0].get("message") or problems[0].text or "").strip()
            failed.append((name, detail[:2000]))

    missing = sorted(expected - seen)
    for name in missing:
        print(f"::error::{name} está en la lista de autocontenidos pero no se ejecutó.")
    for name, detail in failed:
        print(f"::error file=supabase/tests/{name}::Smoke autocontenido FALLÓ: {detail}")

    if missing or failed:
        return 1

    print(f"OK — {len(seen)} smoke autocontenidos en verde: {', '.join(sorted(seen))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
