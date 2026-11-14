/* Direct mode: the controlling browser calls the model API itself with an
   OpenAI-compatible SSE stream — the exam PC only captures screenshots. */

export interface DirectCfg {
  provider?: string;
  base_url?: string;
  api_key?: string;
  model?: string;
}

export const PROVIDERS: Record<string, { name: string; base_url: string; models: string[] }> = {
  openai: { name: "OpenAI", base_url: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini", "gpt-5-mini"] },
  doubao: { name: "豆包 (火山方舟)", base_url: "https://ark.cn-beijing.volces.com/api/v3", models: ["doubao-seed-1-6-250615", "doubao-1-5-vision-pro-32k-250115", "doubao-1-5-vision-lite-32k-250115"] },
  qwen: { name: "通义千问", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen3-vl-plus", "qwen-vl-max", "qwen2.5-vl-72b-instruct"] },
  zhipu: { name: "智谱 GLM", base_url: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4v-flash", "glm-4v-plus", "glm-4.5v"] },
  kimi: { name: "Kimi", base_url: "https://api.moonshot.cn/v1", models: ["moonshot-v1-8k-vision-preview"] },
  gemini: { name: "Gemini", base_url: "https://generativelanguage.googleapis.com/v1beta/openai/", models: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"] },
  openrouter: { name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", models: ["google/gemini-2.5-flash", "openai/gpt-4o-mini"] },
  ollama: { name: "Ollama 本地", base_url: "http://localhost:11434/v1", models: ["qwen2.5vl:7b", "llava:7b"] },
  custom: { name: "自定义", base_url: "", models: [] },
};

export const SCENE_LABELS: Record<string, string> = {
  general: "通用问答", mcq: "选择题", code: "编程题", english: "英语考试", fill: "填空简答",
  telecom_cs: "电信·计算机类", telecom_comm: "电信·通信类", carrier: "运营商·计算机类",
};

export const FALLBACK_SCENES: Record<string, string> = {
  general: "你是一个答题助手。仔细看截图中的题目，直接给出准确、简洁的答案。选择题给出选项和理由，编程题给出思路和代码，简答题给出要点。不要寒暄。",
  mcq: "你是选择题答题专家。分析截图中的选择题，先判断题型，再给出答案选项（如 A、BC、ABD）和简短理由。如果是多选，列出所有正确选项。只输出答案和理由，不要多余内容。",
  code: "你是编程答题专家。分析截图中的编程/算法题，给出：1) 解题思路 2) 完整可运行代码 3) 复杂度分析。代码要简洁正确，注释清晰。如果题目要求用特定语言，用该语言作答。",
  english: "你是英语考试助手。分析截图中的英语题目（阅读/完形/翻译/作文），给出答案和必要的解释。作文题给出参考范文。",
  fill: "你是笔试答题助手。分析截图中的题目，给出可直接填写的答案。如果是填空题给出填空内容，如果是简答题给出条理清晰的答案要点。",
};

export function effectiveCfg(d: DirectCfg) {
  const prov = PROVIDERS[d.provider || ""] || PROVIDERS.custom;
  return {
    base_url: (d.base_url || prov.base_url || "").trim(),
    api_key: (d.api_key || "").trim(),
    model: (d.model || "").trim(),
  };
}

/** Streaming OpenAI-compatible chat call. Returns the full text. */
export async function directChat(opts: {
  cfg: { base_url: string; api_key: string; model: string };
  messages: any[];
  signal?: AbortSignal;
  onText: (full: string, streaming: boolean) => void;
}): Promise<string> {
  const { cfg, messages, signal, onText } = opts;
  let full = "";
  if (!cfg.base_url || !cfg.model) { onText("", false); return full; }
  try {
    const resp = await fetch(cfg.base_url.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (cfg.api_key || "not-needed") },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, max_tokens: 4096 }),
      signal,
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " " + (await resp.text()).slice(0, 200));
    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() || "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          const piece = j.choices?.[0]?.delta?.content || "";
          if (piece) { full += piece; onText(full, true); }
        } catch {}
      }
    }
  } finally {
    onText(full, false);
  }
  return full;
}

/** Fetch /models for the model-picker dropdown. */
export async function fetchModelIds(base: string, key: string): Promise<string[]> {
  const r = await fetch(base.replace(/\/$/, "") + "/models", { headers: { Authorization: "Bearer " + (key || "x") } });
  const j = await r.json();
  return (j.data || []).map((m: any) => m.id).filter(Boolean);
}
