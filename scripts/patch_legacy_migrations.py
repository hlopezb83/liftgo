#!/usr/bin/env python3
"""Parcha (SOLO en el checkout del runner) migraciones históricas que no aplican
desde cero.

Contexto: algunas migraciones antiguas se escribieron contra la base de
producción, donde una tabla ya existía por otro camino. Al reconstruir la DB con
`supabase db reset` esas migraciones corren en orden cronológico y fallan con
`relation "public.x" does not exist` (SQLSTATE 42P01), tumbando el job de
rls-db-tests antes de correr un solo test.

No se pueden reordenar ni reescribir las migraciones ya aplicadas en producción
(el CLI las identifica por timestamp + contenido). Por eso este script envuelve
las sentencias problemáticas en un guard `IF to_regclass(...) IS NOT NULL` en la
copia efímera del runner, justo antes de levantar Supabase. En producción no
cambia nada: la migración ya está registrada como aplicada.

Uso: python3 scripts/patch_legacy_migrations.py [--check]
  --check  no escribe; devuelve 1 si algún parche haría falta (útil en local).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

MIGRATIONS = Path("supabase/migrations")

# (prefijo del archivo, relación que aún no existe en ese punto del historial)
OUT_OF_ORDER: list[tuple[str, str]] = [
    # La tabla se crea en 20260720011916; esta migración es de mayo.
    ("20260515044551", "collection_reminders_log"),
]


def split_statements(sql: str) -> list[str]:
    """Corta por `;` de nivel superior, respetando bloques dollar-quoted."""
    out: list[str] = []
    buf = ""
    i = 0
    tag: str | None = None
    while i < len(sql):
        if tag is None:
            m = re.match(r"\$[a-zA-Z_]*\$", sql[i:])
            if m:
                tag = m.group(0)
                buf += tag
                i += len(tag)
                continue
            if sql[i] == ";":
                out.append(buf + ";")
                buf = ""
                i += 1
                continue
        else:
            if sql.startswith(tag, i):
                buf += tag
                i += len(tag)
                tag = None
                continue
        buf += sql[i]
        i += 1
    if buf.strip():
        out.append(buf)
    return out


def guard(stmt: str, relation: str) -> str:
    body = stmt.strip().rstrip(";").strip()
    # $lgp$ como tag para no chocar con comillas del SQL original.
    return (
        f"DO $lgp_guard$\nBEGIN\n"
        f"  IF to_regclass('public.{relation}') IS NOT NULL THEN\n"
        f"    EXECUTE $lgp${body}$lgp$;\n"
        f"  END IF;\nEND $lgp_guard$;"
    )


def patch_file(path: Path, relation: str, write: bool) -> bool:
    sql = path.read_text()
    if f"to_regclass('public.{relation}')" in sql:
        return False  # ya parchado
    needle = re.compile(rf"\bpublic\.{re.escape(relation)}\b")
    changed = False
    pieces = []
    for stmt in split_statements(sql):
        if needle.search(stmt) and "$" not in stmt:
            pieces.append(guard(stmt, relation) + "\n")
            changed = True
        else:
            pieces.append(stmt)
    if changed and write:
        path.write_text("".join(pieces))
    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    pending = 0
    for prefix, relation in OUT_OF_ORDER:
        matches = sorted(MIGRATIONS.glob(f"{prefix}*.sql"))
        if not matches:
            print(f"::warning::no se encontró migración {prefix}* (¿renombrada?)")
            continue
        for path in matches:
            if patch_file(path, relation, write=not args.check):
                pending += 1
                verb = "requiere parche" if args.check else "parchada"
                print(f"{verb}: {path.name} → guard sobre public.{relation}")

    if not pending:
        print("Sin parches pendientes.")
    return 1 if (args.check and pending) else 0


if __name__ == "__main__":
    sys.exit(main())
