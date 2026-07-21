#!/usr/bin/env node
// Genera public/version.json a partir del primer entry de public/changelog.json.
// Reemplaza el fetch de ~380KB por uno de <50 bytes en el arranque.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const changelogPath = resolve(root, "public/changelog.json");
const outPath = resolve(root, "public/version.json");

try {
  const raw = await readFile(changelogPath, "utf8");
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("changelog vacío");
  const version = String(arr[0]?.version ?? "unknown");
  const generatedAt = new Date().toISOString();
  await writeFile(outPath, JSON.stringify({ version, generatedAt }, null, 2) + "\n", "utf8");
  console.log(`[gen-version] public/version.json → ${version}`);
} catch (err) {
  console.error("[gen-version] fallo:", err);
  // No romper el build: escribir fallback.
  await writeFile(outPath, JSON.stringify({ version: "unknown" }, null, 2) + "\n", "utf8");
  process.exitCode = 0;
}
