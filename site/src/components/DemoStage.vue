<script setup lang="ts">
/* The REAL product screen, running on the marketing page.
   Mounts genuine components (TopBar / AnswerDeck / ComposerBar / NavCtl /
   LightBox) and drives them with a scripted exam session — visitors see
   and can interact with the same UI they'd get on their second screen. */
import { onMounted, onUnmounted, ref, watchEffect } from "vue";
import TopBar from "../../../frontend/src/components/TopBar.vue";
import AnswerDeck from "../../../frontend/src/components/AnswerDeck.vue";
import ComposerBar from "../../../frontend/src/components/ComposerBar.vue";
import NavCtl from "../../../frontend/src/components/NavCtl.vue";
import LightBox from "../../../frontend/src/components/LightBox.vue";
import { useDispStore } from "../../../frontend/src/stores/disp";
import { useCardsStore } from "../../../frontend/src/stores/cards";
import { useSessionStore } from "../../../frontend/src/stores/session";
import { useUiStore } from "../../../frontend/src/stores/ui";
import { startSim, stopSim, simSend } from "../demo/sim";

import "../../../frontend/src/styles/base.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";

const disp = useDispStore();
const cards = useCardsStore();
const session = useSessionStore();
const ui = useUiStore();

/* interaction gate: wheel/swipe inside the demo flips question cards —
   but only after the visitor clicks in, so page scroll stays natural */
const engaged = ref(false);
function engage() { engaged.value = true; }
function guard(e: Event) { if (!engaged.value) e.stopPropagation(); }
function onDocDown(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest?.(".demo-screen")) engaged.value = false;
}

/* replicate App.vue's prefs → body wiring so every TopBar toggle works */
let saved: { deck?: string; align?: string; contrast?: string; hero?: string; classes: string[] };
let stopWatch: (() => void) | null = null;
onMounted(() => {
  const b = document.body;
  saved = {
    deck: b.dataset.deck, align: b.dataset.align,
    contrast: b.dataset.contrast, hero: b.dataset.hero,
    classes: ["idx-mode", "comp-hide", "latest-only", "dot-mode", "dot-open", "deck-below"]
      .filter(c => b.classList.contains(c)),
  };
  stopWatch = watchEffect(() => {
    b.dataset.align = disp.align;
    b.dataset.deck = disp.isNarrow && disp.deckDir !== "carousel" ? "stack" : disp.deckDir;
    b.dataset.contrast = disp.contrast;
    b.dataset.hero = disp.heroPos;
    b.classList.toggle("idx-mode", disp.index);
    b.classList.toggle("comp-hide", disp.compMode === "float" && !disp.compPeeked);
    b.classList.toggle("latest-only", disp.latestOnly);
    b.classList.remove("dot-mode", "dot-open", "deck-below");
  });
  disp.bindMedia();
  disp.setFont(disp.fontPx);
  session.conn = "on";
  session.connText = "";
  session.state = { auto: { enabled: true } } as any;
  session.send = (m: any) => simSend(m);
  startSim();
  document.addEventListener("mousedown", onDocDown, true);
});
onUnmounted(() => {
  stopSim();
  stopWatch?.();
  const b = document.body;
  b.dataset.deck = saved.deck; b.dataset.align = saved.align;
  b.dataset.contrast = saved.contrast; b.dataset.hero = saved.hero;
  ["idx-mode", "comp-hide", "latest-only", "dot-mode", "dot-open", "deck-below"]
    .forEach(c => b.classList.toggle(c, saved.classes.includes(c)));
  document.removeEventListener("mousedown", onDocDown, true);
});
</script>

<template>
  <div class="demo-shell">
    <div class="demo-chrome" aria-hidden="true">
      <span class="dc-dot" /><span class="dc-dot" /><span class="dc-dot" />
      <span class="dc-url">http://192.168.1.8:8791/?t=d6e4cf54a2a5</span>
      <span class="dc-live"><i />LIVE</span>
    </div>
    <div class="demo-screen" @wheel="guard" @touchstart.passive="guard" @touchend.passive="guard">
      <main id="view-live" class="view" :style="disp.liveVars">
        <TopBar />
        <AnswerDeck />
        <ComposerBar />
        <NavCtl />
        <LightBox :src="ui.lightboxSrc" @close="ui.closeLightbox()" />
        <div id="toast" :class="{ show: !!ui.toast }">{{ ui.toast }}</div>
      </main>
      <button class="demo-engage" :class="{ off: engaged }" @click="engage" type="button">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74"/><path d="M14 10.5a2.5 2.5 0 0 1 5 .74V13a8 8 0 0 1-8 8h-.35a8 8 0 0 1-6.32-3.13l-2.3-3.04a2.5 2.5 0 0 1 3.87-3.14L9 14.24"/></svg>
        <span v-if="!engaged">点击后可互动 · 滚轮翻题</span><span v-else>互动中 · 滚轮翻题 / 点击侧卡</span>
      </button>
    </div>
  </div>
</template>

<style>
/* ===== demo frame — the browser chrome around the real product ===== */
.demo-shell {
  border: 1px solid var(--border-strong);
  border-radius: 14px; overflow: hidden;
  background: #0b0b0e;
  box-shadow: 0 40px 90px -30px rgba(0, 0, 0, .8), 0 0 0 1px rgba(255,255,255,.03),
              0 0 120px -40px rgba(129, 140, 248, .35);
}
.demo-chrome {
  display: flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 14px;
  background: #141418; border-bottom: 1px solid var(--border);
}
.dc-dot { width: 11px; height: 11px; border-radius: 50%; background: #3a3a42; }
.dc-dot:nth-child(1) { background: #ff5f57; } .dc-dot:nth-child(2) { background: #febc2e; } .dc-dot:nth-child(3) { background: #28c840; }
.dc-url {
  margin-left: 10px; flex: 1; min-width: 0; max-width: 420px;
  font-size: 12px; color: var(--faint); font-family: var(--mono);
  background: #0c0c10; border: 1px solid var(--border); border-radius: 6px;
  padding: 4px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dc-live {
  margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .12em; color: var(--ok);
}
.dc-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); animation: pulse 1.2s infinite; }

/* transform creates the containing block for the product's fixed-position
   pieces (composer pill, nav pills, lightbox) so they stay inside the frame */
.demo-screen {
  position: relative; flex: 1; min-height: 0;
  transform: translateZ(0); overflow: hidden;
}
.demo-screen #view-live { height: 100%; min-height: 0; }
.demo-screen .topbar { position: relative; }           /* sticky → normal inside frame */
.demo-screen .live-panel { display: none; }            /* needs the real mjpeg stream */
.demo-screen .icon-btn[title="实时画面"] { display: none; }

.demo-engage {
  position: absolute; right: 14px; top: calc(var(--topbar-h) + 12px); z-index: 60;
  display: inline-flex; align-items: center; gap: 7px;
  font-family: inherit; font-size: 12px; font-weight: 600;
  color: var(--text); background: rgba(21, 21, 26, .82);
  border: 1px solid var(--border-strong); border-radius: 999px;
  padding: 8px 14px; cursor: pointer; backdrop-filter: blur(8px);
  box-shadow: 0 6px 20px rgba(0,0,0,.4);
  transition: opacity .3s, transform .3s, border-color .2s;
}
.demo-engage:hover { border-color: var(--accent); }
.demo-engage.off { opacity: 0; transform: translateY(-6px); pointer-events: none; }
</style>
