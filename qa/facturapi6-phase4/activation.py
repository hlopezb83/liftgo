#!/usr/bin/env python3
"""Activación y reversa de Facturapi 6.0.0 en las funciones fiscales.

Fail-closed:
- Sólo actúa si el kit coincide con MANIFEST.json (archivos revisados).
- `apply` exige el árbol exactamente en estado base (5.2.0), un run-id con
  formato fx6-prod-AAAAMMDDTHHMMZ y que la hora actual esté dentro de su
  ventana (10 min antes a 60 min después del inicio).
- `rollback` nunca se bloquea por horario; exige que cada archivo esté en
  estado base o aplicado (una activación parcial se puede revertir), pero se
  niega si algún archivo tiene cambios ajenos al kit.

Este script NO despliega: sólo cambia archivos. El despliegue se hace después
con la herramienta oficial, para las funciones de `deploy_functions`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

KIT = Path(__file__).resolve().parent
REPO = KIT.parents[1]
DEFAULT_FUNCTIONS_DIR = REPO / "supabase" / "functions"
RUN_ID_RE = re.compile(r"^fx6-prod-(\d{8}T\d{4})Z$")
WINDOW_BEFORE = timedelta(minutes=10)
WINDOW_AFTER = timedelta(minutes=60)

EXIT_OK = 0
EXIT_STATE = 2
EXIT_KIT = 3
EXIT_RUN_ID = 4


class ActivationError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_manifest(kit: Path = KIT) -> dict:
    return json.loads((kit / "MANIFEST.json").read_text(encoding="utf-8"))


def verify_kit(manifest: dict, kit: Path = KIT) -> None:
    """Comprueba que staged/ y rollback/ son exactamente los revisados."""
    problems: list[str] = []
    for entry in manifest["files"]:
        rel = entry["path"]
        if entry["result_sha256"] is not None:
            if sha256_file(kit / "staged" / rel) != entry["result_sha256"]:
                problems.append(f"staged/{rel}")
        elif (kit / "staged" / rel).exists():
            problems.append(f"staged/{rel} no debería existir")
        if entry["base_sha256"] is not None:
            if sha256_file(kit / "rollback" / rel) != entry["base_sha256"]:
                problems.append(f"rollback/{rel}")
        elif (kit / "rollback" / rel).exists():
            problems.append(f"rollback/{rel} no debería existir")
    if sha256_file(kit / "activation.patch") != manifest["activation_patch_sha256"]:
        problems.append("activation.patch")
    if problems:
        raise ActivationError(EXIT_KIT, "Kit alterado o incompleto: " + ", ".join(problems))


def file_states(manifest: dict, functions_dir: Path) -> list[tuple[str, str]]:
    """Devuelve (ruta, 'base'|'applied'|'foreign') por archivo."""
    out = []
    for entry in manifest["files"]:
        current = sha256_file(functions_dir / entry["path"])
        if current == entry["base_sha256"]:
            out.append((entry["path"], "base"))
        elif current == entry["result_sha256"]:
            out.append((entry["path"], "applied"))
        else:
            out.append((entry["path"], "foreign"))
    return out


def tree_state(manifest: dict, functions_dir: Path) -> str:
    states = {state for _, state in file_states(manifest, functions_dir)}
    if states == {"base"}:
        return "base"
    if states == {"applied"}:
        return "applied"
    if "foreign" in states:
        return "foreign"
    return "partial"


def parse_run_id(run_id: str) -> datetime:
    match = RUN_ID_RE.match(run_id or "")
    if not match:
        raise ActivationError(EXIT_RUN_ID, "run-id inválido; formato fx6-prod-AAAAMMDDTHHMMZ")
    try:
        return datetime.strptime(match.group(1), "%Y%m%dT%H%M").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise ActivationError(EXIT_RUN_ID, "run-id con fecha inexistente") from exc


def check_window(run_id: str, now: datetime) -> None:
    start = parse_run_id(run_id)
    if not (start - WINDOW_BEFORE <= now <= start + WINDOW_AFTER):
        raise ActivationError(
            EXIT_RUN_ID,
            "Fuera de la ventana autorizada del run-id; abre una ventana nueva, no reutilices otra.",
        )


def _write_atomic(dest: Path, data: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dest.parent, prefix=".fx6-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp, dest)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _materialize(manifest: dict, kit: Path, functions_dir: Path, target: str) -> None:
    source_dir = kit / ("staged" if target == "applied" else "rollback")
    key = "result_sha256" if target == "applied" else "base_sha256"
    for entry in manifest["files"]:
        dest = functions_dir / entry["path"]
        if entry[key] is None:
            if dest.exists():
                dest.unlink()
            continue
        if sha256_file(dest) != entry[key]:
            _write_atomic(dest, (source_dir / entry["path"]).read_bytes())


def apply(manifest: dict, functions_dir: Path, run_id: str, now: datetime, kit: Path = KIT) -> None:
    check_window(run_id, now)
    verify_kit(manifest, kit)
    state = tree_state(manifest, functions_dir)
    if state != "base":
        raise ActivationError(EXIT_STATE, f"Se esperaba estado base 5.2.0 y está '{state}'; no se cambió nada.")
    try:
        _materialize(manifest, kit, functions_dir, "applied")
    except Exception as exc:
        _materialize(manifest, kit, functions_dir, "base")
        raise ActivationError(
            EXIT_STATE, f"Falló la escritura ({type(exc).__name__}); se restauró la base."
        ) from exc
    final = tree_state(manifest, functions_dir)
    if final != "applied":
        _materialize(manifest, kit, functions_dir, "base")
        raise ActivationError(EXIT_STATE, f"La activación quedó '{final}'; se restauró la base.")


def rollback(manifest: dict, functions_dir: Path, run_id: str, kit: Path = KIT) -> None:
    parse_run_id(run_id)
    verify_kit(manifest, kit)
    foreign = [path for path, state in file_states(manifest, functions_dir) if state == "foreign"]
    if foreign:
        raise ActivationError(
            EXIT_STATE,
            "Hay cambios ajenos al kit; revisa antes de revertir: " + ", ".join(foreign),
        )
    _materialize(manifest, kit, functions_dir, "base")
    final = tree_state(manifest, functions_dir)
    if final != "base":
        raise ActivationError(EXIT_STATE, f"La reversa quedó '{final}'.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["check", "apply", "rollback"])
    parser.add_argument("--run-id", default="")
    parser.add_argument("--functions-dir", type=Path, default=DEFAULT_FUNCTIONS_DIR)
    args = parser.parse_args(argv)
    manifest = load_manifest()
    try:
        if args.command == "check":
            verify_kit(manifest)
            state = tree_state(manifest, args.functions_dir)
            for path, file_state in file_states(manifest, args.functions_dir):
                print(f"{file_state:8} {path}")
            print(f"estado={state}")
            return EXIT_OK if state in ("base", "applied") else EXIT_STATE
        if args.command == "apply":
            apply(manifest, args.functions_dir, args.run_id, datetime.now(timezone.utc))
            print("estado=applied (falta desplegar: " + ", ".join(manifest["deploy_functions"]) + ")")
            return EXIT_OK
        rollback(manifest, args.functions_dir, args.run_id)
        print("estado=base (falta desplegar: " + ", ".join(manifest["deploy_functions"]) + ")")
        return EXIT_OK
    except ActivationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return exc.code


if __name__ == "__main__":
    sys.exit(main())
