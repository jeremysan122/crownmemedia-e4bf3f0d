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
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // A stable production baseline for current Safari/Chrome/Firefox instead
    // of shipping syntax that only the newest engines understand.
    target: "es2020",
    rollupOptions: {
      external: [/^@capacitor\//],
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "vendor-react";
          if (id.includes("mapbox-gl")) return "vendor-mapbox";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("@supabase/")) return "vendor-supabase";
          if (id.includes("@tanstack/")) return "vendor-query";
          // Keep interdependent UI primitives together, but let Rollup place
          // feature-only libraries beside their lazy route instead of forcing
          // a multi-megabyte global vendor chunk.
          if (id.includes("@radix-ui/") || id.includes("/node_modules/cmdk/") || id.includes("/node_modules/vaul/")) return "vendor-ui";
        },
      },
    },
  },
}));
