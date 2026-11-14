<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Eye, Maximize, Minimize, Settings, AlignLeft, AlignCenter, AlignRight } from "@lucide/vue";
import { useSessionStore } from "../stores/session";
import { useDispStore } from "../stores/disp";
import { useUiStore } from "../stores/ui";

const session = useSessionStore();
const disp = useDispStore();
const ui = useUiStore();

const pillCls = computed(() =>
  "pill " + (session.autoOn ? (session.busy ? "pill-busy" : "pill-on") : "pill-off"));

// quick cycle: hero/content column position (left → center → right)
const ALIGN_CYCLE = ["left", "center", "right"] as const;
const ALIGN_LABEL: Record<string, string> = { left: "靠左", center: "居中", right: "靠右" };
const alignIcon = computed(() =>
  disp.align === "left" ? AlignLeft : disp.align === "right" ? AlignRight : AlignCenter);
function cycleAlign() {
  const i = ALIGN_CYCLE.indexOf(disp.align);
  disp.patch({ align: ALIGN_CYCLE[(i + 1) % 3] as any, gaze: "" });
}

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
      <span class="brand-text">exam<em>link</em></span>
    </div>
    <div class="topbar-right">
      <span :class="pillCls" title="点击切换自动触发" style="cursor:pointer" @click="session.toggleAuto()">
        {{ session.autoOn ? "自动开" : "自动关" }}
      </span>
      <span v-if="session.busy" class="busy-dot" title="AI 生成中"></span>
      <button class="icon-btn align-ctl" :title="`内容位置：${ALIGN_LABEL[disp.align]}（点击切换）`"
              :aria-label="'内容位置：' + ALIGN_LABEL[disp.align]" @click="cycleAlign">
        <component :is="alignIcon" :size="18" />
      </button>
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
