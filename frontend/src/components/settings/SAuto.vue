<script setup lang="ts">
import { NButton, NSlider, NSwitch } from "naive-ui";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { form } from "./form";

const session = useSessionStore();
const ui = useUiStore();
const setAuto = (patch: Record<string, any>) => session.set({ auto: patch });

/* one-click resource presets — each applies a bundle across capture,
   trigger and answer-image params in a single config patch */
const PRESETS: Record<string, { label: string; desc: string; patch: Record<string, any> }> = {
  eco: {
    label: "低耗",
    desc: "最省 CPU：适合考试机长期挂着",
    patch: { auto: { poll_ms: 800, stable_ms: 1200, ocr_qnum: false },
             jpeg_quality: 70, max_image_dim: 1200 },
  },
  bal: {
    label: "均衡",
    desc: "默认体验：触发快、占用低",
    patch: { auto: { poll_ms: 400, stable_ms: 600, ocr_qnum: true },
             jpeg_quality: 80, max_image_dim: 1600 },
  },
  fast: {
    label: "灵敏",
    desc: "最快响应：性能较强的机器",
    patch: { auto: { poll_ms: 250, stable_ms: 400, ocr_qnum: true },
             jpeg_quality: 88, max_image_dim: 2400 },
  },
};

function applyPreset(name: string) {
  const p = PRESETS[name];
  if (!p) return;
  session.set(p.patch);
  ui.show(`已应用「${p.label}」预设`);
}
</script>

<template>
  <section class="card">
    <h3>自动触发 <span class="card-sub">像素差异 → 稳定 → 自动答题</span></h3>
    <div class="btn-row preset-row">
      <NButton v-for="(p, k) in PRESETS" :key="k" size="small" :title="p.desc"
               @click="applyPreset(k)">{{ p.label }}</NButton>
      <span class="muted preset-tip">一键预设：检测频率 / OCR / 图像规格</span>
    </div>
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
