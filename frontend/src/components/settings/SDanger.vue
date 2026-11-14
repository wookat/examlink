<script setup lang="ts">
import { NButton, NPopconfirm } from "naive-ui";
import { useSessionStore } from "../../stores/session";
import { useCardsStore } from "../../stores/cards";
import { useUiStore } from "../../stores/ui";
import { clearDirectHistory } from "../../ws";
import { form } from "./form";

const session = useSessionStore();
const cards = useCardsStore();
const ui = useUiStore();

function saveCfg() {
  const patch: Record<string, any> = { scene: form.scene, ai_mode: session.aiMode };
  if (form.profile) patch.profile = form.profile;
  else patch.proxy = { provider: form.provider, base_url: form.pBase.trim(), api_key: form.pKey.trim(), model: form.pModel.trim() };
  session.set(patch);
  session.saveDirectCfg({ provider: form.dProvider, base_url: form.dBase.trim(), api_key: form.dKey.trim(), model: form.dModel.trim() });
  ui.show("已保存");
}
function clearChat() {
  cards.clear(); clearDirectHistory();
  session.send({ t: "clear" });
  ui.show("记录已清空");
}
function shutdown() { session.send({ t: "shutdown" }); }
</script>

<template>
  <section class="card">
    <NButton type="primary" block @click="saveCfg">保存全部设置</NButton>
  </section>
  <section class="card danger">
    <NButton block @click="clearChat">清空答题记录</NButton>
    <NPopconfirm @positive-click="shutdown">
      <template #trigger><NButton type="error" block>关闭服务</NButton></template>
      确定关闭 examlink 服务？需回电脑重新运行。
    </NPopconfirm>
    <p class="hint">关闭后需回到考试电脑重新运行 main.py。</p>
  </section>
  <div class="settings-foot muted">examlink · 局域网截图答题 · v0.3</div>
</template>
