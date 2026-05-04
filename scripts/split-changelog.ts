/**
 * One-shot script: divide public/changelog.json en:
 *  - public/changelog.json (índice ligero: version, date, type, title, category?)
 *  - public/changelog/v{X.Y.Z}.json (detalle: description, changes[])
 *
 * Uso: bun run scripts/split-changelog.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

interface Entry {
  version: string;
  date: string;
  type: "major" | "minor" | "patch";
  title: string;
  description: string;
  changes: string[];
  category?: string;
}

const SRC = "public/changelog.json";
const DETAIL_DIR = "public/changelog";

const raw = readFileSync(SRC, "utf8");
const entries: Entry[] = JSON.parse(raw);

if (!existsSync(DETAIL_DIR)) mkdirSync(DETAIL_DIR, { recursive: true });

const index = entries.map((e) => {
  const detail = { description: e.description, changes: e.changes };
  writeFileSync(join(DETAIL_DIR, `v${e.version}.json`), JSON.stringify(detail, null, 2));
  return {
    version: e.version,
    date: e.date,
    type: e.type,
    title: e.title,
    ...(e.category ? { category: e.category } : {}),
  };
});

writeFileSync(SRC, JSON.stringify(index, null, 2));
console.log(`OK: ${entries.length} entradas divididas. Índice: ${SRC}, detalles en ${DETAIL_DIR}/`);
