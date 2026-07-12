import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
// ANALYZE=1 bun run build → /tmp/bundle-stats.html para auditorías de bundle.
// SENTRY_AUTH_TOKEN presente en CI → sube sourcemaps a Sentry (stack traces
// legibles en producción). Ausencia del token = no-op silencioso, útil para
// builds locales sin secretos.
// React Compiler (babel-plugin-react-compiler) auto-memoiza componentes/hooks
// que cumplen las Reglas de React; los que las violan quedan intactos (bail-out
// silencioso). El linter `react-compiler/react-compiler` marca esos bail-outs.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
    mode === "development" && componentTagger(),
    process.env.ANALYZE === "1" &&
      visualizer({
        filename: "/tmp/bundle-stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: false,
      }),
    // Sourcemaps para Sentry: sólo cuando el token está presente (CI).
    // Debe ir al final para procesar los assets ya emitidos por Rollup.
    process.env.SENTRY_AUTH_TOKEN &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG ?? "liftgo",
        project: process.env.SENTRY_PROJECT ?? "liftgo-web",
        authToken: process.env.SENTRY_AUTH_TOKEN,
        sourcemaps: { assets: "./dist/**" },
        telemetry: false,
      }),
  ].filter(Boolean) as import("vite").PluginOption[],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  // Deps críticas de primer render pre-bundleadas para evitar el ciclo
  // "new dependency detected → full reload" en el primer `vite dev` frío.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router",
      "react-router-dom",
      "@tanstack/react-query",
      "sonner",
      "date-fns",
      "zod",
    ],
  },
  build: {
    // Explícito para que quien lea el config sepa qué se compila. Cubre
    // Safari 16.4+, Chrome 111+, Firefox 128+ (equivalente al default
    // `baseline-widely-available` de Vite 7 y suficiente para el ERP interno).
    target: "es2022",
    // Requerido por sentryVitePlugin para mapear stack traces en producción.
    // El costo de tamaño lo absorbe gzip/brotli del hosting.
    sourcemap: true,
    // El cálculo de gzip por asset suma 3-5s a cada build en CI. Con el
    // visualizer bajo flag ANALYZE=1, no se necesita en el flujo normal.
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          for (const { name, match } of CHUNK_GROUPS) {
            if (match.some((frag) => id.includes(frag))) return name;
          }
        },
      },
    },
  },
}));

// Orden importa: los grupos específicos (recharts, radix, react-pdf...) van
// primero; `vendor` es el fallback explícito para react/react-dom/router/query.
// Los fragmentos usan separadores para evitar falsos positivos (p.ej. "react/"
// no matchea "react-hook-form").
const CHUNK_GROUPS: ReadonlyArray<{ name: string; match: readonly string[] }> = [
  { name: "recharts", match: ["recharts", "d3-"] },
  { name: "radix", match: ["@radix-ui"] },
  { name: "react-pdf", match: ["@react-pdf"] },
  { name: "jspdf", match: ["jspdf", "html2canvas", "canvg"] },
  { name: "xlsx", match: ["xlsx"] },
  { name: "date-fns", match: ["date-fns"] },
  { name: "icons", match: ["lucide-react"] },
  {
    name: "vendor",
    match: [
      "/react/",
      "/react-dom/",
      "/scheduler/",
      "/react-router/",
      "/react-router-dom/",
      "@tanstack/react-query",
    ],
  },
];
