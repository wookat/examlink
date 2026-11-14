import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-800.css";
import "./styles/base.css";

// kill any service worker left over from the legacy static frontend
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if ("caches" in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
}

createApp(App).use(createPinia()).use(router).mount("#app");
