// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { prepareBuildIdentity } from "./scripts/gen-version.mjs";

function readCurrentAppVersion(rootDir: string): string {
  const entries = JSON.parse(readFileSync(resolve(rootDir, "public/changelog.json"), "utf8")) as Array<{
    version?: string;
  }>;
  return entries[0]?.version ?? "0.0.0";
}

// Every Vite entry point generates current metadata, then validates the actual tree.
// Running inside an enforce:"pre" Vite plugin `config()` hook ensures direct `vite build`,
// `vite dev`, and hosting builds execute it before resolving config, while static config
// readers like `knip` do not mutate `public/version.json`.
const releaseIdentityPlugin = {
  name: "liftgo:release-identity",
  enforce: "pre" as const,
  async config() {
    const identity = await prepareBuildIdentity(process.cwd());
    return {
      define: {
        "import.meta.env.VITE_APP_VERSION": JSON.stringify(identity.version),
        "import.meta.env.VITE_APP_SOURCE_ID": JSON.stringify(identity.sourceSha256),
      },
    };
  },
};

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
    worker: { format: "es" },
    build: { sourcemap: process.env.SENTRY_AUTH_TOKEN ? "hidden" : false },
    plugins: [
      releaseIdentityPlugin,
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
            name: `liftgo@${readCurrentAppVersion(process.cwd())}`,
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
