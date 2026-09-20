#!/usr/bin/env bun
/**
 * Valida la coherencia del journal de Drizzle (`drizzle/migrations`).
 *
 * 1. Cada archivo `.sql` tiene exactamente una entrada en `_journal.json`.
 * 2. Cada entrada del journal tiene exactamente un archivo `.sql`.
 * 3. `idx` es continuo desde 0.
 * 4. `when` es entero y estrictamente creciente.
 * 5. No hay tags duplicados ni archivos duplicados.
 *
 * No toca la base de datos ni las migraciones: es sólo lectura.
 * Salida: errores en formato GitHub Actions annotations; exit 1 en fallos.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";

export const MIGRATIONS_DIR = "drizzle/migrations";
export const JOURNAL_PATH = `${MIGRATIONS_DIR}/meta/_journal.json`;

export interface JournalEntry {
  idx?: unknown;
  when?: unknown;
  tag?: unknown;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes].sort();
}

/**
 * Núcleo puro del verificador: recibe los nombres de archivo (sin extensión)
 * y las entradas del journal, y devuelve los hallazgos accionables.
 */
export function collectJournalIssues(files: string[], entries: JournalEntry[]): string[] {
  const issues: string[] = [];

  const duplicatedFiles = duplicates(files);
  if (duplicatedFiles.length > 0) {
    issues.push(`Archivos SQL duplicados en ${MIGRATIONS_DIR}: ${duplicatedFiles.join(", ")}`);
  }

  const tags = entries.map((entry) => String(entry.tag ?? ""));
  const duplicatedTags = duplicates(tags);
  if (duplicatedTags.length > 0) {
    issues.push(`Tags duplicados en el journal: ${duplicatedTags.join(", ")}`);
  }

  const fileSet = new Set(files);
  const tagSet = new Set(tags);
  const missingInJournal = files.filter((file) => !tagSet.has(file)).sort();
  const missingSql = tags.filter((tag) => !fileSet.has(tag)).sort();
  if (missingInJournal.length > 0) {
    issues.push(
      `Archivos SQL sin entrada en el journal: ${missingInJournal.join(", ")}. ` +
        `Agrega la entrada correspondiente en ${JOURNAL_PATH}.`,
    );
  }
  if (missingSql.length > 0) {
    issues.push(
      `Entradas del journal sin archivo SQL: ${missingSql.join(", ")}. ` +
        `Restaura el archivo en ${MIGRATIONS_DIR} o corrige el tag.`,
    );
  }

  const indexes = entries.map((entry) => entry.idx);
  const expected = entries.map((_, i) => i);
  if (JSON.stringify(indexes) !== JSON.stringify(expected)) {
    issues.push(
      `Los índices del journal deben ser continuos desde 0; se encontró: ${indexes.join(", ")}`,
    );
  }

  const timestamps = entries.map((entry) => entry.when);
  timestamps.forEach((value, i) => {
    if (!Number.isInteger(value)) {
      issues.push(`La entrada idx=${i} (${tags[i]}) tiene un \`when\` que no es entero: ${String(value)}`);
    }
  });
  for (let i = 1; i < timestamps.length; i += 1) {
    const prev = timestamps[i - 1];
    const current = timestamps[i];
    if (typeof prev === "number" && typeof current === "number" && current <= prev) {
      issues.push(
        `\`when\` no es estrictamente creciente: ${tags[i]} (${current}) no es mayor que ${tags[i - 1]} (${prev})`,
      );
    }
  }

  return issues;
}

function main(): void {
  if (!existsSync(JOURNAL_PATH)) {
    console.error(`::error file=${JOURNAL_PATH}::Journal de Drizzle no encontrado`);
    process.exit(1);
  }

  let entries: JournalEntry[];
  try {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as { entries?: JournalEntry[] };
    if (!Array.isArray(journal.entries)) {
      throw new Error("`entries` debe ser un array");
    }
    entries = journal.entries;
  } catch (err) {
    console.error(`::error file=${JOURNAL_PATH}::JSON inválido: ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();

  const issues = collectJournalIssues(files, entries);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`::error file=${JOURNAL_PATH}::${issue}`);
    }
    process.exit(1);
  }

  console.log(`OK: ${files.length} migraciones Drizzle registradas en orden`);
}

if (import.meta.main) {
  main();
}
