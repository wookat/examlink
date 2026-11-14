<script setup lang="ts">
import { computed } from "vue";
import { ChevronUp, ChevronDown } from "@lucide/vue";
import { useCardsStore } from "../stores/cards";
import { useDispStore } from "../stores/disp";

const cards = useCardsStore();
const disp = useDispStore();
const show = computed(() => cards.cards.length >= 2);

function step(dir: number) {
  if (disp.index) { cards.deckStep(dir); return; }
  // non-index: page-scroll the feed
  const feed = document.getElementById("answers");
  feed?.scrollBy({ top: dir * feed.clientHeight * 0.8, behavior: "smooth" });
}
</script>

<template>
  <nav v-if="show" class="nav-ctl" aria-label="翻题">
    <button title="上一题" aria-label="上一题" @click="step(-1)"><ChevronUp :size="22" /></button>
    <button title="下一题" aria-label="下一题" @click="step(1)"><ChevronDown :size="22" /></button>
  </nav>
</template>
