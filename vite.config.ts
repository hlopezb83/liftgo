import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
// ANALYZE=1 bun run build → generates /tmp/bundle-stats.html for bundle audits.
// React Compiler (babel-plugin-react-compiler) auto-memoiza componentes y hooks
// que cumplen las reglas de React; los que las violan quedan intactos (bail-out
// silencioso). El linter `react-compiler/react-compiler` marca esos bail-outs.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
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
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
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
    match: ["react-dom", "react-router", "@tanstack/react-query", "/react/"],
  },
];
