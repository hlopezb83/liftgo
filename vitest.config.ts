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
      // Actuales (Lote A.1): 11.63/10.38/8.18/11.82 medidos; margen de ~0.5pp.
      thresholds: {
        lines: 11,
        functions: 8,
        statements: 11,
        branches: 10,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});

