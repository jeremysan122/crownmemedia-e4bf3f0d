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
    // Sandboxed CI is slow on first transform of large dep graphs (Radix +
    // Supabase + React Query). Default 5s timeouts caused spurious hangs.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each test file runs in its own forked process for full isolation.
    // singleFork:true caused state bleed (fake timers, module mocks) between
    // unrelated files when running the full suite.
    pool: "forks",
    poolOptions: { forks: { singleFork: false, isolate: true } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
