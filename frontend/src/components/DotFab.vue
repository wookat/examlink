<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Camera, Image, MessageCircle, Square } from "@lucide/vue";
import { useDispStore } from "../stores/disp";
import { useCardsStore } from "../stores/cards";
import { useSessionStore } from "../stores/session";
import { abortDirect } from "../ws";

const disp = useDispStore();
const cards = useCardsStore();
const session = useSessionStore();
const pulsing = ref(false);

watch(() => cards.dotUnseen, (n, o) => {
  if (n > o) {
    pulsing.value = true;
    setTimeout(() => (pulsing.value = false), 1200);
  }
});

const badge = computed(() => cards.dotUnseen > 9 ? "9+" : String(cards.dotUnseen));

function toggle() {
  disp.toggleDotOpen();
  if (disp.dotOpen) cards.seenDot();
}
function capture() { session.send({ t: "capture", ask: true }); }
function snap() { session.send({ t: "capture", ask: false }); }
function abort() {
  if (session.aiMode === "direct") { abortDirect(); session.busy = false; return; }
  session.send({ t: "abort" });
}
</script>

<template>
  <template v-if="disp.dot">
    <button class="dot-fab" :class="{ pulse: pulsing }" :aria-label="disp.dotOpen ? '收起答案' : '展开答案'"
            :title="disp.dotOpen ? '收起答案' : '展开答案'" @click="toggle">
      <MessageCircle :size="22" />
      <span v-if="cards.dotUnseen" class="dot-badge">{{ badge }}</span>
    </button>
    <div v-if="!disp.dotOpen" class="dot-actions">
      <button class="qbtn primary" @click="capture"><Camera :size="19" /><span>答题</span></button>
      <button class="qbtn" @click="snap"><Image :size="19" /><span>截图</span></button>
      <button v-if="session.busy" class="qbtn danger" @click="abort"><Square :size="16" /><span>停止</span></button>
    </div>
  </template>
</template>
