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
      <div class="brand"><span class="logo-mark">◈</span><span class="brand-text">设置</span></div>
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
