<script setup lang="ts">
/* Column width drag handle on the inner edge of the content column. */
import { onMounted, onUnmounted, ref } from "vue";
import { useDispStore } from "../stores/disp";

const disp = useDispStore();
const el = ref<HTMLElement | null>(null);
const visible = ref(false);
const left = ref(0);
const compTabLeft = ref<number | null>(null);

function place() {
  const col = document.querySelector<HTMLElement>("#answers .ans.q-hero")
    || document.querySelector<HTMLElement>("#answers .ans:not(.deck-off)")
    || document.querySelector<HTMLElement>("#answers .ans")
    || document.querySelector<HTMLElement>(".composer .composer-box");
  const hide = disp.dot || !col || window.innerWidth < 700;
  visible.value = !hide;
  if (hide || !col) return;
  const r = col.getBoundingClientRect();
  left.value = (disp.align === "left" ? r.right : r.left) - 7;
  compTabLeft.value = r.left + r.width / 2;
  const tab = document.querySelector<HTMLElement>(".comp-tab");
  if (tab) tab.style.left = compTabLeft.value + "px";
}

function onDown(e: PointerEvent) {
  e.preventDefault();
  const vw = window.innerWidth;
  const move = (ev: PointerEvent) => {
    const x = ev.clientX;
    let pct: number;
    if (disp.align === "left") pct = x / vw * 100;
    else if (disp.align === "center") pct = Math.abs(vw / 2 - x) * 2 / vw * 100;
    else pct = (vw - x) / vw * 100;
    disp.cw = Math.min(100, Math.max(30, Math.round(pct)));
    disp.gaze = "";
  };
  const up = () => {
    disp.save();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

let raf = 0, iv = 0;
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
onMounted(() => {
  window.addEventListener("resize", schedule);
  schedule();
  // reposition after deck layout settles and on card count changes
  setTimeout(place, 300);
  iv = setInterval(place, 1500);   // cheap: column edge moves with align/deck changes
});
onUnmounted(() => {
  window.removeEventListener("resize", schedule);
  cancelAnimationFrame(raf);
  clearInterval(iv);
});
</script>

<template>
  <div v-if="visible" ref="el" class="wdrag" title="拖动调整内容宽度" :style="{ left: left + 'px' }"
       @pointerdown="onDown"></div>
</template>
