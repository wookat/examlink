<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { X, Maximize2, Minimize2 } from "@lucide/vue";
import { useSessionStore } from "../stores/session";
import { useUiStore } from "../stores/ui";

const session = useSessionStore();
const ui = useUiStore();

const GEO_KEY = "examlink.livegeo";
const maxed = ref(false);
const pos = ref({ x: 14, y: 200, w: 320 });

function load() {
  try {
    const g = JSON.parse(localStorage.getItem(GEO_KEY) || "null");
    if (g) { pos.value = g; return; }
  } catch {}
  pos.value = { x: 14, y: window.innerHeight - 14 - Math.round(320 * 9 / 16) - 30, w: 320 };
}
function save() { localStorage.setItem(GEO_KEY, JSON.stringify(pos.value)); }
function clamp() {
  const w = pos.value.w;
  pos.value.x = Math.min(Math.max(pos.value.x, 8 - w + 80), window.innerWidth - 80);
  pos.value.y = Math.min(Math.max(pos.value.y, 8), window.innerHeight - 60);
}

function onDrag(e: PointerEvent) {
  if (maxed.value) return;
  if ((e.target as HTMLElement).closest("button, .live-resize")) return;
  e.preventDefault();
  const sx = e.clientX - pos.value.x, sy = e.clientY - pos.value.y;
  const move = (ev: PointerEvent) => { pos.value.x = ev.clientX - sx; pos.value.y = ev.clientY - sy; };
  const up = () => { clamp(); save(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
function onResize(e: PointerEvent) {
  if (maxed.value) return;
  e.preventDefault(); e.stopPropagation();
  const sw = pos.value.w, sx = e.clientX;
  const move = (ev: PointerEvent) => {
    pos.value.w = Math.min(Math.max(sw + ev.clientX - sx, 180), window.innerWidth - pos.value.x - 10);
  };
  const up = () => { save(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
function onEsc(e: KeyboardEvent) { if (e.key === "Escape" && maxed.value) maxed.value = false; }

watch(() => ui.liveOpen, v => { if (!v) maxed.value = false; });
onMounted(() => { load(); window.addEventListener("keydown", onEsc); });
</script>

<template>
  <div v-if="ui.liveOpen" class="live-panel" :class="{ 'live-max': maxed }"
       :style="maxed ? {} : { left: pos.x + 'px', top: pos.y + 'px', width: pos.w + 'px' }"
       @pointerdown="onDrag">
    <div class="live-head">
      <span class="t">实时画面</span>
      <button :title="maxed ? '还原' : '放大'" :aria-label="maxed ? '还原' : '放大'"
              @click.stop="maxed = !maxed" @pointerdown.stop>
        <Minimize2 v-if="maxed" :size="13" /><Maximize2 v-else :size="13" />
      </button>
      <button aria-label="关闭实时画面" title="关闭" @click="ui.liveOpen = false" @pointerdown.stop>
        <X :size="14" />
      </button>
    </div>
    <img :src="session.previewUrl" alt="考试屏实时画面" draggable="false">
    <span class="live-resize" title="拖动调整大小" @pointerdown="onResize"></span>
  </div>
</template>
