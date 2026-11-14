<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Camera, Image, Square, SendHorizontal } from "@lucide/vue";
import { useSessionStore } from "../stores/session";
import { useDispStore } from "../stores/disp";
import { useUiStore } from "../stores/ui";
import { directAsk, abortDirect } from "../ws";

const session = useSessionStore();
const disp = useDispStore();
const ui = useUiStore();
const askInput = ref("");
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function capture() { session.send({ t: "capture", ask: true }); }
function snap() { session.send({ t: "capture", ask: false }); }
function abort() {
  if (session.aiMode === "direct") { abortDirect(); session.busy = false; return; }
  session.send({ t: "abort" });
}
function doAsk() {
  const q = askInput.value.trim();
  if (!q) return;
  askInput.value = "";
  if (session.aiMode === "direct") {
    directAsk({ images: ui.lastB64 ? [ui.lastB64] : [], q, newConv: false });
  } else {
    session.send({ t: "ask", q, new: false });
    session.busy = true;
  }
}

/* float mode: the pill hides at the bottom edge and slides up when the
   pointer comes near it; leaves → hides again after a short dwell */
function onMouseMove(e: MouseEvent) {
  if (disp.compMode !== "float") return;
  const h = window.innerHeight;
  if (e.clientY > h - 80) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    disp.compPeeked = true;
  } else if (disp.compPeeked && e.clientY < h - 200) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { disp.compPeeked = false; }, 1200);
  }
}
function onTouch(e: TouchEvent) { const t = e.touches[0]; if (t) onMouseMove(t as any); }
onMounted(() => {
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("touchstart", onTouch, { passive: true });
});
onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("touchstart", onTouch);
  if (hideTimer) clearTimeout(hideTimer);
});
</script>

<template>
  <footer class="composer">
    <div class="composer-box">
      <button class="qbtn primary" @click="capture">
        <Camera :size="16" /><span>答题</span>
      </button>
      <button class="qbtn" @click="snap">
        <Image :size="16" /><span>截图</span>
      </button>
      <button v-if="session.busy" class="qbtn danger" @click="abort">
        <Square :size="14" /><span>停止</span>
      </button>
      <input v-model="askInput" class="ask-input" placeholder="追问 / 补充说明…"
             autocomplete="off" @keydown.enter="doAsk">
      <button class="qbtn primary send" aria-label="发送" @click="doAsk">
        <SendHorizontal :size="15" /><span class="ask-btn-text">发送</span>
      </button>
    </div>
  </footer>
  <div class="comp-edge" aria-hidden="true"></div>
</template>
