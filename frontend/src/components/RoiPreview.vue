<script setup lang="ts">
/* Live MJPEG preview with drag-to-select ROI overlay. */
import { computed, ref } from "vue";
import { useSessionStore } from "../stores/session";
import { useUiStore } from "../stores/ui";

const session = useSessionStore();
const ui = useUiStore();

const wrapEl = ref<HTMLElement | null>(null);
const selecting = ref(false);
const temp = ref<{ l: number; t: number; w: number; h: number } | null>(null);
let start: [number, number] | null = null;

const existing = computed(() => {
  const roi = session.state?.roi;
  if (!roi) return null;
  return { l: roi[0] * 100, t: roi[1] * 100, w: (roi[2] - roi[0]) * 100, h: (roi[3] - roi[1]) * 100 };
});
const box = computed(() => temp.value || existing.value);

function normPos(e: PointerEvent): [number, number] {
  const r = wrapEl.value!.getBoundingClientRect();
  return [
    Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  ];
}
function down(e: PointerEvent) {
  if (!selecting.value) return;
  start = normPos(e);
  wrapEl.value!.setPointerCapture(e.pointerId);
  temp.value = { l: start[0] * 100, t: start[1] * 100, w: 0, h: 0 };
}
function move(e: PointerEvent) {
  if (!selecting.value || !start) return;
  const p = normPos(e);
  temp.value = {
    l: Math.min(start[0], p[0]) * 100, t: Math.min(start[1], p[1]) * 100,
    w: Math.abs(p[0] - start[0]) * 100, h: Math.abs(p[1] - start[1]) * 100,
  };
}
function up(e: PointerEvent) {
  if (!selecting.value || !start) return;
  const p = normPos(e);
  const x0 = Math.min(start[0], p[0]), x1 = Math.max(start[0], p[0]);
  const y0 = Math.min(start[1], p[1]), y1 = Math.max(start[1], p[1]);
  selecting.value = false;
  if (x1 - x0 > 0.02 && y1 - y0 > 0.02) {
    session.set({ roi: [x0, y0, x1, y1] });
    ui.show("监控区域已设置");
  }
  start = null; temp.value = null;
}
function beginSelect() {
  selecting.value = true;
  ui.show("在画面上拖动框选");
}
function clear() { session.set({ roi: null }); }

defineExpose({ beginSelect });
</script>

<template>
  <div>
    <div ref="wrapEl" class="preview-wrap" :class="{ selecting }"
         @pointerdown="down" @pointermove="move" @pointerup="up">
      <img :src="session.previewUrl" alt="preview">
      <div v-if="box" class="roi-box" :style="{ left: box.l + '%', top: box.t + '%', width: box.w + '%', height: box.h + '%' }"></div>
      <div v-if="selecting" class="roi-hint">拖动框选监控区域</div>
    </div>
    <div class="btn-row">
      <button class="btn" @click="beginSelect">
        <svg class="ico" viewBox="0 0 24 24"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
        框选监控区域</button>
      <button v-if="existing" class="btn ghost" @click="clear">清除</button>
    </div>
    <div v-if="existing" class="roi-badge">
      <svg class="ico" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
      已设置监控区域</div>
  </div>
</template>
