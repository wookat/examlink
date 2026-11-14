<script setup lang="ts">
import { ref } from "vue";
import { NButton, NInput, NSelect } from "naive-ui";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { PROVIDERS, fetchModelIds } from "../../utils/direct";
import { form, onProvChange, profileOpts, providerOpts, verifyOpts } from "./form";

const session = useSessionStore();
const ui = useUiStore();

const modelList = ref<string[] | null>(null);
const modelLoading = ref(false);
async function fetchModels() {
  const base = form.pBase.trim() || PROVIDERS[form.provider]?.base_url || "";
  if (!base) { ui.show("请先填写 Base URL"); return; }
  modelLoading.value = true; modelList.value = [];
  try { modelList.value = await fetchModelIds(base, form.pKey.trim()); }
  catch (e: any) { modelList.value = null; ui.show("请求失败: " + e.message); }
  finally { modelLoading.value = false; }
}
</script>

<template>
  <!-- @vue-skip -- naive-ui is untyped; volar mis-emits .value unwraps on :value/@update:value pairs -->
  <div>
    <label class="field">配置档案
      <NSelect :value="form.profile" :options="profileOpts"
               @update:value="(v: any) => { form.profile = v; v && session.set({ profile: v }); }" />
    </label>
    <label class="field">供应商
      <NSelect :value="form.provider" :options="providerOpts"
               @update:value="(v: any) => { form.provider = v; onProvChange('p'); }" />
    </label>
    <label class="field">Base URL
      <NInput :value="form.pBase" @update:value="(v: any) => form.pBase = v" placeholder="https://..." @input="form.profile = ''" />
    </label>
    <label class="field">API Key
      <NInput :value="form.pKey" @update:value="(v: any) => form.pKey = v" type="password" show-password-on="click" placeholder="sk-..." @input="form.profile = ''" />
    </label>
    <div class="field-row">
      <label class="field grow">模型
        <NInput :value="form.pModel" @update:value="(v: any) => form.pModel = v" placeholder="model name" @input="form.profile = ''" />
      </label>
      <NButton size="small" :loading="modelLoading" @click="fetchModels">拉取</NButton>
    </div>
    <div v-if="modelList !== null" class="model-list">
      <div v-if="modelLoading">加载中…</div>
      <template v-if="!modelLoading && modelList.length">
        <div v-for="m in modelList" :key="m" @click="form.pModel = m">{{ m }}</div>
      </template>
      <div v-if="!modelLoading && !modelList.length">无结果（可能不支持 /models 或需鉴权）</div>
    </div>
    <label class="field">双模型校验 <span class="field-sub">（同一题再答一遍比对，不一致会标红）</span>
      <NSelect :value="form.verify" :options="verifyOpts"
               @update:value="(v: any) => { form.verify = v; session.set({ verify_profile: v }); ui.show(v ? '双模型校验已开启' : '双模型校验已关闭'); }" />
    </label>
    <label class="field">兜底模型 <span class="field-sub">（主模型失败时自动切换重答）</span>
      <NSelect :value="form.fallback" :options="verifyOpts"
               @update:value="(v: any) => { form.fallback = v; session.set({ fallback_profile: v }); ui.show(v ? '兜底模型已设置' : '兜底模型已关闭'); }" />
    </label>
    <p class="hint">档案的 Key 存在服务端 config.json；直连模式的 Key 只保存在本机浏览器。</p>
  </div>
</template>
