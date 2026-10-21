// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { validatedBuildIdentity } from "./scripts/release-identity.mjs";

// Every Vite entry point must match prebuild metadata to the actual tree.
// This also protects direct `vite build` / `build:dev` without lifecycle hooks.
const identity = await validatedBuildIdentity(process.cwd());
const APP_VERSION = identity.version;
const SENTRY_RELEASE = `liftgo@${APP_VERSION}`;
const APP_SOURCE_ID = identity.sourceSha256;

export default defineConfig({
  tanstackStart: {
    client: { entry: "client" },
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Fuera del sandbox de Lovable (p. ej. GitHub Actions) nitro cae a su salida
  // por defecto `.output/`, y el CI espera `dist/`. Fijamos la MISMA salida que
  // el sandbox (cloudflare-module → dist/{client,server}) para que el build sea
  // idéntico en local, CI y hosting. Nitro genera Wrangler con estas rutas.
  nitro: {
    preset: "cloudflare-module",
    output: {
      dir: "dist",
      serverDir: "dist/server",
      publicDir: "dist/client",
    },
    cloudflare: {
      nodeCompat: true,
      // deployConfig genera dist/server/wrangler.json (no_bundle:true + binding
      // ASSETS) y .wrangler/deploy/config.json. Lo usamos como config real de
      // preview: sin no_bundle, `wrangler dev` reempaqueta el worker.
      deployConfig: true,
    },
  },
  vite: {
    build: { sourcemap: process.env.SENTRY_AUTH_TOKEN ? "hidden" : false },
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(APP_VERSION),
      "import.meta.env.VITE_APP_SOURCE_ID": JSON.stringify(APP_SOURCE_ID),
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
            name: SENTRY_RELEASE,
            setCommits: process.env.SENTRY_RELEASE_COMMIT
              ? { repo: "hlopezb83/liftgo", commit: process.env.SENTRY_RELEASE_COMMIT, auto: false }
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
