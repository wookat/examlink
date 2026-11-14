<script setup lang="ts">
import { NInput, NSelect } from "naive-ui";
import { form, onProvChange, providerOpts } from "./form";
</script>

<template>
  <!-- @vue-skip -- naive-ui is untyped; volar mis-emits .value unwraps on :value/@update:value pairs -->
  <div>
    <label class="field">供应商
      <NSelect :value="form.dProvider" :options="providerOpts"
               @update:value="(v: any) => { form.dProvider = v; onProvChange('d'); }" />
    </label>
    <label class="field">Base URL
      <NInput :value="form.dBase" @update:value="(v: any) => form.dBase = v" placeholder="https://..." />
    </label>
    <label class="field">API Key
      <NInput :value="form.dKey" @update:value="(v: any) => form.dKey = v" type="password" show-password-on="click" placeholder="sk-..." />
    </label>
    <label class="field">模型
      <NInput :value="form.dModel" @update:value="(v: any) => form.dModel = v" placeholder="model name" />
    </label>
  </div>
</template>
