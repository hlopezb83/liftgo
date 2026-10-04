import os from "os";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Núcleos realmente disponibles para el proceso (respeta cgroups en CI y
// aprovecha máquinas grandes como el entorno de Lovable, 64 vCPU).
const CPUS = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;

// `--shard` en CI: cada runner corre una porción y emite un reporte "blob"
// que el job de merge une para aplicar umbrales de cobertura globales.
const IS_SHARD = process.env.VITEST_SHARD_BLOB === "1";

export default defineConfig({
  // Sin `babel-plugin-react-compiler` aquí: el compiler no aporta valor bajo
  // vitest/jsdom y suma tiempo de transformación en cada test file.
  plugins: [react()],

  test: {
    // happy-dom es ~2-3× más rápido que jsdom y suficiente para el 99% de la
    // suite. Los tests que necesiten jsdom (p.ej. serialización de estilos de
    // @react-pdf/renderer) deben declarar `// @vitest-environment jsdom` en
    // el docblock del archivo.
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Paralelismo explícito: por defecto vitest usa CPUS-1 y arranca los
    // workers en frío. Fijar el máximo a todos los núcleos y precalentar un
    // piso de workers reduce el wall time tanto en runners de 4 vCPU como en
    // máquinas grandes. `forks` medido más rápido que `threads` en esta suite.
    // Vitest 4 eliminó `test.poolOptions`: maxWorkers/minWorkers son top-level.
    pool: "forks",
    maxWorkers: CPUS,
    minWorkers: Math.min(4, CPUS),

    // Zona horaria fija: la aritmética de fechas de negocio (vencimientos,
    // periodos de renta) daba resultados distintos según el TZ del runner.
    //
    // Supabase ficticio (loopback): la suite es OFFLINE. Sin esto, Bun/Vite
    // cargan el .env del proyecto y cualquier cliente creado en un test
    // apuntaría al backend PRODUCTIVO. Estos valores ganan sobre .env.
    env: {
      TZ: "UTC",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_offline",
      VITE_SUPABASE_PROJECT_ID: "test-offline",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_offline",
      SUPABASE_PROJECT_ID: "test-offline",
    },


    // En CI emitimos JUnit + JSON para que el job pueda subir artifacts y
    // GitHub muestre el resumen de tests fallidos sin perder la salida humana.
    // Cuando VITEST_RLS_JUNIT=1 (script test:rls), el JUnit apunta al archivo
    // que consume el check "RLS results" de mikepenz/action-junit-report.
    // Mantener la salida en config (no CLI) evita problemas de parseo de flags
    // múltiples por parte de bun/vitest v4 entre entornos.
    // En modo shard añadimos el reporter humano junto al blob: el merge sigue
    // consumiendo el blob, pero el log del shard muestra QUÉ test falló.
    reporters: IS_SHARD
      ? ["default", "blob"]
      : process.env.VITEST_RLS_JUNIT
      ? ["default", ["junit", { outputFile: "reports/rls-junit.xml" }]]
      : process.env.CI
      ? ["default", ["junit", { outputFile: "reports/vitest-junit.xml" }], ["json", { outputFile: "reports/vitest.json" }]]
      : ["default"],
    coverage: {
      // json-summary + json: los consume davelosert/vitest-coverage-report-action
      // para comentar la cobertura en el PR (job tests-merge).
      reporter: ["text", "html", "lcov", "json-summary", "json"],
      reportsDirectory: "reports/coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/integrations/supabase/types.ts"],
      // Base consolidada 2026-10-03: L49.73/S48.41/F39.20/B43.59.
      // El margen permite cambios pequeños sin perder la protección alcanzada.
      // En modo shard los umbrales NO aplican (cada runner ve solo su porción
      // del código); el job de merge recalcula la cobertura completa y ahí sí
      // se evalúan.
      thresholds: IS_SHARD
        ? undefined
        : {
            lines: 48,
            functions: 38,
            statements: 47,
            branches: 42,
            "src/lib/domain/**": {
              lines: 95,
              functions: 92,
              statements: 94,
              branches: 85,
            },
            // Base invoices: L82.85/S81.48/F89.81/B74.54.
            "src/features/invoices/lib/**": {
              lines: 81,
              functions: 88,
              statements: 80,
              branches: 73,
            },
            "src/features/accounts-payable/lib/**": {
              lines: 85,
              functions: 94,
              statements: 84,
              branches: 74,
            },
          },

    },
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
