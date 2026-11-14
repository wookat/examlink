<script setup lang="ts">
import { NButton, NSlider, NSwitch } from "naive-ui";
import { useDispStore } from "../../stores/disp";

const disp = useDispStore();
const gazeOpts = [["left", "← 左侧视"], ["front", "正视"], ["right", "右侧视 →"], ["far", "远视"]];
const alignOpts = [["left", "靠左"], ["center", "居中"], ["right", "靠右"]];
const heroOpts = [["right", "在右"], ["left", "在左"]];
const deckOpts = [["carousel", "横向轮播"], ["stack", "叠放"], ["top", "重点在上"], ["left", "重点在左"], ["right", "重点在右"]];
const fontPresets = [[18, "紧凑"], [22, "标准"], [28, "远距"], [34, "超大"]];
</script>

<template>
  <section class="card">
    <h3>显示与视线 <span class="card-sub">按你坐的方向调</span></h3>
    <label class="field">视线预设
      <div class="seg">
        <button v-for="[g, l] in gazeOpts" :key="g" class="seg-btn"
                :class="{ active: disp.gaze === g }" @click="disp.setGaze(g)">{{ l }}</button>
      </div>
    </label>
    <label class="field">内容对齐
      <div class="seg">
        <button v-for="[a, l] in alignOpts" :key="a" class="seg-btn"
                :class="{ active: disp.align === a }" @click="disp.patch({ align: a as any, gaze: '' })">{{ l }}</button>
      </div>
    </label>
    <label class="field">答案位置（大字母侧）
      <div class="seg">
        <button v-for="[h, l] in heroOpts" :key="h" class="seg-btn"
                :class="{ active: disp.heroPos === h }" @click="disp.patch({ heroPos: h as any })">{{ l }}</button>
      </div>
    </label>
    <label class="field">卡组方向 <span class="field-sub">横向轮播：当前题居中、相邻题露出左右答案；其余模式：当前题在指定侧放大，历史题收在另一侧（需开答案索引）</span>
      <div class="seg">
        <button v-for="[d, l] in deckOpts" :key="d" class="seg-btn"
                :class="{ active: disp.deckDir === d }" @click="disp.patch({ deckDir: d as any })">{{ l }}</button>
      </div>
    </label>
    <label class="field">内容宽度 <output>{{ disp.cw }}%</output>
      <NSlider :value="disp.cw" :min="40" :max="100" :step="5"
               @update:value="(v: any) => { disp.cw = v; disp.gaze = ''; disp.save(); }" />
    </label>
    <label class="field">答题字号（整体基准） <output>{{ disp.fontPx }}px</output>
      <NSlider :value="disp.fontPx" :min="14" :max="72" :step="1" @update:value="(v: any) => disp.setFont(v)" />
    </label>
    <div class="font-grid">
      <label class="field">答案字号 <output>{{ disp.fsHeff }}px</output>
        <NSlider :value="disp.fsHeff" :min="20" :max="96" :step="1" @update:value="(v: any) => disp.patch({ fsH: v })" />
      </label>
      <label class="field">题名字号 <output>{{ disp.fsTeff }}px</output>
        <NSlider :value="disp.fsTeff" :min="11" :max="24" :step="1" @update:value="(v: any) => disp.patch({ fsT: v })" />
      </label>
      <label class="field">解析字号 <output>{{ disp.fsAeff }}px</output>
        <NSlider :value="disp.fsAeff" :min="12" :max="32" :step="1" @update:value="(v: any) => disp.patch({ fsA: v })" />
      </label>
      <label class="field">信息字号 <output>{{ disp.fsMeff }}px</output>
        <NSlider :value="disp.fsMeff" :min="10" :max="18" :step="1" @update:value="(v: any) => disp.patch({ fsM: v })" />
      </label>
    </div>
    <div class="btn-row">
      <NButton v-for="[px, l] in fontPresets" :key="px" size="small" @click="disp.setFont(px as number)">{{ l }}</NButton>
    </div>
    <label class="switch-row"><span class="switch-text">高对比（黑底白字）</span>
      <NSwitch :value="disp.contrast === 'high'" @update:value="(v: any) => disp.patch({ contrast: v ? 'high' : 'std' })" /></label>
    <label class="switch-row"><span class="switch-text">只显示最新答案</span>
      <NSwitch :value="disp.latestOnly" @update:value="(v: any) => disp.patch({ latestOnly: v })" /></label>
    <label class="switch-row"><span class="switch-text">极简点模式（缩成悬浮圆点）</span>
      <NSwitch :value="disp.dot" @update:value="(v: any) => disp.patch({ dot: v })" /></label>
    <label class="switch-row"><span class="switch-text">保持屏幕常亮（需 HTTPS 或 localhost）</span>
      <NSwitch :value="disp.wake" @update:value="(v: any) => disp.patch({ wake: v })" /></label>
    <label class="switch-row"><span class="switch-text">解析默认折叠（点大字答案展开）</span>
      <NSwitch :value="disp.fold" @update:value="(v: any) => disp.patch({ fold: v })" /></label>
    <label class="switch-row"><span class="switch-text">历史题折叠为答案索引（当前题完整显示）</span>
      <NSwitch :value="disp.index" @update:value="(v: any) => disp.patch({ index: v })" /></label>
    <p class="hint">侧视=内容贴到离你最近的屏幕边缘；远视=超大字+只看最新答案；极简点=整页缩成一个圆点，点开才显示答案。</p>
  </section>
</template>
