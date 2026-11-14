<script setup lang="ts">
import { X } from "@lucide/vue";
import { onMounted, onUnmounted } from "vue";

const props = defineProps<{ src: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.src) emit("close");
}
onMounted(() => document.addEventListener("keydown", onKey));
onUnmounted(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="src" class="lightbox" @click="emit('close')">
    <img :src="src" alt="">
    <button class="lb-close" aria-label="关闭" @click.stop="emit('close')">
      <X :size="20" />
    </button>
  </div>
</template>
