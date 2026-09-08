// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";

// Versión resuelta desde public/version.json (generado por scripts/gen-version.mjs
// en el prebuild). Se usa para (a) inyectar VITE_APP_VERSION al bundle y así
// etiquetar el `release` en Sentry.init, y (b) nombrar el release al subir
// sourcemaps con @sentry/vite-plugin. Fallback "unknown" en builds locales.
const APP_VERSION = (() => {
  try {
    const raw = readFileSync(path.resolve(process.cwd(), "public/version.json"), "utf8");
    return String(JSON.parse(raw)?.version ?? "unknown");
  } catch {
    return "unknown";
  }
})();
const SENTRY_RELEASE = `liftgo@${APP_VERSION}`;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Fuera del sandbox de Lovable (p. ej. GitHub Actions) nitro cae a su salida
  // por defecto `.output/`, y el CI espera `dist/`. Fijamos la MISMA salida que
  // el sandbox (cloudflare-module → dist/{client,server}) para que el build sea
  // idéntico en local, CI y hosting. wrangler.jsonc apunta a estas rutas.
  nitro: {
    preset: "cloudflare-module",
    output: {
      dir: "dist",
      serverDir: "dist/server",
      publicDir: "dist/client",
    },
    cloudflare: {
      nodeCompat: true,
      deployConfig: true,
    },
  },
  vite: {
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(APP_VERSION),
    },
    plugins: [
      // ANALYZE=1 bun run build → /tmp/bundle-stats.html para auditorías de bundle.
      process.env.ANALYZE === "1" &&
        visualizer({
          filename: "/tmp/bundle-stats.html",
          template: "treemap",
          gzipSize: true,
          brotliSize: false,
        }),
      // Sourcemaps para Sentry: sólo cuando el token está presente (CI/hosting).
      process.env.SENTRY_AUTH_TOKEN &&
        sentryVitePlugin({
          org: process.env.SENTRY_ORG ?? "elogistix",
          project: process.env.SENTRY_PROJECT ?? "liftgo",
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: {
            name: process.env.SENTRY_RELEASE ?? SENTRY_RELEASE,
            setCommits: process.env.SENTRY_RELEASE_COMMIT
              ? { repo: "elogistix/liftgo", commit: process.env.SENTRY_RELEASE_COMMIT, auto: false }
              : { auto: true, ignoreMissing: true, ignoreEmpty: true },
          },
          sourcemaps: {
            assets: "./dist/**",
            filesToDeleteAfterUpload: "./dist/**/*.map",
          },
          telemetry: false,
        }),
    ].filter(Boolean) as import("vite").PluginOption[],
  },
});
