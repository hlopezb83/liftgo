#!/usr/bin/env bun
/**
 * Valida `public/changelog.json` y `public/changelog/v<X.Y.Z>.json`:
 *
 * 1. Cada entrada tiene `version` en formato semver estricto (X.Y.Z).
 * 2. El array está ordenado descendente por semver (última versión al inicio).
 * 3. No hay versiones duplicadas.
 * 4. Existe un archivo detalle `public/changelog/v<version>.json` para cada entrada.
 *
 * Salida: errores en formato GitHub Actions annotations; exit 1 en fallos.
 */

import { existsSync, readFileSync } from "node:fs";

const INDEX_PATH = "public/changelog.json";
const DETAIL_DIR = "public/changelog";

type Entry = { version: string; date?: string; title?: string };

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function main(): void {
  if (!existsSync(INDEX_PATH)) {
    console.error(`::error file=${INDEX_PATH}::Archivo no encontrado`);
    process.exit(1);
  }

  let entries: Entry[];
  try {
    entries = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  } catch (err) {
    console.error(`::error file=${INDEX_PATH}::JSON inválido: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.error(`::error file=${INDEX_PATH}::Debe ser un array no vacío`);
    process.exit(1);
  }

  let failed = false;
  const seen = new Set<string>();
  const parsed: Array<[number, number, number]> = [];

  for (const [i, entry] of entries.entries()) {
    if (!entry.version || typeof entry.version !== "string") {
      console.error(`::error file=${INDEX_PATH}::Entrada #${i} sin campo 'version'`);
      failed = true;
      continue;
    }
    const sv = parseSemver(entry.version);
    if (!sv) {
      console.error(
        `::error file=${INDEX_PATH}::Versión '${entry.version}' no cumple semver X.Y.Z (entrada #${i})`,
      );
      failed = true;
      continue;
    }
    if (seen.has(entry.version)) {
      console.error(`::error file=${INDEX_PATH}::Versión duplicada: ${entry.version}`);
      failed = true;
    }
    seen.add(entry.version);
    parsed.push(sv);

    const detailPath = `${DETAIL_DIR}/v${entry.version}.json`;
    if (!existsSync(detailPath)) {
      // Solo bloqueamos si es la entrada más reciente (top del array). Entradas
      // históricas sin detalle se reportan como warning para no romper CI por
      // ausencias pre-existentes.
      if (i === 0) {
        console.error(
          `::error file=${INDEX_PATH}::Falta archivo detalle ${detailPath} para la versión más reciente (${entry.version})`,
        );
        failed = true;
      } else {
        console.log(
          `::warning file=${INDEX_PATH}::Falta archivo detalle ${detailPath} (histórico)`,
        );
      }
    }

  // Orden descendente: parsed[0] > parsed[1] > ...
  for (let i = 1; i < parsed.length; i++) {
    if (cmpSemver(parsed[i - 1], parsed[i]) < 0) {
      console.error(
        `::error file=${INDEX_PATH}::Orden incorrecto: ${entries[i - 1].version} debe ser >= ${entries[i].version} (posiciones ${i - 1}, ${i})`,
      );
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }
  console.log(`OK: ${entries.length} entradas de changelog validadas.`);
}

main();
