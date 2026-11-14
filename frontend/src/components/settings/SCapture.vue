<script setup lang="ts">
import { NSelect, NSlider } from "naive-ui";
import RoiPreview from "../RoiPreview.vue";
import { useSessionStore } from "../../stores/session";
import { form, monitorOpts } from "./form";

const session = useSessionStore();
</script>

<template>
  <section class="card">
    <h3>画面与显示器</h3>
    <RoiPreview />
    <label class="field">捕获显示器
      <NSelect :value="form.monitor ?? -1" :options="monitorOpts"
               @update:value="(v: any) => { form.monitor = v === -1 ? null : v; session.set({ monitor: form.monitor }); }" />
    </label>
    <div class="slider-group">
      <label>截图质量 <output>{{ form.quality }}%</output></label>
      <NSlider :value="form.quality" :min="60" :max="100" :step="1"
               @update:value="(v: any) => { form.quality = v; session.set({ jpeg_quality: v }); }" />
      <label>最大边长 <output>{{ form.maxDim }}px</output></label>
      <NSlider :value="form.maxDim" :min="1200" :max="4096" :step="100"
               @update:value="(v: any) => { form.maxDim = v; session.set({ max_image_dim: v }); }" />
    </div>
    <p class="hint">自动触发只监控所选区域；留空=自动跟随主屏。质量/边长越高越清晰，但截图与 AI 请求更慢。</p>
  </section>
</template>
