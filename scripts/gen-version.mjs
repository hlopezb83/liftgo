#!/usr/bin/env node
// Genera public/version.json a partir del primer entry de public/changelog.json.
// Reemplaza el fetch de ~380KB por uno de <50 bytes en el arranque.
// También expone `version=<X.Y.Z>` en stdout para que CI capture el valor y lo
// propague al plugin de Sentry (release/sourcemaps).
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceIdentity, validatedBuildIdentity } from "./release-identity.mjs";
import { validateEntries } from "./changelog-entry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// YAGNI v7.397.0: `/changelog.json` pesa ~650 KB (925+ entradas). La página
// solo necesita las versiones recientes en el primer render; el histórico
// completo se pide bajo demanda.
export const RECENT_COUNT = 60;

// Fail-closed: una entrada inválida rompe el prebuild. Antes se escribía
// `version: "unknown"` con código de salida 0 y el error llegaba a producción.
export async function generateVersion(root) {
  const changelogPath = resolve(root, "public/changelog.json");
  const outPath = resolve(root, "public/version.json");
  const recentPath = resolve(root, "public/changelog-recent.json");
  const arr = JSON.parse(await readFile(changelogPath, "utf8"));
  const errors = validateEntries(arr);
  if (errors.length > 0)
    throw new Error(`[gen-version] changelog inválido:\n${errors.join("\n")}`);

  const version = String(arr[0].version);
  // El índice y el detalle se publican por separado. Un detalle ausente puede
  // devolver el HTML de la app y fallar al expandir la versión en producción.
  // Validamos el archivo que consumirá la página antes de generar la versión.
  const detail = JSON.parse(
    await readFile(resolve(root, `public/changelog/v${version}.json`), "utf8"),
  );
  if (
    typeof detail?.description !== "string" ||
    !Array.isArray(detail?.changes) ||
    !detail.changes.every((change) => typeof change === "string")
  ) {
    throw new Error("description o changes inválidos");
  }
  const sourceSha256 = await sourceIdentity(root);
  const generatedAt = new Date().toISOString();
  await writeFile(
    outPath,
    JSON.stringify({ version, generatedAt, sourceSha256 }, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    recentPath,
    JSON.stringify(arr.slice(0, RECENT_COUNT)) + "\n",
    "utf8",
  );
  return { version, generatedAt, sourceSha256, recentCount: Math.min(RECENT_COUNT, arr.length) };
}

// Vite puede ejecutarse directamente sin los hooks prebuild/predev.
// Generar primero no sustituye la comprobación posterior contra las fuentes.
export async function prepareBuildIdentity(root) {
  await generateVersion(root);
  return validatedBuildIdentity(root);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { version, recentCount } = await generateVersion(resolve(__dirname, ".."));
  console.log(`[gen-version] public/version.json → ${version}`);
  console.log(
    `[gen-version] public/changelog-recent.json → ${recentCount} entradas`,
  );

  // Consumible por CI: última línea de stdout.
  console.log(`version=${version}`);
}
