import { createRouter, createWebHashHistory } from "vue-router";
import LiveView from "./views/LiveView.vue";

// hash history keeps parity with the old #/settings route and needs no
// server-side rewrite rules on the embedded backend.
// Settings is lazy — it pulls the naive-ui settings forms into a separate
// chunk so the live page's first paint stays light on phones.
const SettingsView = () => import("./views/SettingsView.vue");

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "live", component: LiveView },
    { path: "/settings", name: "settings", component: SettingsView },
  ],
});
