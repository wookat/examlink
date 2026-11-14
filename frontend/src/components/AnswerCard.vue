<script setup lang="ts">
import { computed } from "vue";
import type { CardItem } from "../types";
import { md } from "../utils/md";
import { copyText, useUiStore } from "../stores/ui";
import { useCardsStore } from "../stores/cards";

const props = defineProps<{
  card: CardItem;
  depth: number;        // --d deck depth (0 = hero)
  rep: boolean;         // represents its question group
  cur: boolean;         // focused group
  groupFirst: boolean;  // first card of a contiguous qnum run → 第N题 chip
  indexMode: boolean;
  onDeck: boolean;
  railItem?: boolean;   // compact row inside the history rail (rail layout)
}>();

const ui = useUiStore();
const cards = useCardsStore();

const tagCls = computed(() => {
  if (props.card.tag === "错误" || props.card.error) return "err";
  if (props.card.trigger === "auto") return "auto";
  if (props.card.trigger === "ask" || props.card.kind === "ask") return "ask";
  return "shot";
});

const cls = computed(() => ({
  "ans": true,
  "cur-q": props.indexMode && props.cur,
  "q-hero": props.indexMode && props.cur && props.rep,
  "below": props.indexMode && props.depth < 0,   // newer than focus → peeks below hero
  "deck-off": props.indexMode && !props.onDeck,
  "rail-item": props.railItem,
  "err-card": props.card.error,
  "streaming": props.card.streaming,
  "has-hero": !!props.card.answer,
  "detail-open": props.card.detailOpen,
}));

const bodyHtml = computed(() => md(cards.bodyText(props.card)));

function flip() { props.card.detailOpen = !props.card.detailOpen; }

function onCopy() {
  const div = document.createElement("div");
  div.innerHTML = bodyHtml.value;
  copyText(div.innerText, ui.show);
}
function onPeekClick(e: MouseEvent) {
  // clicking a peeking strip brings that question to the front
  if (props.indexMode && !props.cur && props.onDeck) cards.focusGroupOf(props.card.id);
}
</script>

<template>
  <article :class="cls" :style="{ '--d': Math.abs(depth) }" @click="onPeekClick">
    <div class="ans-head">
      <span v-if="groupFirst && card.qnum" class="qchip">第 {{ card.qno || card.qnum }} 题</span>
      <span class="tag" :class="tagCls">{{ card.tag }}</span>
      <span v-if="card.answer" class="ans-ans">答案 {{ card.answer }}</span>
      <span v-if="card.verify" class="verify-chip" :class="card.verify.agree ? 'ok' : 'diff'"
            :title="card.verify.agree ? card.verify.model : '两个模型答案不一致'">
        {{ card.verify.agree ? "✓ 双模型一致" : "⚠ 分歧→" + card.verify.model + ": " + (card.verify.alt || "?") }}
      </span>
      <span class="ans-status">{{ card.streaming ? "作答中" : "" }}</span>
      <span class="ans-time">{{ card.time }}</span>
      <button class="copy-btn" title="复制答案" @click.stop="onCopy">
        <svg class="ico" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <img v-if="card.image && !card.answer" class="shot-thumb" :src="card.image" loading="lazy"
           @click.stop="ui.openLightbox(card.image!)" alt="截图">
    </div>

    <div v-if="card.title && !card.answer" class="ans-sub">{{ card.title }}</div>

    <div v-if="card.answer" class="qrow" @click="flip">
      <div class="qinfo">
        <div v-if="card.title" class="ans-sub">{{ card.title }}</div>
        <img v-if="card.image" class="shot-thumb" :src="card.image" loading="lazy"
             @click.stop="ui.openLightbox(card.image!)" alt="截图">
      </div>
      <div class="qbig" :class="{ 'text-ans': card.textAns }">
        <span class="ql">{{ card.answerLetter }}</span>
        <span class="qr">{{ card.answerRest }}</span>
      </div>
    </div>
    <button v-if="card.answer" class="detail-toggle" @click.stop="flip">
      {{ card.detailOpen ? "收起解析 ▴" : "解析 ▾" }}
    </button>

    <div class="md" :class="{ 'md-err': card.error }" v-html="bodyHtml"></div>
    <div v-if="card.stopped" class="stopped-note">已停止（部分内容）</div>
  </article>
</template>
