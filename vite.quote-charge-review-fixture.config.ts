import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fixtures = resolve("tests/quote-charge-review-browser/fixtures.tsx");
export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: "@/features/users", replacement: fixtures },
    { find: "@/lib/router-compat-ui", replacement: fixtures },
    { find: /^\.\.\/\.\.\/hooks\/invoices\/useQuoteChargeLegacyReview$/, replacement: fixtures },
    { find: "@", replacement: resolve("src") },
  ] },
  build: {
    outDir: "test-results/quote-charge-review-fixture-build",
    emptyOutDir: false,
    rollupOptions: { input: resolve("tests/quote-charge-review-browser/index.html") },
  },
  server: { host: "127.0.0.1", port: 4208, strictPort: true },
});
