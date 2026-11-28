import { fileURLToPath } from "node:url";
import os from "os";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import BalancedCiSequencer from "./scripts/ci/vitest-balanced-sequencer.mjs";

// Núcleos realmente disponibles para el proceso (respeta cgroups en CI y
// aprovecha máquinas grandes como el entorno de Lovable, 64 vCPU).
const CPUS = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;

// `--shard` en CI: cada runner corre una porción y emite un reporte "blob"
// que el job de merge une para aplicar umbrales de cobertura globales.
const IS_SHARD = process.env.VITEST_SHARD_BLOB === "1";
const BLOB_OUTPUT_FILE = process.env.VITEST_BLOB_OUTPUT_FILE;
if (IS_SHARD && !BLOB_OUTPUT_FILE) {
  throw new Error("Sharded reports require VITEST_BLOB_OUTPUT_FILE in a fresh per-run directory");
}

// Suites puras .ts que no requieren DOM: evitan levantar happy-dom y jest-dom.
const NODE_PROJECT_INCLUDES = [
  "src/lib/**/*.{test,spec}.ts",
  "src/features/*/lib/**/*.{test,spec}.ts",
  "src/features/*/server/**/*.{test,spec}.ts",
  "src/features/*/utils/**/*.{test,spec}.ts",
  "src/features/*/domain-schemas.test.ts",
  "src/test/**/*.{test,spec}.ts",
];

// Excepciones explícitas dentro de NODE_PROJECT_INCLUDES que sí usan APIs DOM.
const NODE_PROJECT_DOM_EXCEPTIONS = [
  "src/features/accounts-payable/lib/__tests__/parseCfdiXml.test.ts",
  "src/features/accounts-payable/lib/__tests__/validateCfdiTotal.test.ts",
  "src/features/bank-reconciliation/lib/__tests__/xmlParsers.test.ts",
  "src/features/calendar/lib/refreshCalendarQueries.test.ts",
  "src/features/customers/lib/__tests__/customerPayload.test.ts",
  "src/features/invoices/lib/__tests__/reconciliationExportParity.test.ts",
  "src/features/reports/lib/accountantExport/__tests__/accountantPackage.test.ts",
  "src/features/reports/lib/accountantExport/__tests__/queuedCancellation.test.ts",
  "src/features/reports/lib/accountantExport/__tests__/workbookPresentation.test.ts",
  "src/lib/__tests__/exportCsvGuarded.test.ts",
  "src/lib/__tests__/exportCsvLegacy.test.ts",
  "src/lib/observability/captureOperationalError.offline.test.ts",
  "src/lib/observability/captureOperationalError.test.ts",
  "src/lib/observability/sentryInit.test.ts",
  "src/lib/observability/sentryTransport.test.ts",
  "src/lib/observability/staleChunkReload.test.ts",
  "src/lib/observability/staleChunkSentry.test.ts",
  "src/lib/pdf/assets/__tests__/globalBrandLogo.test.ts",
  "src/lib/query/__tests__/queryUpgradeLifecycle.test.ts",
  "src/test/rolePermissions.test.ts",
];

export default defineConfig({
  // Sin `babel-plugin-react-compiler` aquí: el compiler no aporta valor bajo
  // vitest/jsdom y suma tiempo de transformación en cada test file.
  plugins: [react()],

  test: {
    globals: true,
    sequence: process.env.VITEST_CI_BALANCED === "1" ? { sequencer: BalancedCiSequencer } : undefined,
    projects: [
      {
        extends: true,
        test: {
          name: "unit-node",
          environment: "node",
          setupFiles: ["./src/test/setup.node.ts"],
          include: NODE_PROJECT_INCLUDES,
          exclude: [...configDefaults.exclude, ...NODE_PROJECT_DOM_EXCEPTIONS],
        },
      },
      {
        extends: true,
        test: {
          name: "unit-dom",
          environment: "happy-dom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: [...configDefaults.exclude, ...NODE_PROJECT_INCLUDES],
        },
      },
      {
        extends: true,
        test: {
          name: "unit-dom-lib",
          environment: "happy-dom",
          setupFiles: ["./src/test/setup.ts"],
          include: NODE_PROJECT_DOM_EXCEPTIONS,
          exclude: [...configDefaults.exclude],
        },
      },
    ],
    // Paralelismo explícito: por defecto vitest usa CPUS-1 y arranca los
    // workers en frío. Fijar el máximo a todos los núcleos y precalentar un
    // piso de workers reduce el wall time tanto en runners de 4 vCPU como en
    // máquinas grandes. `forks` medido más rápido que `threads` en esta suite.
    pool: "forks",
    maxWorkers: CPUS,

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
      ? ["default", ["blob", { outputFile: BLOB_OUTPUT_FILE }]]
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
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
