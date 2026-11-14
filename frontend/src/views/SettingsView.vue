<script setup lang="ts">
import { ChevronLeft } from "@lucide/vue";
import { useSessionStore } from "../stores/session";
import SCapture from "../components/settings/SCapture.vue";
import SAuto from "../components/settings/SAuto.vue";
import SAi from "../components/settings/SAi.vue";
import SPrompt from "../components/settings/SPrompt.vue";
import SKb from "../components/settings/SKb.vue";
import SDisplay from "../components/settings/SDisplay.vue";
import SHotkeys from "../components/settings/SHotkeys.vue";
import SDanger from "../components/settings/SDanger.vue";
import { initSettingsSync } from "../components/settings/form";

const session = useSessionStore();
initSettingsSync();
</script>

<template>
  <main class="view view-settings">
    <header class="topbar">
      <router-link class="icon-btn" to="/" title="返回" aria-label="返回答题屏">
        <ChevronLeft :size="20" />
      </router-link>
      <div class="brand">
        <span class="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <defs>
              <linearGradient id="lgm" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#a78bfa"/>
              </linearGradient>
            </defs>
            <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#lgm)"/>
            <path d="M9 10.4V8.6c0-.5.4-.9.9-.9h1.7M15.4 7.7h-1.7a.9.9 0 0 0-.9.9v1.8M9 13.6v1.8c0 .5.4.9.9.9h1.7M15.4 16.3h-1.7a.9.9 0 0 1-.9-.9v-1.8"
                  stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none"/>
            <circle cx="12" cy="12" r="1.7" fill="#fff"/>
          </svg>
        </span>
        <span class="brand-text">设置</span>
      </div>
      <div class="topbar-right"><span class="conn-dot" :class="session.conn"></span></div>
    </header>

    <div class="settings">
      <SCapture />
      <SAuto />
      <SAi />
      <SPrompt />
      <SKb />
      <SDisplay />
      <SHotkeys />
      <SDanger />
    </div>
  </main>
</template>
