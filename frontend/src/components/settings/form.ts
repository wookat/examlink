/* Shared settings-form state: local mirrors of the server state, synced via
   watch() with focus-guards so in-progress edits are never clobbered. */
import { computed, reactive, watch } from "vue";
import { useSessionStore } from "../../stores/session";
import { PROVIDERS, FALLBACK_SCENES, SCENE_LABELS } from "../../utils/direct";

export interface SettingsForm {
  monitor: number | null;
  scene: string;
  scenePrompt: string;
  customPrompt: string;
  knowledge: string;
  autoEnabled: boolean;
  threshold: number; stable: number; cooldown: number;
  ocrQnum: boolean;
  quality: number; maxDim: number;
  profile: string;
  provider: string; pBase: string; pKey: string; pModel: string;
  verify: string; fallback: string;
  dProvider: string; dBase: string; dKey: string; dModel: string;
  kbAuto: boolean;
  kbFirst: boolean;
}
// explicit annotation: deep reactive() literal inference degrades into
// Ref<T> for trailing properties (template type-check bug)
export const form: SettingsForm = reactive<SettingsForm>({
  monitor: null,
  scene: "general",
  scenePrompt: "",
  customPrompt: "",
  knowledge: "",
  autoEnabled: false,
  threshold: 1.5, stable: 1.5, cooldown: 3,
  ocrQnum: true,
  quality: 80, maxDim: 1600,
  profile: "",
  provider: "custom", pBase: "", pKey: "", pModel: "",
  verify: "", fallback: "",
  dProvider: "doubao", dBase: "", dKey: "", dModel: "",
  kbAuto: false,
  kbFirst: true,
});

export const editing: Record<string, boolean> = reactive({});

const session = () => useSessionStore();

export function scenePromptFrom(s: any) {
  const sid = form.scene || "general";
  form.scenePrompt = (s?.scenes && s.scenes[sid]) || FALLBACK_SCENES[sid] || "";
}

export function initSettingsSync() {
  watch(() => session().state, (s) => {
    if (!s) return;
    const a = s.auto || {};
    form.autoEnabled = !!a.enabled;
    if (a.change_ratio !== undefined) form.threshold = a.change_ratio * 100;
    else if (a.threshold !== undefined && a.threshold < 1) form.threshold = a.threshold * 100;
    if (a.stable_ms !== undefined) form.stable = a.stable_ms / 1000;
    if (a.cooldown_s !== undefined) form.cooldown = a.cooldown_s;
    if (a.ocr_qnum !== undefined) form.ocrQnum = !!a.ocr_qnum;
    form.monitor = s.monitor ?? null;
    form.scene = s.scene || "general";
    form.quality = s.jpeg_quality ?? 80;
    form.maxDim = s.max_image_dim ?? 1600;
    form.profile = s.active_profile || "";
    form.provider = s.proxy?.provider || "custom";
    form.verify = s.verify_profile || "";
    form.fallback = s.fallback_profile || "";
    form.kbAuto = !!s.kb_auto_append;
    form.kbFirst = s.kb_first !== false;
    if (!editing.scenePrompt) scenePromptFrom(s);
    if (!editing.customPrompt) form.customPrompt = s.custom_prompt || "";
    if (!editing.knowledge) form.knowledge = s.knowledge || "";
  }, { immediate: true, deep: true });

  watch(() => form.scene, () => { if (session().state) scenePromptFrom(session().state); });

  watch(() => session().directCfg, (d) => {
    if (d.provider) form.dProvider = d.provider;
    if (d.base_url) form.dBase = d.base_url;
    if (d.api_key) form.dKey = d.api_key;
    if (d.model) form.dModel = d.model;
  }, { immediate: true });
}

/* ---- option lists ---- */
export const monitorOpts = computed(() => [
  { label: "自动（主屏）", value: -1 },
  ...(session().state?.monitors || []).map(m => ({
    label: `显示器 ${m.index} (${m.width}×${m.height})${m.primary ? " · 主屏" : ""}`,
    value: m.index,
  })),
]);
export const profileOpts = computed(() => [
  { label: "自定义 / 手动", value: "" },
  ...Object.entries(session().state?.profiles || {}).map(([n, p]) => ({
    label: `${p.label} (${p.model})`, value: n,
  })),
]);
export const providerOpts = computed(() =>
  Object.entries(PROVIDERS).map(([id, p]) => ({ label: p.name, value: id })));
export const verifyOpts = computed(() => [
  { label: "关闭", value: "" },
  ...Object.entries(session().state?.profiles || {}).map(([n, p]) => ({
    label: `${p.label} (${p.model})`, value: n,
  })),
]);
export const sceneOpts = computed(() =>
  Object.keys(session().state?.scenes || FALLBACK_SCENES).map(id => ({
    label: SCENE_LABELS[id] || id, value: id,
  })));

export const isProxy = computed(() => session().aiMode === "proxy");
export const isDirect = computed(() => session().aiMode === "direct");

export const kbFileText = computed(() => {
  const kf = session().state?.knowledge_file;
  return kf?.exists ? `已加载 knowledge.md（${kf.chars} 字），与下方内容合并注入` : "可在考试机创建 knowledge.md 存放更大知识库";
});
export const promptCustomized = computed(() =>
  !!(session().state?.custom_prompt || (session().state?.scene_overrides || []).length));
export const kbActive = computed(() =>
  !!(session().state?.knowledge || session().state?.knowledge_file?.exists));

/* ---- server hotkey grid ---- */
export const HK_ORDER = ["capture", "snap", "nav_next", "nav_prev", "nav_down", "nav_up"];
export const hkItems = computed(() =>
  Object.fromEntries(((session().state?.hotkey?.items) || []).map(i => [i.action, i.trigger])));
export const hkChoices = computed(() =>
  Object.entries(session().state?.hotkey_choices || {}).map(([v, t]) => ({ label: t, value: v })));
export function setHk(action: string, trigger: string) {
  const items = HK_ORDER.map(a => ({ action: a, trigger: a === action ? trigger : (hkItems.value[a] || "") }))
    .filter(i => i.trigger);
  session().set({ hotkey: { items } });
}

/* ---- provider change: prefill base/model for empty fields ---- */
export function onProvChange(which: "p" | "d") {
  const p = PROVIDERS[which === "p" ? form.provider : form.dProvider];
  if (!p) return;
  if (which === "p") {
    if (p.base_url && !form.pBase) form.pBase = p.base_url;
    if (p.models[0] && !form.pModel) form.pModel = p.models[0];
    form.profile = "";
  } else {
    if (p.base_url && !form.dBase) form.dBase = p.base_url;
    if (p.models[0] && !form.dModel) form.dModel = p.models[0];
  }
}
