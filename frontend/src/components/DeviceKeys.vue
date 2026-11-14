<script setup lang="ts">
/* Local-device key recorder slots (settings page). */
import { useKeysStore, HK_SLOTS, hkLabel, type HkAction } from "../stores/keys";
import { useUiStore } from "../stores/ui";

const keys = useKeysStore();
const ui = useUiStore();

function clickSlot(which: HkAction) {
  if (keys.recording === which) keys.stopRec();
  else keys.startRec(which);
}
function clear() {
  keys.clearAll();
  ui.show("本设备按键已清除");
}
</script>

<template>
  <div>
    <div class="hk-rec-grid">
      <label v-for="[act, label] in HK_SLOTS" :key="act" class="field">{{ label }}
        <div class="hk-rec" :class="{ listening: keys.recording === act }" tabindex="0" @click="clickSlot(act)">
          {{ keys.recording === act ? "按下按键或鼠标键… (Esc取消)" : hkLabel(keys.hk[act]) }}
        </div>
      </label>
    </div>
    <div class="btn-row">
      <button class="btn ghost small" @click="clear">清除本设备按键</button>
    </div>
    <p class="hint">点击方框后按下按键/鼠标键录制；Esc 取消，再次点击停止录制。</p>
  </div>
</template>
