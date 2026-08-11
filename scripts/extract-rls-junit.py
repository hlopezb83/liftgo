#!/usr/bin/env python3
"""Extrae del JUnit consolidado de Vitest el subconjunto de tests RLS.

Fase 5.2: antes los `*.rls.test.ts` corrían tres veces (shards de Vitest, job
`rls` con `test:rls`, y las suites SQL de rls-db-tests.yml). Ahora corren una
sola vez dentro de los shards; este script reconstruye `reports/rls-junit.xml`
a partir de `reports/vitest-junit.xml` para conservar el check "RLS results"
sin una segunda corrida.

Uso: python3 scripts/extract-rls-junit.py <entrada.xml> <salida.xml>
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# Archivos cuyo contenido es el contrato de RLS/roles (mismo criterio que el
# script `test:rls` de package.json).
PATTERNS = (".rls.test.ts", "roleMatrix.test.ts", "rolePermissions.test.ts")


def main() -> int:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "reports/vitest-junit.xml")
    dst = Path(sys.argv[2] if len(sys.argv) > 2 else "reports/rls-junit.xml")

    if not src.exists():
        print(f"::warning::{src} no existe; no se genera {dst}")
        return 0

    tree = ET.parse(src)
    root = tree.getroot()
    suites = root.findall(".//testsuite")
    keep = [s for s in suites if any(p in (s.get("name") or "") for p in PATTERNS)]

    out = ET.Element("testsuites", {"name": "RLS contract tests"})
    tests = failures = errors = skipped = 0
    time = 0.0
    for s in keep:
        out.append(s)
        tests += int(s.get("tests") or 0)
        failures += int(s.get("failures") or 0)
        errors += int(s.get("errors") or 0)
        skipped += int(s.get("skipped") or 0)
        time += float(s.get("time") or 0)

    out.set("tests", str(tests))
    out.set("failures", str(failures))
    out.set("errors", str(errors))
    out.set("skipped", str(skipped))
    out.set("time", f"{time:.3f}")

    dst.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(out).write(dst, encoding="utf-8", xml_declaration=True)
    print(f"{dst}: {len(keep)} archivos RLS, {tests} tests, {failures} fallos")

    if not keep:
        # No es error: en modo `--changed` puede que ningún test RLS se haya
        # visto afectado por el diff.
        print("::notice::Ningún test RLS en esta corrida (modo --changed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
