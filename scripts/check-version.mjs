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
