<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { NConfigProvider, darkTheme, NMessageProvider, NDialogProvider, NModal } from "naive-ui";
import { useDispStore } from "./stores/disp";
import { useSessionStore } from "./stores/session";
import { useUiStore } from "./stores/ui";
import { connectWs } from "./ws";
import LightBox from "./components/LightBox.vue";

const disp = useDispStore();
const session = useSessionStore();
const ui = useUiStore();

// naive-ui dark theme tuned to our zinc palette
const overrides = {
  common: {
    primaryColor: "#818cf8",
    primaryColorHover: "#97a2fa",
    primaryColorPressed: "#6d79e8",
    bodyColor: "#09090b",
    cardColor: "#151519",
    inputColor: "#0f0f12",
    borderColor: "rgba(255,255,255,0.075)",
    textColorBase: "#f4f4f5",
    borderRadius: "4px",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
};

// display prefs → body classes/datasets (same hooks the CSS uses)
watch(
  () => [disp.align, disp.contrast, disp.heroPos, disp.deckDir, disp.isNarrow, disp.compMode, disp.compPeeked, disp.latestOnly, disp.index, disp.dot, disp.dotOpen],
  () => {
    document.body.dataset.align = disp.align;
    document.body.dataset.contrast = disp.contrast;
    document.body.dataset.hero = disp.heroPos;
    document.body.dataset.deck = disp.isNarrow ? "stack" : disp.deckDir; // narrow screens always stack
    document.body.classList.toggle("comp-hide", disp.compMode === "float" && !disp.compPeeked);
    document.body.classList.toggle("latest-only", disp.latestOnly);
    document.body.classList.toggle("idx-mode", disp.index);
    document.body.classList.toggle("dot-mode", disp.dot);
    document.body.classList.toggle("dot-open", disp.dot && disp.dotOpen);
  },
  { immediate: true }
);
watch(() => disp.wake, () => disp.keepAwake());

const toastShow = computed(() => !!ui.toast);

onMounted(() => {
  disp.bindMedia();
  disp.setFont(disp.fontPx);
  disp.keepAwake();
  document.addEventListener("visibilitychange", () => disp.keepAwake());
  connectWs();
  if (!session.token) ui.show("URL 缺少 token，请从电脑上显示的链接打开", 4000);
});
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="overrides">
    <NMessageProvider>
      <NDialogProvider>
        <router-view />
        <LightBox :src="ui.lightboxSrc" @close="ui.closeLightbox()" />
        <div id="toast" :class="{ show: toastShow }">{{ ui.toast }}</div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
