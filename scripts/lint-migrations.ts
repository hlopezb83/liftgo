#!/usr/bin/env bun
/**
 * Guard de migraciones en public.*
 *
 * Reglas verificadas por archivo:
 * 1. Toda `CREATE TABLE public.<t>` (con o sin comillas, IF NOT EXISTS opcional) debe:
 *    - Tener al menos un `GRANT ... ON public.<t>` en el mismo archivo.
 *    - Tener `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY` en el mismo archivo.
 *    - Tener al menos un `CREATE POLICY ... ON public.<t>` en el mismo archivo.
 * 2. Toda función con `SECURITY DEFINER` debe declarar `SET search_path = public`
 *    (o `= pg_catalog, public`). Desde v7.302.0 la regla es POR FUNCIÓN: antes
 *    bastaba con que el archivo tuviera un `SET search_path` en cualquier parte,
 *    así que una segunda función sin él pasaba desapercibida.
 * 3. Prohibido `CREATE POLICY ... FOR ALL ... USING (true)` (salvo `TO service_role`,
 *    que ya bypasea RLS). Ver REGLAS PERMANENTES de migraciones.
 *
 * Las reglas 2 (por función) y 3 solo aplican a migraciones con timestamp
 * >= NEW_RULES_SINCE: el historial anterior está congelado y su estado final ya
 * fue endurecido en v7.294.0/v7.299.x (y lo vigila supabase/tests/rls/00_invariants.sql).
 *
 * Se ignoran comentarios de línea (`--`) y de bloque (`/* ... *\/`) para evitar
 * falsos positivos/negativos frecuentes con grep textual.
 *
 * Uso:
 *   bun scripts/lint-migrations.ts <file1.sql> [file2.sql ...]
 * Sin args: analiza todos los archivos en supabase/migrations/*.sql.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = "supabase/migrations";

/** Migraciones con timestamp >= a este valor deben cumplir las reglas nuevas. */
const NEW_RULES_SINCE = "20260812";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

// Sólo tres diagnósticos agregados, nunca archivos exentos. La huella exige
// revisión del texto histórico; no acredita seguridad. Ver docs/migration-lint-baseline.md.
export const HISTORICAL_BASELINE = [
  {
    file: "drizzle/migrations/0016_multi_org_phase6_numbering_fiscal_scope.sql",
    sha256: "ae3463c6e1da9c0691fdbf26c407ab46015946f285f495992a98d14a9a0fa1a2",
    table: "organization_document_counters",
    rule: "table-requirements",
    missing: ["rls", "policy"],
  },
  {
    file: "drizzle/migrations/0020_multi_org_phase7_storage_migration_ledger.sql",
    sha256: "4deaed042e6b5dc9cd4677f76ca35f7e7e17547dd548addaa24c951f7983b4f8",
    table: "storage_object_migrations",
    rule: "table-requirements",
    missing: ["grant"],
  },
  {
    file: "drizzle/migrations/0020_multi_org_phase7_storage_migration_ledger.sql",
    sha256: "4deaed042e6b5dc9cd4677f76ca35f7e7e17547dd548addaa24c951f7983b4f8",
    table: "storage_reference_migrations",
    rule: "table-requirements",
    missing: ["grant"],
  },
] as const;

function isLegacy(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  const stamp = /^(\d{8})/.exec(base)?.[1];
  return stamp !== undefined && stamp < NEW_RULES_SINCE;
}

