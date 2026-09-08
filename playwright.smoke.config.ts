import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { PRODUCTION_PROJECT_REFS } from "./tests/e2e/fixtures/productionGuard";

/**
 * Smoke de arranque: única prueba de navegador que corre en CI.
 *
 * Sirve el build REAL (`dist/` + `wrangler dev`, el mismo empaquetado que se
 * publica) y comprueba que la app arranca sin errores de página. Ese es
 * exactamente el fallo que se escapaba antes: `__name is not defined`, un error
 * de empaquetado que ni el typecheck ni las pruebas unitarias detectan.
 *
 * NO usa autenticación, NO siembra datos y NO habla con ningún backend real.
 * La configuración de backend es FICTICIA y se inyecta explícitamente aquí,
 * tanto al build como al servidor: en local no debe heredarse el `.env`
 * versionado, que apunta a producción.
 */

/** Destino inexistente a propósito. Ninguna petición suya puede resolver. */
const FAKE_BACKEND = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder-key",
  VITE_SUPABASE_PROJECT_ID: "smoke-placeholder",
} as const;

const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:4173";

/** El smoke solo puede apuntar a un servidor local que él mismo levanta. */
function assertLocalBaseURL(url: string): void {
  const host = new URL(url).hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) {
    throw new Error(
      `[smoke] SMOKE_BASE_URL debe ser local; recibido "${url}". ` +
        "Este smoke sirve el build propio, nunca un despliegue remoto.",
    );
  }
}
assertLocalBaseURL(baseURL);

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkFiles(full);
    else yield full;
  }
}

/**
 * Reutilizar `dist/` solo es válido si ese artefacto se compiló con la
 * configuración ficticia. Un `dist/` construido antes con el `.env` productivo
 * embebe el proyecto real en el bundle del navegador: el smoke intentaría
 * hablar con producción. Se comprueba antes de arrancar nada.
 */
function assertBuildUsesFakeBackend(): void {
  const dir = "dist";
  let sawFakeTarget = false;
  let files: string[];
  try {
    files = [...walkFiles(dir)];
  } catch {
    throw new Error("[smoke] SMOKE_REUSE_BUILD=1 pero no existe dist/. Compila primero.");
  }
  for (const file of files) {
    if (!/\.(js|mjs|cjs|html|json|txt|map)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const ref of PRODUCTION_PROJECT_REFS) {
      if (text.includes(ref)) {
        throw new Error(
          `[smoke] ${file} contiene el proyecto productivo (${ref}): el build no se hizo con ` +
            "la configuración ficticia. Recompila sin SMOKE_REUSE_BUILD.",
        );
      }
    }
    if (text.includes(FAKE_BACKEND.VITE_SUPABASE_PROJECT_ID)) sawFakeTarget = true;
  }
  if (!sawFakeTarget) {
    throw new Error(
      `[smoke] dist/ no contiene el destino ficticio (${FAKE_BACKEND.VITE_SUPABASE_PROJECT_ID}): ` +
        "no fue compilado por este smoke. Recompila sin SMOKE_REUSE_BUILD.",
    );
  }
}

const reuseBuild = Boolean(process.env.SMOKE_REUSE_BUILD);
if (reuseBuild) assertBuildUsesFakeBackend();

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Un service worker cacheado enmascararía errores de arranque del bundle.
    serviceWorkers: "block",
  },
  webServer: {
    // El job de CI ya compiló `dist/`; aquí solo se sirve.
    command: reuseBuild ? "bun run preview" : "bun run build && bun run preview",
    url: baseURL,
    timeout: 180_000,
    // Nunca reutilizar un servidor ajeno: podría estar sirviendo un build
    // compilado contra el backend real.
    reuseExistingServer: false,
    // Se inyecta al build Y al servidor.
    env: { ...FAKE_BACKEND },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Escape para entornos donde ya hay un Chromium instalado con otra
        // versión (p. ej. el sandbox de desarrollo). En CI se omite y se usa
        // el navegador que instala `playwright install --with-deps chromium`.
        launchOptions: process.env.SMOKE_CHROMIUM_PATH
          ? { executablePath: process.env.SMOKE_CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
