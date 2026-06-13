import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // En CI emitimos JUnit + JSON para que el job pueda subir artifacts y
    // GitHub muestre el resumen de tests fallidos sin perder la salida humana.
    reporters: process.env.CI
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
      thresholds: {
        lines: 13,
        functions: 9,
        statements: 13,
        branches: 12,
      },

    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});

