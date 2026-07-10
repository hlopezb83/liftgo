import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
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
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) return "recharts";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("@react-pdf")) return "react-pdf";
            if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("canvg")) return "jspdf";
            if (id.includes("xlsx")) return "xlsx";
            if (id.includes("date-fns")) return "date-fns";
            if (id.includes("lucide-react")) return "icons";
            if (
              id.includes("react-dom") ||
              id.includes("react-router") ||
              id.includes("@tanstack/react-query") ||
              id.includes("/react/")
            ) {
              return "vendor";
            }
          }
        },
      },
    },
  },
}));
