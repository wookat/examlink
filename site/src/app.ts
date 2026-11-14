/* Astro Vue appEntrypoint — give every island the same Pinia + a memory
   router so the real product components (TopBar's <router-link> etc.)
   mount unmodified. */
import type { App } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

const Blank = { render: () => null };

export default function setup(app: App) {
  app.use(createPinia());
  app.use(
    createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: Blank },
        { path: "/settings", component: Blank },
      ],
    })
  );
}
