#!/usr/bin/env python3
"""Genera MANIFEST.json del kit de activación Facturapi 6 (sólo lectura del repo).

Uso: python3 qa/facturapi6-phase4/build_manifest.py [--check]
--check falla si el MANIFEST.json guardado difiere del calculado.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent
REPO = KIT.parents[1]
FUNCTIONS = REPO / "supabase" / "functions"

FILES = [
    "deno.json",
    "deno.lock",
    "_shared/facturapi/client.ts",
    "_shared/facturapi/withTimeout.ts",
    "_shared/facturapi/sdk5_contract_test.ts",
    "_shared/facturapi/sdk6_contract_test.ts",
    "reconcile-stamping-invoices/recoverCreditNotePdf.ts",
    "reconcile-stamping-invoices/recoverCreditNotePdf_sdk_test.ts",
]
FISCAL_CRON_JOBS = ["process-cfdi-retry-queue-5min", "reconcile-stamping-invoices-5min"]
FACTURAPI_VERSION = "6.0.0"
# dist.integrity publicado en registry.npmjs.org/facturapi/6.0.0 (verificado 2026-11-10).
FACTURAPI_INTEGRITY = (
    "sha512-A/aQnB0MgesKKrOOcHlJqmX4JMxWuHagihu9YSPao8OvXbdDKxFmAgb7IbuBz1iz14LT0SZJakrJo96XUe9w1Q=="
)
TENANT_TEST = "fc2c10e3-278b-4899-8aa1-f802752f1c38"

IMPORT_RE = re.compile(
    r"""(?:^|[;\n])\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]"""
    r"""|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]"""
    r"""|\bimport\(\s*['"]([^'"]+)['"]\s*\)""",
    re.S,
)


def sha(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def specifiers(source: str) -> list[str]:
    return [next(g for g in match.groups() if g) for match in IMPORT_RE.finditer(source)]


def reaches_facturapi(entry: Path, root: Path) -> bool:
    """Recorre imports relativos estáticos; True si algún módulo importa el paquete facturapi."""
    seen: set[Path] = set()
    stack = [entry.resolve()]
    while stack:
        current = stack.pop()
        if current in seen or not current.is_file():
            continue
        seen.add(current)
        for spec in specifiers(current.read_text(encoding="utf-8")):
            if spec == "facturapi" or spec.startswith("npm:facturapi"):
                return True
            if spec.startswith("."):
                target = (current.parent / spec).resolve()
                if root.resolve() in target.parents:
                    stack.append(target)
    return False


def deploy_functions(root: Path = FUNCTIONS) -> list[str]:
    names = []
    for index in sorted(root.glob("*/index.ts")):
        if index.parent.name.startswith("_"):
            continue
        if reaches_facturapi(index, root):
            names.append(index.parent.name)
    return names


def build() -> dict:
    files = []
    for rel in FILES:
        files.append(
            {
                "path": rel,
                "base_sha256": sha(KIT / "rollback" / rel),
                "result_sha256": sha(KIT / "staged" / rel),
            }
        )
    return {
        "kit": "facturapi6-phase4",
        "facturapi_version": FACTURAPI_VERSION,
        "facturapi_integrity": FACTURAPI_INTEGRITY,
        "functions_dir": "supabase/functions",
        "files": files,
        "activation_patch_sha256": sha(KIT / "activation.patch"),
        "phase1_patch_sha256": sha(REPO / "qa" / "facturapi6-phase1" / "phase1.patch"),
        "deploy_functions": deploy_functions(),
        "fiscal_cron_jobs": FISCAL_CRON_JOBS,
        "test_tenant": TENANT_TEST,
        "window_minutes": {"before": 10, "after": 60},
    }


def main() -> int:
    manifest = json.dumps(build(), indent=2, ensure_ascii=False) + "\n"
    target = KIT / "MANIFEST.json"
    if "--check" in sys.argv:
        if not target.is_file() or target.read_text(encoding="utf-8") != manifest:
            print("MANIFEST.json desactualizado", file=sys.stderr)
            return 1
        print("MANIFEST.json vigente")
        return 0
    target.write_text(manifest, encoding="utf-8")
    print("MANIFEST.json escrito")
    return 0


if __name__ == "__main__":
    sys.exit(main())
