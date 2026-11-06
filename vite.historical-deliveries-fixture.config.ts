import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fixtures = resolve("tests/historical-deliveries-browser/fixtures.tsx");
export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: "@/features/users", replacement: fixtures },
    { find: "@/lib/router-compat-ui", replacement: fixtures },
    { find: "@", replacement: resolve("src") },
  ] },
  build: {
    outDir: "test-results/historical-deliveries-fixture-build",
    emptyOutDir: false,
    rollupOptions: { input: resolve("tests/historical-deliveries-browser/index.html") },
  },
  server: { host: "127.0.0.1", port: 4218, strictPort: true },
});
