<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Camera, Image, Square, SendHorizontal, ChevronDown } from "@lucide/vue";
import { useSessionStore } from "../stores/session";
import { useDispStore } from "../stores/disp";
import { useUiStore } from "../stores/ui";
import { directAsk, abortDirect } from "../ws";

const session = useSessionStore();
const disp = useDispStore();
const ui = useUiStore();
const askInput = ref("");
let peekTimer: ReturnType<typeof setTimeout> | null = null;

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

/* fold → bottom tab; hovering the bottom strip peeks the composer back */
function fold() { disp.compHide = true; disp.compPeeked = false; disp.save(); }
function unfold() { disp.compHide = false; disp.compPeeked = false; disp.save(); }
function onMouseMove(e: MouseEvent) {
  if (!disp.compHide) {
    if (disp.compPeeked && e.clientY < window.innerHeight - 180) {
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = setTimeout(() => {
        disp.compPeeked = false;
        if (disp.compHide) document.body.classList.add("comp-hide");
      }, 1600);
    }
    return;
  }
  if (e.clientY > window.innerHeight - 64) {
    document.body.classList.remove("comp-hide");
    disp.compPeeked = true;
  }
}
onMounted(() => document.addEventListener("mousemove", onMouseMove));
onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  if (peekTimer) clearTimeout(peekTimer);
});
</script>

<template>
  <footer class="composer">
    <div class="composer-box">
      <button class="comp-fold" title="收起操作栏" aria-label="收起操作栏" @click="fold">
        <ChevronDown :size="14" />
      </button>
      <div class="quick-row">
        <button class="qbtn primary" @click="capture">
          <Camera :size="19" /><span>答题</span>
        </button>
        <button class="qbtn" @click="snap">
          <Image :size="19" /><span>截图</span>
        </button>
        <button v-if="session.busy" class="qbtn danger" @click="abort">
          <Square :size="17" /><span>停止</span>
        </button>
      </div>
      <div class="ask-row">
        <input v-model="askInput" placeholder="追问 / 补充说明…" autocomplete="off" @keydown.enter="doAsk">
        <button class="qbtn primary" aria-label="发送" @click="doAsk">
          <SendHorizontal :size="17" /><span class="ask-btn-text">发送</span>
        </button>
      </div>
    </div>
  </footer>
  <button v-if="disp.compHide" class="comp-tab" aria-label="展开操作栏" title="展开操作栏" @click="unfold">▲ 操作</button>
</template>
