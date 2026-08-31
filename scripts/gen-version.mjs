#!/usr/bin/env node
// Genera public/version.json a partir del primer entry de public/changelog.json.
// Reemplaza el fetch de ~380KB por uno de <50 bytes en el arranque.
// También expone `version=<X.Y.Z>` en stdout para que CI capture el valor y lo
// propague al plugin de Sentry (release/sourcemaps).
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const changelogPath = resolve(root, "public/changelog.json");
const outPath = resolve(root, "public/version.json");
const recentPath = resolve(root, "public/changelog-recent.json");

// YAGNI v7.397.0: `/changelog.json` pesa ~650 KB (925+ entradas). La página
// solo necesita las versiones recientes en el primer render; el histórico
// completo se pide bajo demanda.
export const RECENT_COUNT = 60;

let version = "unknown";
try {
  const raw = await readFile(changelogPath, "utf8");
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("changelog vacío");
  version = String(arr[0]?.version ?? "unknown");
  const generatedAt = new Date().toISOString();
  await writeFile(outPath, JSON.stringify({ version, generatedAt }, null, 2) + "\n", "utf8");
  await writeFile(recentPath, JSON.stringify(arr.slice(0, RECENT_COUNT)) + "\n", "utf8");
  console.log(`[gen-version] public/version.json → ${version}`);
  console.log(`[gen-version] public/changelog-recent.json → ${Math.min(RECENT_COUNT, arr.length)} entradas`);
} catch (err) {
  console.error("[gen-version] fallo:", err);
  await writeFile(outPath, JSON.stringify({ version }, null, 2) + "\n", "utf8");
  process.exitCode = 0;
}


// Consumible por CI: última línea de stdout.
console.log(`version=${version}`);
