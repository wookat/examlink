<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import TopBar from "../components/TopBar.vue";
import AnswerDeck from "../components/AnswerDeck.vue";
import ComposerBar from "../components/ComposerBar.vue";
import NavCtl from "../components/NavCtl.vue";
import DotFab from "../components/DotFab.vue";
import LivePanel from "../components/LivePanel.vue";
import { useSessionStore } from "../stores/session";
import { useCardsStore } from "../stores/cards";
import { useDispStore } from "../stores/disp";
import { useUiStore } from "../stores/ui";
import { useKeysStore, comboOf, type HkAction } from "../stores/keys";
import { directAsk, abortDirect } from "../ws";

const session = useSessionStore();
const cards = useCardsStore();
const disp = useDispStore();
const ui = useUiStore();
const keys = useKeysStore();

const connHidden = computed(() => session.conn === "on");
const flashing = ref(false);

// done-flash: green edge pulse when an answer completes
watch(() => cards.flashTick, () => {
  flashing.value = false;
  requestAnimationFrame(() => { flashing.value = true; });
});

// ---- device hotkey dispatch (this page, live view only) ----
function runAction(a: HkAction) {
  switch (a) {
    case "solve": session.send({ t: "capture", ask: true }); break;
    case "snap": session.send({ t: "capture", ask: false }); break;
    case "prev": case "next":
      if (disp.index) cards.deckStep(a === "next" ? 1 : -1);
      else {
        const feed = document.getElementById("answers");
        feed?.scrollBy({ top: (a === "next" ? 1 : -1) * feed.clientHeight * 0.8, behavior: "smooth" });
      }
      break;
    case "up": case "down":
      if (disp.index) cards.deckStep(a === "down" ? 1 : -1);
      else {
        const feed = document.getElementById("answers");
        feed?.scrollBy({ top: (a === "down" ? 1 : -1) * feed.clientHeight * 0.8, behavior: "smooth" });
      }
      break;
  }
}
function onKey(e: KeyboardEvent) {
  if (keys.recording) {
    e.preventDefault();
    if (e.key === "Escape") { keys.stopRec(); return; }
    const c = comboOf(e);
    if (c) { keys.hk[keys.recording] = c; keys.save(); keys.stopRec(); }
    return;
  }
  const tag = ((e.target as HTMLElement).tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || (e.target as HTMLElement).isContentEditable) return;
  const c = comboOf(e);
  if (!c) return;
  const a = keys.action(c);
  if (a) { e.preventDefault(); runAction(a); }
}
function onPointer(e: PointerEvent) {
  const code = "mouse:" + e.button;
  if (keys.recording) {
    e.preventDefault();
    keys.hk[keys.recording] = code; keys.save(); keys.stopRec();
    return;
  }
  if (e.button === 0 || e.button === 2) return;
  const a = keys.action(code);
  if (a) { e.preventDefault(); e.stopPropagation(); runAction(a); }
}
function onAux(e: MouseEvent) {
  const a = keys.action("mouse:" + e.button);
  if (a) { e.preventDefault(); runAction(a); }
}
function onCtx(e: MouseEvent) { if (keys.recording) e.preventDefault(); }
function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape" && disp.dotOpen) disp.toggleDotOpen();
}
onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("auxclick", onAux, true);
  window.addEventListener("contextmenu", onCtx, true);
  window.addEventListener("keydown", onEsc);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("pointerdown", onPointer, true);
  window.removeEventListener("auxclick", onAux, true);
  window.removeEventListener("contextmenu", onCtx, true);
  window.removeEventListener("keydown", onEsc);
});
</script>

<template>
  <main id="view-live" class="view" :style="disp.liveVars">
    <TopBar />
    <div v-if="!connHidden" class="conn-bar">
      <span class="conn-dot" :class="session.conn"></span><span>{{ session.connText }}</span>
    </div>

    <AnswerDeck />

    <ComposerBar />
    <NavCtl />
    <DotFab />
    <LivePanel />

    <div class="flash-fx" :class="{ go: flashing }" aria-hidden="true"></div>
  </main>
</template>
