<script setup lang="ts">
import { NButton, NInput, NSwitch } from "naive-ui";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { editing, form, kbActive, kbFileText } from "./form";

const session = useSessionStore();
const ui = useUiStore();
function saveKb() {
  session.set({ knowledge: form.knowledge.trim() });
  ui.show("知识库已保存");
}
</script>

<template>
  <section class="card">
    <h3>知识库 <span class="card-sub">作答时优先参考</span></h3>
    <div class="kb-file muted">{{ kbFileText }}</div>
    <label class="field">知识点 / 速查资料
      <NInput @focus="editing.knowledge = true" @blur="editing.knowledge = false"
              :value="form.knowledge" @update:value="(v: any) => form.knowledge = v"
              type="textarea" :rows="7"
              placeholder="粘贴要优先参考的内容：高频考点、企业文化常识、错题结论、公式表…&#10;作答时模型会优先依据这里的内容。" />
    </label>
    <div class="btn-row">
      <NButton size="small" @click="saveKb">保存知识库</NButton>
      <span v-if="kbActive" class="badge-tag">已启用</span>
    </div>
    <label class="switch-row">
      <span class="switch-text">同题秒回：画面与已答题完全一致时直接复用旧答案（不请求 AI）</span>
      <NSwitch :value="form.kbFirst" @update:value="(v: any) => { session.set({ kb_first: v }); ui.show(v ? '相同题面将秒回历史答案' : '已关闭同题秒回'); }" />
    </label>
    <label class="switch-row">
      <span class="switch-text">答过的题自动收录进 knowledge.md（错题本自增）</span>
      <NSwitch :value="form.kbAuto" @update:value="(v: any) => { session.set({ kb_auto_append: v }); ui.show(v ? '答过的题将自动收录进 knowledge.md' : '已关闭自动收录'); }" />
    </label>
    <p class="hint">两处来源合并生效：考试机上的 <code>knowledge.md</code> 文件（适合大量资料）+ 此处在线编辑的内容。注入在系统提示词末尾，上限约 10 万字。</p>
  </section>
</template>
