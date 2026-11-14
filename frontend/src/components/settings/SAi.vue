<script setup lang="ts">
import { useSessionStore } from "../../stores/session";
import { isDirect, isProxy } from "./form";
import SAiProxy from "./SAiProxy.vue";
import SAiDirect from "./SAiDirect.vue";

const session = useSessionStore();
const modeOpts = [["proxy", "代理（服务端）"], ["direct", "直连（本机）"]];
</script>

<template>
  <section class="card">
    <h3>AI 模型</h3>
    <div class="seg">
      <button v-for="[m, l] in modeOpts" :key="m" class="seg-btn"
              :class="{ active: session.aiMode === m }" @click="session.setAiMode(m as any)">{{ l }}</button>
    </div>
    <SAiProxy v-if="isProxy" />
    <SAiDirect v-else-if="isDirect" />
  </section>
</template>
