import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke de arranque: única prueba de navegador que corre en CI.
 *
 * Sirve el build REAL (`dist/` + `wrangler dev`, el mismo empaquetado que se
 * publica) y comprueba que la app arranca sin errores de página. Ese es
 * exactamente el fallo que se escapaba antes: `__name is not defined`, un error
 * de empaquetado que ni el typecheck ni las pruebas unitarias detectan.
 *
 * NO usa autenticación, NO siembra datos y NO habla con ningún backend real:
 * el build de CI apunta a un Supabase inexistente a propósito. Por eso las
 * pruebas E2E completas viven en `playwright.config.ts` y son bajo demanda.
 */
const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:4173";

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
  },
  webServer: {
    // El job de CI ya compiló `dist/`; aquí solo se sirve.
    command: process.env.SMOKE_REUSE_BUILD ? "bun run preview" : "bun run build && bun run preview",
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
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
