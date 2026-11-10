"""Inventario estático: sólo lee código local; no importa ni ejecuta TypeScript."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = "qa/facturapi6-sandbox-candidate/snapshot/supabase/functions"
ENTRYPOINTS = [
    f"{SNAPSHOT}/{name}/handler.ts" for name in (
        "stamp-cfdi", "stamp-payment-complement", "stamp-credit-note",
        "cancel-cfdi", "download-cfdi",
    )
] + ["supabase/functions/refresh-cancellation-status/handler.ts"]
# Incluye imports/export-from multilínea y literales de import() dinámico.
IMPORT = re.compile(
    r"(?:\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?[\"']([^\"']+)[\"']"
    r"|\bimport\s*\(\s*[\"']([^\"']+)[\"']\s*\))"
)
MARKERS = {
    "deno_env": re.compile(r"\bDeno\??\.env\b"),
    "serve": re.compile(r"\b(?:Deno\.serve|serve)\s*\("),
    "deno_other": re.compile(r"\bDeno\.(?!env\b|serve\b)\w+"),
    "console": re.compile(r"\bconsole\.(?:log|warn|error|info|debug)\s*\("),
}


def audit(root, entrypoints):
    """Devuelve digests y ubicaciones, nunca cuerpos de código ni valores env.

    Heurística conservadora, no parser TS: marcadores pueden incluir comentarios;
    no resuelve imports calculados, import maps ni dependencias de paquetes.
    """
    root = root.resolve()
    pending = list(entrypoints)
    files, missing, outside = {}, set(), set()
    while pending:
        relative = pending.pop()
        path = (root / relative).resolve()
        if not path.is_relative_to(root):
            outside.add(relative)
            continue
        relative = path.relative_to(root).as_posix()
        if relative in files or relative in missing:
            continue
        if not path.is_file():
            missing.add(relative)
            continue
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        imports = []
        for match in IMPORT.finditer(text):
            specifier = match.group(1) or match.group(2)
            item = {
                "specifier": specifier,
                "line": text.count("\n", 0, match.start()) + 1,
                "dynamic": match.group(2) is not None,
            }
            if specifier.startswith("."):
                target = (path.parent / specifier).resolve()
                if target.is_relative_to(root):
                    item["target"] = target.relative_to(root).as_posix()
                    pending.append(item["target"])
                else:
                    outside.add(specifier)
            imports.append(item)
        files[relative] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "imports": imports,
            "markers": {
                kind: sorted({text.count("\n", 0, m.start()) + 1 for m in pattern.finditer(text)})
                for kind, pattern in MARKERS.items()
            },
        }
    return {
        "method": "static_regex_not_runtime_or_typescript_parser",
        "entrypoints": entrypoints,
        "files": dict(sorted(files.items())),
        "missing_local": sorted(missing),
        "outside_root": sorted(outside),
        "external_specifiers": sorted({
            i["specifier"] for f in files.values() for i in f["imports"]
            if not i["specifier"].startswith(".")
        }),
    }


if __name__ == "__main__":
    print(json.dumps(audit(ROOT, ENTRYPOINTS), ensure_ascii=False, indent=2))