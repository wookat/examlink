<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Eye, Maximize, Minimize, Settings } from "@lucide/vue";
import { useSessionStore } from "../stores/session";
import { useDispStore } from "../stores/disp";
import { useUiStore } from "../stores/ui";

const session = useSessionStore();
const disp = useDispStore();
const ui = useUiStore();

const pillCls = computed(() =>
  "pill " + (session.autoOn ? (session.busy ? "pill-busy" : "pill-on") : "pill-off"));

// fullscreen
const fsOn = ref(false);
function syncFs() { fsOn.value = !!(document.fullscreenElement || (document as any).webkitFullscreenElement); }
function toggleFs() {
  if (fsOn.value) (document.exitFullscreen || (document as any).webkitExitFullscreen).call(document);
  else (document.documentElement.requestFullscreen || (document as any).webkitRequestFullscreen).call(document.documentElement);
}
onMounted(() => ["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, syncFs)));
onUnmounted(() => ["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.removeEventListener(ev, syncFs)));
</script>

<template>
  <header class="topbar">
    <div class="brand"><span class="logo-mark">◈</span><span class="brand-text">examlink</span></div>
    <div class="topbar-right">
      <span :class="pillCls" title="点击切换自动触发" style="cursor:pointer" @click="session.toggleAuto()">
        {{ session.autoOn ? "自动开" : "自动关" }}
      </span>
      <span v-if="session.busy" class="busy-dot" title="AI 生成中"></span>
      <div class="fontctl" title="字体大小">
        <button class="fc-btn" aria-label="减小字号" @click="disp.setFont(disp.fontPx - 2)">A−</button>
        <span>{{ disp.fontPct }}</span>
        <button class="fc-btn" aria-label="增大字号" @click="disp.setFont(disp.fontPx + 2)">A+</button>
      </div>
      <button class="icon-btn" title="实时画面" aria-label="实时画面" @click="ui.toggleLive()">
        <Eye :size="19" />
      </button>
      <button class="icon-btn" :title="fsOn ? '退出全屏' : '全屏'" :aria-label="fsOn ? '退出全屏' : '全屏'" @click="toggleFs">
        <Minimize v-if="fsOn" :size="18" /><Maximize v-else :size="18" />
      </button>
      <router-link class="icon-btn" to="/settings" title="设置" aria-label="设置">
        <Settings :size="19" />
      </router-link>
    </div>
  </header>
</template>
