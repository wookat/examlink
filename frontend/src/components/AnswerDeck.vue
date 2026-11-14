<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AnswerCard from "./AnswerCard.vue";
import { useCardsStore } from "../stores/cards";
import { useDispStore } from "../stores/disp";

const cards = useCardsStore();
const disp = useDispStore();
const feedEl = ref<HTMLElement | null>(null);

const placement = computed(() => cards.placement);
const onDeck = computed(() => cards.onDeck);

/* wheel flips question groups; when the hero can still scroll its own
   content in that direction the wheel scrolls the card first */
let deckWheelT = 0;
function onWheel(e: WheelEvent) {
  if (!disp.index) return;
  if (disp.dotOpen) return;                      // panel = normal list scroll
  if ((e.target as HTMLElement).closest(".composer, .lightbox, .n-modal")) return;
  const hero = feedEl.value?.querySelector<HTMLElement>(".ans.q-hero");
  if (hero && hero.scrollHeight > hero.clientHeight + 4) {
    const dir = e.deltaY > 0 ? 1 : -1;
    const atEdge = dir > 0
      ? hero.scrollTop + hero.clientHeight >= hero.scrollHeight - 4
      : hero.scrollTop <= 4;
    if (!atEdge) return;                         // let the card content scroll
  }
  const now = performance.now();
  if (now - deckWheelT < 160 || Math.abs(e.deltaY) < 8) { e.preventDefault(); return; }
  deckWheelT = now;
  e.preventDefault();
  cards.deckStep(e.deltaY > 0 ? 1 : -1);
}

/* non-index mode: keep the feed pinned to the newest card */
function scrollFeed() {
  if (disp.index || disp.dotOpen) return;
  const f = feedEl.value;
  if (f) f.scrollTop = f.scrollHeight;
}
watch(() => cards.cards.length, () => nextTick(scrollFeed));
watch(() => cards.cards.map(c => c.text.length).join(","), () => {
  // streaming grows the last card → keep pinned (non-index only)
  if (!disp.index) nextTick(scrollFeed);
});

onMounted(() => document.addEventListener("wheel", onWheel, { passive: false }));
onUnmounted(() => document.removeEventListener("wheel", onWheel));

defineExpose({ scrollFeed });
</script>

<template>
  <section ref="feedEl" id="answers" class="feed" aria-label="答题记录">
    <div v-if="!cards.cards.length" class="empty-feed">
      <div><div class="big">◈</div>截图或自动触发后，答案会显示在这里</div>
    </div>
    <AnswerCard
      v-for="c in cards.cards" :key="c.id" :card="c"
      :depth="placement[c.id]?.depth ?? 0"
      :rep="placement[c.id]?.rep ?? true"
      :cur="placement[c.id]?.cur ?? false"
      :group-first="placement[c.id]?.groupFirst ?? false"
      :index-mode="disp.index"
      :on-deck="onDeck[c.id] ?? true"
    />
  </section>
</template>
