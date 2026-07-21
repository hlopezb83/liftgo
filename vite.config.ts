import { readFileSync } from "node:fs";
import path from "path";
import babel from "@rolldown/plugin-babel";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// Versión resuelta desde public/version.json (generado por scripts/gen-version.mjs
// en el prebuild). Se usa para (a) inyectar VITE_APP_VERSION al bundle y así
// etiquetar el `release` en Sentry.init, y (b) nombrar el release al subir
// sourcemaps con @sentry/vite-plugin. Fallback "unknown" en builds locales sin
// el prebuild ejecutado.
const APP_VERSION = (() => {
  try {
    const raw = readFileSync(path.resolve(__dirname, "public/version.json"), "utf8");
    return String(JSON.parse(raw)?.version ?? "unknown");
  } catch {
    return "unknown";
  }
})();
const SENTRY_RELEASE = `liftgo@${APP_VERSION}`;

// https://vitejs.dev/config/
// ANALYZE=1 bun run build → /tmp/bundle-stats.html para auditorías de bundle.
// SENTRY_AUTH_TOKEN presente en CI → sube sourcemaps a Sentry y los elimina del
// bundle final (stack traces legibles en producción sin exponer el código
// fuente al cliente). Ausencia del token = no-op silencioso, útil para builds
// locales sin secretos.
// React Compiler (babel-plugin-react-compiler) auto-memoiza componentes/hooks
// que cumplen las Reglas de React; los que las violan quedan intactos (bail-out
// silencioso). El linter `react-compiler/react-compiler` marca esos bail-outs.
export default defineConfig(({ mode }) => ({
  define: {
    // Expuesto como `import.meta.env.VITE_APP_VERSION` en el bundle. Sentry.init
    // lo lee para etiquetar cada evento con el mismo release que se subió.
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(APP_VERSION),
  },
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
      "@tanstack/react-query",
      "sonner",
      "date-fns",
      "zod",
    ],
  },
  // Nota: NO usar `css.transformer: "lightningcss"` — eso salta PostCSS y
  // rompe Tailwind v4 (`@import "tailwindcss"` / `@utility` quedan sin
  // procesar). Mantenemos PostCSS (con `@tailwindcss/postcss`) como
  // transformer y sólo usamos LightningCSS para minificar el output
  // final vía `build.cssMinify`.
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
