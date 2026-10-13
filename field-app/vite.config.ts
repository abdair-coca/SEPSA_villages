/// <reference types="vitest/config" />

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function configuredBackendUrl(): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.VITE_PILOT_BACKEND_URL;
}

function smokeBuildMode(): Plugin {
  let simulated = false;
  return {
    name: "smoke-build-mode",
    apply: "build",
    configResolved(config) {
      // Build de humo: sin backend y con el modo simulado incluido explícitamente (D023).
      simulated = configuredBackendUrl() === "" && config.env.VITE_PILOT_BACKEND_URL === "" && config.env.VITE_ENABLE_SIMULATION === "true";
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "smoke-build.json",
        source: JSON.stringify({ mode: simulated ? "simulated-explicit" : "other" }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), smokeBuildMode()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
