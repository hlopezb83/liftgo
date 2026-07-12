import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

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
    // Warmup: precalienta el grafo de módulos de las rutas críticas para
    // que el primer render en dev no espere transforms secuenciales.
    // `routes/router.tsx` es el punto de arranque real tras la migración
    // a react-router v8 (Data Router).
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/routes/router.tsx",
        "./src/layouts/AppSidebar.tsx",
        "./src/routes/routes-config.tsx",
      ],
    },
  },
  preview: {
    host: "::",
    port: 8080,
  },
  plugins: [
    // plugin-react v6 usa Oxc para JSX/HMR. El React Compiler corre como
    // preset de Babel vía @rolldown/plugin-babel: auto-memoiza componentes/hooks
    // que cumplen las Reglas de React y hace bail-out silencioso en los que no.
    // El linter `react-compiler/react-compiler` reporta los bail-outs.
    react(),
    babel({
      presets: [reactCompilerPreset({ target: "19" })],
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
  ],

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
      "@tanstack/react-query",
      "sonner",
      "date-fns",
      "zod",
    ],
  },
  // LightningCSS como pipeline completo (transform + minify), no sólo minify.
  // Con Tailwind v4 (que ya emite CSS moderno) unifica el motor y acelera
  // la fase de CSS ~10-15% en cold build. Los `targets` alinean el output con
  // `build.target: es2022`.
  css: {
    transformer: "lightningcss",
    lightningcss: {
      targets: {
        chrome: 111 << 16,
        safari: (16 << 16) | (4 << 8),
        firefox: 128 << 16,
      },
    },
  },
  // `drop: ["debugger"]` sólo en producción: elimina cualquier `debugger;` que
  // se cuele en el bundle. `console` se preserva porque Sentry captura
  // `console.error` como breadcrumbs — dropearlo reduciría visibilidad.
  esbuild: {
    drop: mode === "production" ? ["debugger"] : [],
  },
  build: {
    // Explícito para que quien lea el config sepa qué se compila. Cubre
    // Safari 16.4+, Chrome 111+, Firefox 128+ (equivalente al default
    // `baseline-widely-available` de Vite 7 y suficiente para el ERP interno).
    target: "es2022",
    // Requerido por sentryVitePlugin para mapear stack traces en producción.
    // El costo de tamaño lo absorbe gzip/brotli del hosting.
    sourcemap: true,
    // Lightning CSS: ~15% mejor compresión que esbuild sobre Tailwind v4
    // (Vite 8 lo trae bundleado, no requiere dep extra).
    cssMinify: "lightningcss",
    // El cálculo de gzip por asset suma 3-5s a cada build en CI. Con el
    // visualizer bajo flag ANALYZE=1, no se necesita en el flujo normal.
    reportCompressedSize: false,
    // Target es2022 → todos los navegadores destino soportan
    // <link rel="modulepreload"> nativo. Sin polyfill: ~1.5 KB menos
    // inline en el HTML de entrada.
    modulePreload: { polyfill: false },
    // Con chunks vendor dedicados (react-pdf ~1.5 MB, recharts ~500 KB) el
    // warning default (500 KB) es ruido. 800 sigue detectando regresiones
    // sin falsos positivos.
    chunkSizeWarningLimit: 800,
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
      "@tanstack/react-query",
    ],
  },
];
