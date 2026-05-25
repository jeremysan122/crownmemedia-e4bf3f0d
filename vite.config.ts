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
    target: "esnext",
    rollupOptions: {
      external: [/^@capacitor\//],
      output: {
        manualChunks(id) {
          if (id.includes("mapbox-gl")) return "vendor-mapbox";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("lucide-react")) return "vendor-lucide";
          if (id.includes("@supabase/")) return "vendor-supabase";
          if (id.includes("@tanstack/")) return "vendor-query";
          if (id.includes("@radix-ui/")) return "vendor-radix";
          if (id.includes("node_modules")) return "vendor-misc";
        },
      },
    },
  },
}));
