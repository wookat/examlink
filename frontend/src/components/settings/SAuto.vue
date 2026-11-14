<script setup lang="ts">
import { NSlider, NSwitch } from "naive-ui";
import { useSessionStore } from "../../stores/session";
import { form } from "./form";

const session = useSessionStore();
const setAuto = (patch: Record<string, any>) => session.set({ auto: patch });
</script>

<template>
  <section class="card">
    <h3>自动触发 <span class="card-sub">像素差异 → 稳定 → 自动答题</span></h3>
    <label class="switch-row">
      <span class="switch-text">启用自动答题</span>
      <NSwitch :value="form.autoEnabled" @update:value="(v: any) => setAuto({ enabled: v })" />
    </label>
    <div class="slider-group">
      <label>灵敏度 <output>{{ form.threshold.toFixed(1) }}</output></label>
      <NSlider :value="form.threshold" :min="1" :max="20" :step="0.5"
               @update:value="(v: any) => setAuto({ threshold: v })" />
      <label>稳定等待 <output>{{ form.stable.toFixed(1) }}s</output></label>
      <NSlider :value="form.stable" :min="0.5" :max="5" :step="0.5"
               @update:value="(v: any) => setAuto({ stable_ms: Math.round(v * 1000) })" />
      <label>冷却时间 <output>{{ form.cooldown }}s</output></label>
      <NSlider :value="form.cooldown" :min="2" :max="30" :step="1"
               @update:value="(v: any) => setAuto({ cooldown_s: v })" />
    </div>
    <p class="hint">灵敏度越高越不容易误触发；稳定等待=画面停止变化多久后才截图；冷却=两次自动答题的最小间隔。</p>
  </section>
</template>
