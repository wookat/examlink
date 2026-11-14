import { createRouter, createWebHashHistory } from "vue-router";
import LiveView from "./views/LiveView.vue";
import SettingsView from "./views/SettingsView.vue";

// hash history keeps parity with the old #/settings route and needs no
// server-side rewrite rules on the embedded backend
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "live", component: LiveView },
    { path: "/settings", name: "settings", component: SettingsView },
  ],
});
