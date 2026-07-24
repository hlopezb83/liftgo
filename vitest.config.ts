import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
    // En CI emitimos JUnit + JSON para que el job pueda subir artifacts y
    // GitHub muestre el resumen de tests fallidos sin perder la salida humana.
    // Cuando VITEST_RLS_JUNIT=1 (script test:rls), el JUnit apunta al archivo
    // que consume el check "RLS results" de mikepenz/action-junit-report.
    // Mantener la salida en config (no CLI) evita problemas de parseo de flags
    // múltiples por parte de bun/vitest v4 entre entornos.
    reporters: process.env.VITEST_RLS_JUNIT
      ? ["default", ["junit", { outputFile: "reports/rls-junit.xml" }]]
      : process.env.CI
      ? ["default", ["junit", { outputFile: "reports/vitest-junit.xml" }], ["json", { outputFile: "reports/vitest.json" }]]
      : ["default"],
    coverage: {
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/integrations/supabase/types.ts"],
      // Umbrales conservadores: la suite todavía cubre poco. Suben gradualmente
      // por lote para evitar regresiones en la cobertura efectiva ya alcanzada.
      // Lote 2 (jun-2026): +44 tests nuevos (rentalCalculation, invoiceTotals,
      // syncInvoiceStatus, 5 PDF Documents). Medido 13.98/12.92/10.08/14.36.
      // Thresholds suben +2pp vs Lote A.1 manteniendo ~1pp de margen.
      // TESTS-ARQ2 (v7.220.0 DIFF 5): margen real + blindaje del dominio de
      // dinero. Global sube +1pp (medido ~14/10/14.4/13, ~0.5pp de margen);
      // per-directory 60/55 sobre lib/domain e invoice/AP libs para que
      // regresiones en el core fiscal fallen el build de inmediato.
      thresholds: {
        lines: 14,
        functions: 10,
        statements: 14,
        branches: 12.5,
        "src/lib/domain/**": {
          lines: 60,
          functions: 60,
          statements: 60,
          branches: 55,
        },
        "src/features/invoices/lib/**": {
          lines: 55,
          functions: 55,
          statements: 55,
          branches: 50,
        },
        "src/features/accounts-payable/lib/**": {
          lines: 55,
          functions: 55,
          statements: 55,
          branches: 50,
        },
      },

    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});

