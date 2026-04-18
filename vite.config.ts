import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
            if (id.includes("jspdf")) return "jspdf";
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
