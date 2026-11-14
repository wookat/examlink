<script setup lang="ts">
import { NSelect } from "naive-ui";
import DeviceKeys from "../DeviceKeys.vue";
import { useSessionStore } from "../../stores/session";
import { HK_ORDER, hkChoices, hkItems, setHk } from "./form";

const session = useSessionStore();
</script>

<template>
  <section class="card">
    <h3>快捷键 <span class="card-sub">考试电脑全局 / 本设备页面</span></h3>
    <div class="field-label">考试电脑（按键/鼠标在考试机上生效）</div>
    <div class="hk-grid">
      <template v-for="a in HK_ORDER" :key="a">
        <div class="hk-act">{{ (session.state?.hotkey_actions || {})[a] || a }}</div>
        <NSelect size="small" :value="hkItems[a] || ''" :options="[{ label: '—', value: '' }, ...hkChoices]"
                 @update:value="(v: any) => setHk(a, v)" />
      </template>
    </div>
    <p class="hint">滚轮也可以作为触发——在考试机上滚动滚轮即可让答案屏翻页。鼠标中键会与页面自动滚动冲突，建议选 F 键或侧键。</p>
    <div class="divider"></div>
    <div class="field-label">本设备（答题页前台时生效）</div>
    <DeviceKeys />
  </section>
</template>
