<script setup lang="ts">
import { computed } from "vue";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "@lucide/vue";
import { useCardsStore } from "../stores/cards";
import { useDispStore } from "../stores/disp";

const cards = useCardsStore();
const disp = useDispStore();
const show = computed(() => cards.cards.length >= 2);
const horizontal = computed(() => disp.index && disp.deckDir === "carousel");

function step(dir: number) {
  if (disp.index) { cards.deckStep(dir); return; }
  // non-index: page-scroll the feed
  const feed = document.getElementById("answers");
  feed?.scrollBy({ top: dir * feed.clientHeight * 0.8, behavior: "smooth" });
}
</script>

<template>
  <nav v-if="show" class="nav-ctl" :class="{ 'nav-h': horizontal }" aria-label="翻题">
    <button title="上一题" aria-label="上一题" @click="step(-1)">
      <ChevronLeft v-if="horizontal" :size="22" /><ChevronUp v-else :size="22" />
    </button>
    <button title="下一题" aria-label="下一题" @click="step(1)">
      <ChevronRight v-if="horizontal" :size="22" /><ChevronDown v-else :size="22" />
    </button>
  </nav>
</template>
