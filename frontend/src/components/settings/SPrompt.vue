<script setup lang="ts">
import { NButton, NInput, NSelect } from "naive-ui";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { FALLBACK_SCENES } from "../../utils/direct";
import { editing, form, promptCustomized, sceneOpts } from "./form";

const session = useSessionStore();
const ui = useUiStore();

function savePrompt() {
  session.set({ custom_prompt: form.customPrompt.trim(), scenes: { [form.scene]: form.scenePrompt.trim() } });
  ui.show("提示词已保存");
}
function resetPrompt() {
  session.set({ scenes: { [form.scene]: "" } });
  form.scenePrompt = FALLBACK_SCENES[form.scene] || "";
  ui.show("已恢复该场景默认提示词");
}
</script>

<template>
  <section class="card">
    <h3>答题提示词</h3>
    <label class="field">答题场景
      <NSelect :value="form.scene" :options="sceneOpts"
               @update:value="(v: any) => { form.scene = v; session.set({ scene: v }); }" />
    </label>
    <label class="field">全局自定义提示词 <span class="field-sub">（留空则用场景提示词）</span>
      <NInput @focus="editing.customPrompt = true" @blur="editing.customPrompt = false"
              :value="form.customPrompt" @update:value="(v: any) => form.customPrompt = v"
              type="textarea" :rows="3"
              placeholder="例如：你是资深面试官，请分步骤拆解这道题…" />
    </label>
    <label class="field">场景提示词（可编辑）
      <NInput @focus="editing.scenePrompt = true" @blur="editing.scenePrompt = false"
              :value="form.scenePrompt" @update:value="(v: any) => form.scenePrompt = v"
              type="textarea" :rows="6" />
    </label>
    <div class="btn-row">
      <NButton size="small" @click="savePrompt">保存提示词</NButton>
      <NButton size="small" quaternary @click="resetPrompt">恢复默认</NButton>
      <span v-if="promptCustomized" class="badge-tag">已自定义</span>
    </div>
    <p class="hint">优先级：全局自定义 &gt; 场景提示词 &gt; 内置默认。config.json 中 scenes / custom_prompt 可直接配置。</p>
  </section>
</template>