/** Trozos `CREATE [OR REPLACE] FUNCTION nombre(...)` con su encabezado. */
function extractFunctions(sql: string): { name: string; header: string }[] {
  const starts: { name: string; index: number }[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+([\w".]+)\s*\(/gi;
  for (const m of sql.matchAll(re)) {
    starts.push({ name: unquote(m[1]), index: m.index ?? 0 });
  }
  return starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : sql.length;
    const chunk = sql.slice(s.index, end);
    // El encabezado va hasta el inicio del cuerpo (`AS $tag$` o `AS '...'`).
    const bodyAt = /\bas\s+(\$[a-z_]*\$|')/i.exec(chunk)?.index;
    return { name: s.name, header: bodyAt === undefined ? chunk : chunk.slice(0, bodyAt) };
  });
}

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
  rule: string;
  table?: string;
  missing?: string[];
  message: string;
}

export function lintSql(path: string, raw: string): Finding[] {
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
    const missingRules: string[] = [];

    const grantRegex = new RegExp(
      `grant\\s+[^;]+\\s+on\\s+(?:table\\s+)?(?:"?public"?\\.)?"?${table}"?`,
      "i",
    );
    if (!grantRegex.test(sql)) {
      missing.push(`GRANT ON public.${table}`);
      missingRules.push("grant");
    }

    const rlsRegex = new RegExp(
      `alter\\s+table\\s+(?:"?public"?\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`,
      "i",
    );
    if (!rlsRegex.test(sql)) {
      missing.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      missingRules.push("rls");
    }

    const policyRegex = new RegExp(
      `create\\s+policy\\s+[^;]+\\s+on\\s+(?:"?public"?\\.)?"?${table}"?`,
      "i",
    );
    if (!policyRegex.test(sql)) {
      missing.push(`CREATE POLICY ON public.${table}`);
      missingRules.push("policy");
    }

    if (missing.length > 0) {
      findings.push({
        file: path,
        rule: "table-requirements",
        table,
        missing: missingRules,
        message: `public.${table} creada pero faltan: ${missing.join(", ")}`,
      });
    }
  }

  // 2. SECURITY DEFINER sin search_path explícito.
  //    Postgres acepta `SET search_path = public` y `SET search_path TO 'public'`.
  const legacy = isLegacy(path);

  if (legacy) {
    // Regla histórica (por archivo) para el historial congelado.
    if (/security\s+definer/i.test(sql) && !/set\s+search_path\s*(=|to)\s+/i.test(sql)) {
      findings.push({
        file: path,
        rule: "security-definer-search-path",
        message: "Función SECURITY DEFINER sin `SET search_path = public` explícito",
      });
    }
    return findings;
  }

  // Regla por función: cada CREATE FUNCTION con SECURITY DEFINER necesita su
  // propio SET search_path en el encabezado.
  for (const fn of extractFunctions(sql)) {
    if (!/security\s+definer/i.test(fn.header)) continue;
    if (!/set\s+search_path\s*(=|to)\s+/i.test(fn.header)) {
      findings.push({
        file: path,
        rule: "security-definer-search-path",
        message: `Función SECURITY DEFINER \`${fn.name}\` sin \`SET search_path = public\` en su encabezado`,
      });
    }
  }

  // 3. CREATE POLICY ... FOR ALL ... USING (true)
  for (const stmt of sql.split(";")) {
    if (!/create\s+policy/i.test(stmt)) continue;
    if (!/\bfor\s+all\b/i.test(stmt)) continue;
    if (!/using\s*\(\s*true\s*\)/i.test(stmt)) continue;
    // `TO service_role` es aceptable: ese rol ya bypasea RLS.
    if (/\bto\s+service_role\b/i.test(stmt) && !/\bto\s+[^;]*\b(anon|authenticated|public)\b/i.test(stmt)) {
      continue;
    }
    const name = /create\s+policy\s+("[^"]+"|[\w]+)/i.exec(stmt)?.[1] ?? "(sin nombre)";
    findings.push({
      file: path,
      rule: "permissive-policy",
      message: `Policy ${name}: prohibido \`FOR ALL ... USING (true)\`. Usa has_role()/propiedad y separa por comando.`,
    });
  }

  return findings;
}

export function reviewBaseline(path: string, raw: string, findings = lintSql(path, raw)) {
  const file = relative(REPO_ROOT, resolve(path)).split(sep).join("/");
  const entries = HISTORICAL_BASELINE.filter((entry) => entry.file === file);
  // Git puede convertir LF a CRLF en el checkout; no se normaliza nada más.
  const sha256 = createHash("sha256").update(raw.replaceAll("\r\n", "\n")).digest("hex");
  const changed = entries.some((entry) => entry.sha256 !== sha256);
  const warnings: Finding[] = [];
  const errors: Finding[] = [];

  if (changed) {
    errors.push({
      file: path,
      rule: "baseline-review",
      message: "Cambió el contenido histórico: revisar el baseline en docs/migration-lint-baseline.md; no actualizar la huella automáticamente.",
    });
  }
  for (const finding of findings) {
    const index = entries.findIndex((entry) =>
      entry.file === relative(REPO_ROOT, resolve(finding.file)).split(sep).join("/") &&
      entry.rule === finding.rule && entry.table === finding.table &&
      JSON.stringify(entry.missing) === JSON.stringify(finding.missing));
    if (!changed && index >= 0) {
      warnings.push(finding);
      entries.splice(index, 1); // Una entrada sólo admite un diagnóstico.
    } else {
      errors.push(finding);
    }
  }
  return { warnings, errors };
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

  const warnings: Finding[] = [];
  const errors: Finding[] = [];
  for (const f of files) {
    const report = reviewBaseline(f, readFileSync(f, "utf8"));
    warnings.push(...report.warnings);
    errors.push(...report.errors);
  }

  for (const f of warnings) {
    console.warn(`::warning file=${f.file}::WARN baseline histórico (${f.rule}): ${f.message}`);
  }
  for (const f of errors) {
    // Formato GitHub Actions annotations.
    console.error(`::error file=${f.file}::${f.message}`);
  }
  console.log(`${errors.length === 0 ? "OK" : "FAIL"}: ${files.length} archivo(s) validado(s), ${warnings.length} WARN, ${errors.length} error(es).`);
  process.exitCode = errors.length > 0 ? 1 : 0;
}

if (import.meta.main) main();
