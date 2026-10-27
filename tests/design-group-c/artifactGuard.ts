import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildRoot, fakeBackendEnv, repositoryRoot, wranglerConfig } from "./paths.ts";

// Public project reference already blocked by the repository smoke guard.
const productionReferences = ["zxefrzfaynnfwazqhwxp"];

export function assertGroupCFakeBuild() {
  const dist = join(buildRoot, "dist");
  if (!existsSync(wranglerConfig)) throw new Error("Grupo C requiere dist/server/wrangler.json de un build ficticio local.");
  if (readdirSync(buildRoot).some(name => /^\.(?:env|dev\.vars)(?:\.|$)/.test(name))) throw new Error("El build Grupo C debe estar aislado de archivos de entorno.");
  let sawFakeProject = false, sawFakeBackend = false;
  const pending = [dist];
  while (pending.length) {
    const directory = pending.pop();
    if (!directory) break;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (/^\.(?:env|dev\.vars)(?:\.|$)/.test(entry.name)) throw new Error("El artefacto Grupo C contiene un archivo de entorno; no se leerá ni servirá.");
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("El artefacto Grupo C debe contener archivos propios, sin enlaces externos.");
      if (entry.isDirectory()) { pending.push(file); continue; }
      if (!/\.(?:js|mjs|cjs|html|json|txt|map)$/.test(entry.name)) continue;
      const source = readFileSync(file, "utf8");
      if (productionReferences.some(reference => source.includes(reference))) throw new Error("El artefacto Grupo C contiene una referencia productiva; no se servirá.");
      sawFakeProject ||= source.includes(fakeBackendEnv.VITE_SUPABASE_PROJECT_ID);
      sawFakeBackend ||= source.includes(fakeBackendEnv.VITE_SUPABASE_URL);
    }
  }
  if (!sawFakeProject || !sawFakeBackend) throw new Error("El artefacto Grupo C no demuestra el destino ficticio requerido; recompila con fakeBackendEnv.");
  // Wrangler otherwise discovers dev-secret files beside its generated config.
  // Inspect names only and fail closed without reading any secret file.
  for (const directory of [repositoryRoot, buildRoot, dirname(wranglerConfig)]) {
    if (readdirSync(directory).some(name => /^\.dev\.vars(?:\.|$)/.test(name))) throw new Error("El build Grupo C debe estar aislado de archivos .dev.vars.");
  }
}
