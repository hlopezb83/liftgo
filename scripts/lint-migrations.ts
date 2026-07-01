#!/usr/bin/env bun
/**
 * Guard de migraciones en public.*
 *
 * Reglas verificadas por archivo:
 * 1. Toda `CREATE TABLE public.<t>` (con o sin comillas, IF NOT EXISTS opcional) debe:
 *    - Tener al menos un `GRANT ... ON public.<t>` en el mismo archivo.
 *    - Tener `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY` en el mismo archivo.
 *    - Tener al menos un `CREATE POLICY ... ON public.<t>` en el mismo archivo.
 * 2. Toda función con `SECURITY DEFINER` debe declarar `SET search_path = public` (o `= pg_catalog, public`).
 *
 * Se ignoran comentarios de línea (`--`) y de bloque (`/* ... *\/`) para evitar
 * falsos positivos/negativos frecuentes con grep textual.
 *
 * Uso:
 *   bun scripts/lint-migrations.ts <file1.sql> [file2.sql ...]
 * Sin args: analiza todos los archivos en supabase/migrations/*.sql.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";

function stripSqlComments(sql: string): string {
  // Bloque primero, luego línea.
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

function unquote(name: string): string {
  return name.replace(/^"|"$/g, "").toLowerCase();
}

interface Finding {
  file: string;
  message: string;
}

function lintFile(path: string): Finding[] {
  const raw = readFileSync(path, "utf8");
  const sql = stripSqlComments(raw);
  const findings: Finding[] = [];

  // 1. Tablas creadas en public.*
  const createTableRegex =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  const createdTables = new Set<string>();
  for (const m of sql.matchAll(createTableRegex)) {
    // Solo cuenta si el nombre completo empieza por public. o no está calificado (default schema).
    const chunk = m[0].toLowerCase();
    if (chunk.includes("public.") || !chunk.includes(".")) {
      createdTables.add(unquote(m[1]));
    }
  }

  for (const table of createdTables) {
    const missing: string[] = [];

    const grantRegex = new RegExp(
      `grant\\s+[^;]+\\s+on\\s+(?:table\\s+)?(?:"?public"?\\.)?"?${table}"?`,
      "i",
    );
    if (!grantRegex.test(sql)) missing.push(`GRANT ON public.${table}`);

    const rlsRegex = new RegExp(
      `alter\\s+table\\s+(?:"?public"?\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`,
      "i",
    );
    if (!rlsRegex.test(sql)) {
      missing.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }

    const policyRegex = new RegExp(
      `create\\s+policy\\s+[^;]+\\s+on\\s+(?:"?public"?\\.)?"?${table}"?`,
      "i",
    );
    if (!policyRegex.test(sql)) missing.push(`CREATE POLICY ON public.${table}`);

    if (missing.length > 0) {
      findings.push({
        file: path,
        message: `public.${table} creada pero faltan: ${missing.join(", ")}`,
      });
    }
  }

  // 2. SECURITY DEFINER sin search_path explícito.
  //    Postgres acepta `SET search_path = public` y `SET search_path TO 'public'`.
  if (/security\s+definer/i.test(sql)) {
    if (!/set\s+search_path\s*(=|to)\s+/i.test(sql)) {
      findings.push({
        file: path,
        message:
          "Función SECURITY DEFINER sin `SET search_path = public` explícito",
      });
    }
  }

  return findings;
}

function resolveFiles(argv: string[]): string[] {
  if (argv.length > 0) return argv;
  try {
    return readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => join(MIGRATIONS_DIR, f));
  } catch {
    return [];
  }
}

function main(): void {
  const files = resolveFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.log("Sin migraciones SQL a validar.");
    return;
  }

  const findings: Finding[] = [];
  for (const f of files) {
    findings.push(...lintFile(f));
  }

  if (findings.length === 0) {
    console.log(`OK: ${files.length} archivo(s) validado(s), sin hallazgos.`);
    return;
  }

  for (const f of findings) {
    // Formato GitHub Actions annotations.
    console.error(`::error file=${f.file}::${f.message}`);
  }
  process.exit(1);
}

main();
