<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AnswerCard from "./AnswerCard.vue";
import { useCardsStore } from "../stores/cards";
import { useDispStore } from "../stores/disp";

const cards = useCardsStore();
const disp = useDispStore();
const feedEl = ref<HTMLElement | null>(null);
const railEl = ref<HTMLElement | null>(null);

const placement = computed(() => cards.placement);
const onDeck = computed(() => cards.onDeck);
/* rail layout (desktop): hero on one side, scrollable history column on the
   other. Narrow screens keep the stacked deck. */
const railMode = computed(() => disp.index && disp.deckDir !== "stack" && !disp.isNarrow);
const railCards = computed(() =>
  cards.cards.filter(c => { const p = placement.value[c.id]; return p?.rep && !p.cur; }).reverse());
const heroCard = computed(() => cards.heroCard);

/* wheel flips question groups; when the hero can still scroll its own
   content in that direction the wheel scrolls the card first */
let deckWheelT = 0;
function onWheel(e: WheelEvent) {
  if (!disp.index) return;
  if (disp.dotOpen) return;                      // panel = normal list scroll
  if ((e.target as HTMLElement).closest?.(".composer, .lightbox, .n-modal, .rail")) return;
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

/* touch: horizontal swipe flips question groups (vertical stays scroll) */
let tsx = 0, tsy = 0;
function onTs(e: TouchEvent) { const t = e.touches[0]; tsx = t.clientX; tsy = t.clientY; }
function onTe(e: TouchEvent) {
  if (!disp.index || disp.dotOpen) return;
  if ((e.target as HTMLElement).closest?.(".composer, .lightbox, .n-modal, .rail")) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - tsx, dy = t.clientY - tsy;
  if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) cards.deckStep(dx < 0 ? 1 : -1);
}

/* non-index mode: keep the feed pinned to the newest card */
function scrollFeed() {
  if (disp.index || disp.dotOpen) return;
  const f = feedEl.value;
  if (f) f.scrollTop = f.scrollHeight;
}
/* bidirectional deck: when cards newer than focus exist they peek below the
   hero — reserve a bottom zone so the hero never covers them */
watch(placement, p => {
  const below = Object.values(p).some(x => x.rep && x.depth < 0 && x.depth >= -4);
  document.body.classList.toggle("deck-below", below && disp.index);
}, { immediate: true, deep: true });

watch(() => cards.cards.length, () => nextTick(scrollFeed));
watch(() => cards.cards.map(c => c.text.length).join(","), () => {
  // streaming grows the last card → keep pinned (non-index only)
  if (!disp.index) nextTick(scrollFeed);
});

onMounted(() => {
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("touchstart", onTs, { passive: true });
  document.addEventListener("touchend", onTe, { passive: true });
});
onUnmounted(() => {
  document.removeEventListener("wheel", onWheel);
  document.removeEventListener("touchstart", onTs);
  document.removeEventListener("touchend", onTe);
});

defineExpose({ scrollFeed });
</script>

<template>
  <section ref="feedEl" id="answers" class="feed" :class="{ 'rail-mode': railMode }" aria-label="答题记录">
    <div v-if="!cards.cards.length" class="empty-feed">
      <div><div class="big">◈</div>截图或自动触发后，答案会显示在这里</div>
    </div>

    <template v-if="railMode && heroCard">
      <div ref="railEl" class="rail" v-if="railCards.length">
        <AnswerCard
          v-for="c in railCards" :key="c.id" :card="c" rail-item
          :depth="0" :rep="true" :cur="false"
          :group-first="placement[c.id]?.groupFirst ?? false"
          :index-mode="true" :on-deck="true"
        />
      </div>
      <AnswerCard
        :key="heroCard.id" :card="heroCard"
        :depth="0" :rep="true" :cur="true"
        :group-first="placement[heroCard.id]?.groupFirst ?? false"
        :index-mode="true" :on-deck="true"
      />
    </template>

    <template v-else>
      <AnswerCard
        v-for="c in cards.cards" :key="c.id" :card="c"
        :depth="placement[c.id]?.depth ?? 0"
        :rep="placement[c.id]?.rep ?? true"
        :cur="placement[c.id]?.cur ?? false"
        :group-first="placement[c.id]?.groupFirst ?? false"
        :index-mode="disp.index"
        :on-deck="onDeck[c.id] ?? true"
      />
    </template>
  </section>
</template>
