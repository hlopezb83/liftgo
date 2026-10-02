#!/usr/bin/env python3
"""Preparar y verificar una base local NUEVA de GitHub Actions, sin reset duplicado."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib

LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def require_local_ci(env: dict[str, str]) -> None:
    if env.get("GITHUB_ACTIONS") != "true" or env.get("DB_URL") != LOCAL_DB_URL:
        raise ValueError("Sólo se permite el Postgres loopback fijo de GitHub Actions")


def disable_seed(content: str) -> str:
    config = tomllib.loads(content)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", config.get("project_id", "")):
        raise ValueError("project_id local inválido")
    if config.get("db", {}).get("seed", {}).get("enabled") is False:
        return content
    lines = content.splitlines(keepends=True)
    header = next((i for i, line in enumerate(lines)
                   if re.fullmatch(r"\s*\[db\.seed\]\s*(?:#.*)?\n?", line)), None)
    if header is None:
        if "seed" in config.get("db", {}):
            raise ValueError("Formato de db.seed no soportado; no se modificó la configuración")
        result = content.rstrip() + "\n\n[db.seed]\nenabled = false\n"
    else:
        end = next((i for i in range(header + 1, len(lines))
                    if re.match(r"\s*\[", lines[i])), len(lines))
        enabled = next((i for i in range(header + 1, end)
                        if re.match(r"\s*enabled\s*=", lines[i])), None)
        if enabled is None:
            lines.insert(header + 1, "enabled = false\n")
        else:
            lines[enabled] = "enabled = false\n"
        result = "".join(lines)
    if tomllib.loads(result)["db"]["seed"]["enabled"] is not False:
        raise ValueError("No se pudo deshabilitar el seed local")
    return result


def assert_pristine(project_id: str, volumes: list[str], containers: list[str]) -> None:
    if f"supabase_db_{project_id}" in volumes or any(
        name.startswith("supabase_") and name.endswith(f"_{project_id}")
        for name in containers
    ):
        raise ValueError("El proyecto local ya tiene datos o contenedores; se exige un runner vacío")


def verify_versions(files: list[str], applied: list[str]) -> None:
    expected = []
    for name in files:
        match = re.fullmatch(r"(\d+)_.+\.sql", name)
        if not match:
            raise ValueError(f"Nombre de migración inválido: {name}")
        expected.append(match[1])
    if not expected or len(expected) != len(set(expected)):
        raise ValueError("El historial está vacío o tiene versiones duplicadas")
    if len(applied) != len(set(applied)) or set(expected) != set(applied):
        missing = sorted(set(expected) - set(applied))
        extra = sorted(set(applied) - set(expected))
        raise ValueError(f"Historial distinto: faltantes={missing}, extras={extra}")


def command_lines(command: list[str], *, env: dict[str, str] | None = None) -> list[str]:
    result = subprocess.run(command, capture_output=True, text=True, env=env, check=True)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["prepare", "verify"])
    args = parser.parse_args()
    try:
        require_local_ci(dict(os.environ))
        if args.operation == "prepare":
            config_path = Path("supabase/config.toml")
            content = config_path.read_text(encoding="utf-8")
            project_id = tomllib.loads(content)["project_id"]
            volumes = command_lines(["docker", "volume", "ls", "--format", "{{.Name}}"])
            containers = command_lines(["docker", "ps", "-a", "--format", "{{.Names}}"])
            assert_pristine(project_id, volumes, containers)
            config_path.write_text(disable_seed(content), encoding="utf-8")
            print("Runner vacío verificado; seed deshabilitado sólo en el checkout de CI")
        else:
            files = sorted(path.name for path in Path("supabase/migrations").glob("*.sql"))
            env = dict(os.environ)
            env["PGOPTIONS"] = "-c default_transaction_read_only=on"
            applied = command_lines([
                "psql", LOCAL_DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-Atc",
                "select version from supabase_migrations.schema_migrations order by version",
            ], env=env)
            verify_versions(files, applied)
            print(f"Migraciones verificadas: {len(applied)}/{len(files)}, versiones exactas")
        return 0
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        # Sólo usa credenciales públicas locales; no accede a .env ni a secrets.
        print(f"::error::{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
