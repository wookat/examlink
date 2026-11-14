<script setup lang="ts">
/* Visible grip pill on the hero card's inner edge.
   stack/top layout → drags content width (--cw);
   rail left/right layout → drags the history rail width (--rail-w). */
import { onMounted, onUnmounted, ref } from "vue";
import { useDispStore } from "../stores/disp";

const disp = useDispStore();
const el = ref<HTMLElement | null>(null);
const visible = ref(false);
const left = ref(0);
const top = ref(0);

function heroEl() { return document.querySelector<HTMLElement>("#answers .ans.q-hero"); }

function place() {
  const col = heroEl()
    || document.querySelector<HTMLElement>("#answers .ans:not(.deck-off)")
    || document.querySelector<HTMLElement>("#answers .ans")
    || document.querySelector<HTMLElement>(".composer .composer-box");
  const hide = disp.dot || !col || window.innerWidth < 700;
  visible.value = !hide;
  if (hide || !col) return;
  const r = col.getBoundingClientRect();
  const deck = document.body.dataset.deck;
  if (deck === "left") left.value = r.right - 8;        // hero left, rail right → right edge
  else if (deck === "right") left.value = r.left - 8;   // hero right, rail left → left edge
  else left.value = (disp.align === "left" ? r.right : r.left) - 8;
  top.value = r.top + r.height / 2 - 26;
  const tab = document.querySelector<HTMLElement>(".comp-tab");
  if (tab) tab.style.left = r.left + r.width / 2 + "px";
}

function onDown(e: PointerEvent) {
  e.preventDefault();
  const vw = window.innerWidth;
  const deck = document.body.dataset.deck;
  const live = document.getElementById("view-live");
  const railMode = deck === "left" || deck === "right";
  const move = (ev: PointerEvent) => {
    const x = ev.clientX;
    if (railMode) {
      // rail width = distance from the screen edge the rail docks to
      const px = deck === "left" ? vw - x : x;
      live?.style.setProperty("--rail-w", Math.min(560, Math.max(200, Math.round(px))) + "px");
    } else {
      let pct: number;
      if (disp.align === "left") pct = x / vw * 100;
      else if (disp.align === "center") pct = Math.abs(vw / 2 - x) * 2 / vw * 100;
      else pct = (vw - x) / vw * 100;
      disp.cw = Math.min(100, Math.max(30, Math.round(pct)));
      disp.gaze = "";
    }
    place();
  };
  const up = () => {
    if (!railMode) disp.save();
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
  <div v-if="visible" ref="el" class="wdrag" title="拖动调整卡片宽度" :style="{ left: left + 'px', top: top + 'px' }"
       @pointerdown="onDown"></div>
</template>
