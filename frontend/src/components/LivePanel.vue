<script setup lang="ts">
import { X } from "@lucide/vue";
import { useSessionStore } from "../stores/session";
import { useUiStore } from "../stores/ui";

const session = useSessionStore();
const ui = useUiStore();
</script>

<template>
  <div v-if="ui.liveOpen" class="live-panel">
    <img :src="session.previewUrl" alt="考试屏实时画面">
    <button class="live-close" aria-label="关闭实时画面" @click="ui.liveOpen = false"><X :size="16" /></button>
  </div>
</template>
