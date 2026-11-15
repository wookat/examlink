import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Built bundle is served by the examlink FastAPI backend from /.
// base "./" keeps asset URLs relative so the app also works behind a path prefix.
export default defineConfig({
  plugins: [vue()],
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Single vendor chunk: splitting vue / naive-ui / their shared deps
          // (vueuc, vooks, evtd...) into separate chunks creates a circular
          // cross-chunk dependency → TDZ "Cannot access before initialization".
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  server: {
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8791", ws: true },
      "/api": "http://127.0.0.1:8791",
      "/preview.mjpg": "http://127.0.0.1:8791",
    },
  },
});
