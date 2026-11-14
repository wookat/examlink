import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";

export default defineConfig({
  integrations: [vue({ appEntrypoint: "/src/app.ts" })],
  vite: {
    // the demo imports the real product components from ../frontend/src —
    // their bare imports resolve against frontend/node_modules while the site
    // resolves site/node_modules, producing TWO pinia/vue copies in one bundle
    // (separate inject keys → useStore crashes). dedupe forces one copy.
    resolve: {
      dedupe: ["vue", "pinia", "vue-router", "naive-ui", "@lucide/vue"],
    },
    server: { fs: { allow: ["..", "../.."] } },
    build: {
      rollupOptions: {
        output: {
          /* each Astro island is bundled separately — pinia's activePinia and
             vue-router's inject keys are module-level singletons, so they must
             live in ONE shared chunk or the island's components get a second,
             empty pinia/router instance */
          manualChunks(id) {
            if (id.includes("node_modules/pinia") || id.includes("node_modules/vue-router"))
              return "vendor-state";
          },
        },
      },
    },
  },
});
