import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Use forked processes so vitest can hard-kill workers if an
    // unclosed realtime/timer keeps the event loop alive (CI exit).
    pool: "forks",
    poolOptions: { forks: { singleFork: false } },
    teardownTimeout: 5_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
