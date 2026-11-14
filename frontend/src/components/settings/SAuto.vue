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
      <label>触发阈值 <output>{{ form.threshold.toFixed(1) }}%</output></label>
      <NSlider :value="form.threshold" :min="0.2" :max="8" :step="0.1"
               @update:value="(v: any) => setAuto({ change_ratio: v / 100 })" />
      <label>稳定等待 <output>{{ form.stable.toFixed(1) }}s</output></label>
      <NSlider :value="form.stable" :min="0.5" :max="5" :step="0.5"
               @update:value="(v: any) => setAuto({ stable_ms: Math.round(v * 1000) })" />
      <label>冷却时间 <output>{{ form.cooldown }}s</output></label>
      <NSlider :value="form.cooldown" :min="2" :max="30" :step="1"
               @update:value="(v: any) => setAuto({ cooldown_s: v })" />
    </div>
    <label class="switch-row">
      <span class="switch-text">题号识别（本地 OCR）<small>截图后识别真实题号，卡片显示第 N 题</small></span>
      <NSwitch :value="form.ocrQnum" @update:value="(v: any) => setAuto({ ocr_qnum: v })" />
    </label>
    <p class="hint">触发阈值 = 画面相对上次答题变化的像素占比，越小越灵敏；渐变翻页也会被累计检出。稳定等待=画面静止多久才截图；冷却=两次自动答题最小间隔。OCR 全部在本机离线完成。</p>
  </section>
</template>
