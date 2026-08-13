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

# --- Guard de GRANT/REVOKE sobre funciones que aún no existen -----------------
# Varias migraciones antiguas revocan EXECUTE sobre funciones creadas en
# migraciones POSTERIORES (p. ej. public.create_notification, creada el
# 20260720, revocada el 20260608). En la nube ya existían por otro camino; al
# reconstruir desde cero fallan con 42883 y tumban `supabase start`.
# to_regprocedure() devuelve NULL en vez de lanzar error si la función no
# existe, así que la sentencia simplemente se salta en ese punto del historial.

FUNC_GRANT_RE = re.compile(r"^\s*(?:GRANT|REVOKE)\b.*\bON\s+FUNCTION\b", re.I | re.S)
FUNC_SIG_RE = re.compile(r"\bpublic\.[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)")
LEADING_COMMENTS_RE = re.compile(r"\A(?:\s*--[^\n]*\n)+")


def guard_function_stmt(stmt: str) -> str | None:
    """Envuelve un GRANT/REVOKE ON FUNCTION en un check to_regprocedure."""
    lead_match = LEADING_COMMENTS_RE.match(stmt)
    lead = lead_match.group(0) if lead_match else ""
    body = stmt[len(lead):].strip().rstrip(";").strip()
    if not FUNC_GRANT_RE.match(body) or "$" in body:
        return None
    sigs = FUNC_SIG_RE.findall(body)
    if not sigs:
        return None
    norm = [re.sub(r"\s+", " ", s).strip() for s in sigs]
    cond = "\n     AND ".join(
        "to_regprocedure('" + s + "') IS NOT NULL" for s in norm
    )
    return (
        f"{lead}DO $lgp_guard$\nBEGIN\n"
        f"  IF {cond} THEN\n"
        f"    EXECUTE $lgp${body}$lgp$;\n"
        f"  END IF;\nEND $lgp_guard$;"
    )


def patch_function_grants(path: Path, write: bool) -> int:
    sql = path.read_text()
    if "ON FUNCTION" not in sql.upper() or "to_regprocedure(" in sql:
        return 0
    changed = 0
    pieces = []
    for stmt in split_statements(sql):
        guarded = guard_function_stmt(stmt)
        if guarded is not None:
            pieces.append(guarded + "\n")
            changed += 1
        else:
            pieces.append(stmt)
    if changed and write:
        path.write_text("".join(pieces))
    return changed


# --- Guard de ADD CONSTRAINT cuyo nombre ya existe como INDEX ----------------
# Algunas migraciones antiguas crean un `CREATE UNIQUE INDEX IF NOT EXISTS foo`
# y una migración posterior hace `ADD CONSTRAINT foo UNIQUE (...)` protegida
# sólo por un check en pg_constraint. Al reconstruir desde cero el índice ya
# existe con ese nombre y el ADD CONSTRAINT falla con 42P07 (name clash).
# Ampliamos el guard para mirar también pg_class (índices/relaciones).

CONSTRAINT_GUARD_RE = re.compile(
    r"NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_constraint\s+"
    r"WHERE\s+conname\s*=\s*'([A-Za-z0-9_]+)'\s*\)",
    re.I,
)


def patch_constraint_name_clash(path: Path, write: bool) -> int:
    sql = path.read_text()
    if "pg_constraint" not in sql or "pg_class" in sql:
        return 0
    count = 0

    def repl(m: re.Match) -> str:
        nonlocal count
        count += 1
        name = m.group(1)
        return (
            "NOT EXISTS (\n"
            f"    SELECT 1 FROM pg_constraint WHERE conname = '{name}'\n"
            "    UNION ALL\n"
            "    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace\n"
            f"     WHERE c.relname = '{name}' AND n.nspname = 'public'\n"
            "  )"
        )

    out = CONSTRAINT_GUARD_RE.sub(repl, sql)
    if count and write:
        path.write_text(out)
    return count


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

    for path in sorted(MIGRATIONS.glob("*.sql")):
        n = patch_function_grants(path, write=not args.check)
        if n:
            pending += n
            verb = "requiere parche" if args.check else "parchada"
            print(f"{verb}: {path.name} → {n} GRANT/REVOKE ON FUNCTION con guard")

    for path in sorted(MIGRATIONS.glob("*.sql")):
        n = patch_constraint_name_clash(path, write=not args.check)
        if n:
            pending += n
            verb = "requiere parche" if args.check else "parchada"
            print(f"{verb}: {path.name} → {n} ADD CONSTRAINT con guard de nombre")

    if not pending:
        print("Sin parches pendientes.")
    return 1 if (args.check and pending) else 0



if __name__ == "__main__":
    sys.exit(main())
