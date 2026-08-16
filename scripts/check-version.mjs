#!/usr/bin/env node
// Bloque 5.5 (R4): valida que public/version.json coincida con la primera
// entrada de public/changelog.json. Se corre en el build (npm/bun run build)
// para evitar que un desarrollador olvide regenerar version.json.
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const changelogRaw = await readFile(resolve(root, "public/changelog.json"), "utf8");
const versionRaw = await readFile(resolve(root, "public/version.json"), "utf8");

const changelog = JSON.parse(changelogRaw);
const version = JSON.parse(versionRaw);

if (!Array.isArray(changelog) || changelog.length === 0) {
  console.error("[check-version] changelog.json vacío o inválido");
  process.exit(1);
}

const expected = String(changelog[0]?.version ?? "").trim();
const actual = String(version?.version ?? "").trim();

if (!expected) {
  console.error("[check-version] changelog[0].version no está definido");
  process.exit(1);
}

if (expected !== actual) {
  console.error(
    `[check-version] MISMATCH: public/version.json=${actual} pero changelog[0]=${expected}`,
  );
  console.error("[check-version] Corre `node scripts/gen-version.mjs` y vuelve a commitear.");
  process.exit(1);
}

console.log(`[check-version] OK — version.json = changelog[0] = ${expected}`);

// Guard v7.331.1: valida el esquema que consume el cliente (`changelog.ts`).
// Un `type` faltante rompía toda la página /changelog ("Entrada #0: type inválido").
const TYPES = new Set(["major", "minor", "patch"]);
const CATEGORIES = new Set(["feature", "fix", "docs", "refactor", "security"]);
const problems = [];
for (const [i, e] of changelog.entries()) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(e?.version ?? ""))) problems.push(`#${i}: versión inválida`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e?.date ?? ""))) problems.push(`#${i} (${e?.version}): fecha inválida`);
  if (!TYPES.has(e?.type)) problems.push(`#${i} (${e?.version}): type inválido`);
  if (!e?.title) problems.push(`#${i} (${e?.version}): título vacío`);
  if (e?.category !== undefined && !CATEGORIES.has(e.category)) problems.push(`#${i} (${e?.version}): category inválida`);

  const detailPath = resolve(root, `public/changelog/v${e?.version}.json`);
  let detail;
  try {
    detail = JSON.parse(await readFile(detailPath, "utf8"));
  } catch {
    problems.push(`#${i} (${e?.version}): falta public/changelog/v${e?.version}.json`);
    continue;
  }
  if (typeof detail?.description !== "string") problems.push(`v${e?.version}: description inválida`);
  if (!Array.isArray(detail?.changes) || !detail.changes.every((c) => typeof c === "string")) {
    problems.push(`v${e?.version}: changes debe ser arreglo de strings`);
  }
}
if (problems.length > 0) {
  console.error(`[check-version] ${problems.length} entrada(s) inválida(s) para /changelog:`);
  for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[check-version] OK — ${changelog.length} entradas válidas`);
