/* examlink phone UI. No dependencies; minimal markdown renderer. */
"use strict";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TOKEN = params.get("t") || params.get("token") || location.hash.slice(1) || "";

const LS = {
  mode: "examlink.mode",
  d: "examlink.direct",   // {provider,base_url,api_key,model}
};

const SCENES = {
  general: "你是一个答题助手。仔细看截图中的题目，直接给出准确、简洁的答案。选择题给出选项和理由，编程题给出思路和代码，简答题给出要点。不要寒暄。",
  mcq: "你是选择题答题专家。分析截图中的选择题，先判断题型，再给出答案选项（如 A、BC、ABD）和简短理由。如果是多选，列出所有正确选项。只输出答案和理由，不要多余内容。",
  code: "你是编程答题专家。分析截图中的编程/算法题，给出：1) 解题思路 2) 完整可运行代码 3) 复杂度分析。代码要简洁正确，注释清晰。如果题目要求用特定语言，用该语言作答。",
  english: "你是英语考试助手。分析截图中的英语题目（阅读/完形/翻译/作文），给出答案和必要的解释。作文题给出参考范文。",
  fill: "你是笔试答题助手。分析截图中的题目，给出可直接填写的答案。如果是填空题给出填空内容，如果是简答题给出条理清晰的答案要点。",
};

// provider presets mirrored from ai.py (direct mode needs them client-side)
const PROVIDERS = {
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

// ---------------- state ----------------
let ws = null, state = null;
let aiMode = localStorage.getItem(LS.mode) || "proxy";
let directCfg = JSON.parse(localStorage.getItem(LS.d) || "{}");
let directHistory = [];
let pendingDirect = new Map();   // cardId -> {messages, card}
let abortCtrl = null;
let roiSelecting = false, roiStart = null;

// ---------------- helpers ----------------
function toast(msg, ms = 2200) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}
function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function b64Of(dataUri) { return dataUri.slice(dataUri.indexOf(",") + 1); }

// minimal markdown: code blocks, inline code, bold, headers, lists, paragraphs
function md(src) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let s = esc(src);
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^######\s*(.+)$/gm, "<h6>$1</h6>")
       .replace(/^###\s*(.+)$/gm, "<h5>$1</h5>")
       .replace(/^##\s*(.+)$/gm, "<h4>$1</h4>")
       .replace(/^#\s*(.+)$/gm, "<h3>$1</h3>");
  // lists
  s = s.replace(/((?:^\s*[-*]\s+.+\n?)+)/gm, m =>
    "<ul>" + m.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>") + "</ul>");
  s = s.replace(/((?:^\s*\d+[.)]\s+.+\n?)+)/gm, m =>
    "<ol>" + m.replace(/^\s*\d+[.)]\s+(.+)$/gm, "<li>$1</li>") + "</ol>");
  // paragraphs: wrap remaining lines not already in tags
  s = s.split(/(<\/?(?:ul|ol|pre|h[3-6]|li|p|code|b)[^>]*>)/).map(part => {
    if (part.startsWith("<")) return part;
    return part.split(/\n{2,}/).map(p => p.trim() ? `<p>${p.replace(/\n/g, "<br>")}</p>` : "").join("");
  }).join("");
  return s;
}

// ---------------- answer cards ----------------
function addCard({ id, image, trigger, tag }) {
  const div = document.createElement("div");
  div.className = "ans"; div.id = "card-" + id;
  div.innerHTML = `<div class="meta"><span class="tag ${trigger === "auto" ? "auto" : ""}">${tag || trigger || ""}</span><span class="time"></span></div>`;
  if (image) {
    const img = document.createElement("img"); img.className = "shot"; img.src = image;
    div.appendChild(img);
  }
  const mdEl = document.createElement("div"); mdEl.className = "md";
  div.appendChild(mdEl);
  $("#answers").appendChild(div);
  $("#answers").scrollTop = 1e9;
  return { el: div, md: mdEl };
}
function cardById(id) {
  const el = document.getElementById("card-" + id);
  return el ? { el, md: el.querySelector(".md") } : null;
}
function setCardText(id, text, streaming) {
  const c = cardById(id); if (!c) return;
  c.md.innerHTML = md(text);
  c.el.classList.toggle("streaming", !!streaming);
  c.el.scrollIntoView({ block: "nearest" });
}
function setCardMeta(id, txt) {
  const c = cardById(id); if (!c) return;
  c.el.querySelector(".time").textContent = txt;
}
function finishCard(id) { const c = cardById(id); if (c) c.el.classList.remove("streaming"); }
function errCard(id, msg) {
  const c = cardById(id) || addCard({ id: id || ("e" + Date.now()), image: null, trigger: "error" });
  c.md.innerHTML = `<span style="color:#ff8a8a">${md(msg)}</span>`;
  c.el.classList.remove("streaming");
}

// ---------------- websocket ----------------
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(TOKEN)}`);
  ws.onopen = () => { setConn("on", "已连接"); };
  ws.onclose = () => { setConn("err", "断开"); setTimeout(connect, 2000); };
  ws.onerror = () => setConn("err", "错误");
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    handle(m);
  };
}
function setConn(cls, txt) { $("#connDot").className = cls; $("#connText").textContent = txt; }

function handle(m) {
  switch (m.t) {
    case "state": onState(m); break;
    case "capture": onCapture(m); break;
    case "chunk": {
      const c = cardById(m.id);
      if (c) {
        c.el._text = (c.el._text || "") + m.text;
        setCardText(m.id, c.el._text, true);
      }
      $("#btnAbort").classList.remove("hidden");
      break;
    }
    case "done": finishCard(m.id); $("#btnAbort").classList.add("hidden"); break;
    case "error": toast(m.msg || "错误"); if (m.id) errCard(m.id, m.msg); $("#btnAbort").classList.add("hidden"); break;
    case "status": if (m.stage === "idle") $("#btnAbort").classList.add("hidden"); break;
    case "ask_ack": {
      const card = addCard({ id: m.id, image: null, trigger: "ask", tag: "追问" });
      card.el._text = "";
      setCardText(m.id, "⏳ 思考中…", true);
      $("#btnAbort").classList.remove("hidden");
      break;
    }
    case "cleared": $("#answers").innerHTML = ""; break;
    case "bye": toast("服务已关闭"); break;
  }
}

// ---------------- capture handling ----------------
function onCapture(m) {
  // remember raw b64 for possible direct-mode reuse
  window._lastB64 = b64Of(m.image);
  if (aiMode === "direct" && m.ask) {
    directAsk({ images: [window._lastB64], q: "", newConv: true, trigger: m.trigger, image: m.image });
  } else {
    const tag = m.trigger === "auto" ? "自动截图" : (m.ask ? "AI答题" : "截图");
    const card = addCard({ id: m.id, image: m.image, trigger: m.trigger, tag });
    card.el._text = "";
    if (!m.ask) setCardText(m.id, "（仅截图，未请求 AI）", false);
    if (m.ask && aiMode === "proxy") {
      // server streams chunks into this card id
      setCardText(m.id, "⏳ 思考中…", true);
      $("#btnAbort").classList.remove("hidden");
    }
  }
}

// ---------------- direct mode (browser -> provider) ----------------
async function directChat({ messages, cardId, onText }) {
  const cfg = effectiveDirectCfg();
  if (!cfg.base_url || !cfg.model) {
    toast("直连模式未配置 Base URL/模型");
    errCard(cardId, "未配置模型：请在「AI 模型 → 直连」中填写 Base URL 和模型");
    return;
  }
  abortCtrl = new AbortController();
  let full = "";
  try {
    const resp = await fetch(cfg.base_url.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (cfg.api_key || "not-needed") },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, max_tokens: 4096 }),
      signal: abortCtrl.signal,
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " " + (await resp.text()).slice(0, 200));
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
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
  } catch (e) {
    if (e.name !== "AbortError") { toast("直连请求失败: " + e.message); errCard(cardId, "请求失败: " + e.message); }
  } finally {
    abortCtrl = null;
    onText(full, false);
    $("#btnAbort").classList.add("hidden");
  }
}

function effectiveDirectCfg() {
  const prov = PROVIDERS[directCfg.provider] || PROVIDERS.custom;
  return {
    base_url: (directCfg.base_url || prov.base_url || "").trim(),
    api_key: (directCfg.api_key || "").trim(),
    model: (directCfg.model || "").trim(),
  };
}

function directAsk({ images, q, newConv, trigger, image }) {
  const cfg = effectiveDirectCfg();
  if (newConv) directHistory = [];
  const scene = SCENES[state?.scene] || SCENES.general;
  const msgs = [{ role: "system", content: scene }];
  // replay bounded history
  for (const h of directHistory.slice(-12)) msgs.push(h);
  const content = [];
  for (const b64 of images) content.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64 } });
  if (q) content.push({ type: "text", text: q });
  if (!content.length) content.push({ type: "text", text: "请分析这张截图并给出答案。" });
  const userMsg = { role: "user", content };
  msgs.push(userMsg);
  const id = "d" + Date.now().toString(36);
  const tag = trigger === "auto" ? "自动截图" : "AI答题";
  const card = addCard({ id, image: image || (images.length ? "data:image/jpeg;base64," + images[0] : null), trigger, tag });
  card.el._text = "";
  setCardText(id, "⏳ 思考中…", true);
  $("#btnAbort").classList.remove("hidden");
  let lastFull = "";
  directChat({
    messages: msgs, cardId: id,
    onText: (full, streaming) => { lastFull = full; setCardText(id, full, streaming); },
  }).then(() => {
    directHistory.push(userMsg, { role: "assistant", content: lastFull });
    while (directHistory.length > 16) directHistory.splice(0, 2);
    pendingDirect.delete(id);
  });
}

// ---------------- state -> UI ----------------
function onState(s) {
  state = s;
  // preview
  if (!$("#preview").src.includes("preview.mjpg")) {
    $("#preview").src = `/preview.mjpg?token=${encodeURIComponent(TOKEN)}`;
  }
  // roi badge + box
  const roi = s.roi;
  $("#roiBadge").classList.toggle("hidden", !roi);
  $("#btnClearRoi").classList.toggle("hidden", !roi);
  const box = $("#roiBox");
  if (roi) {
    box.classList.remove("hidden");
    box.style.left = roi[0] * 100 + "%";
    box.style.top = roi[1] * 100 + "%";
    box.style.width = (roi[2] - roi[0]) * 100 + "%";
    box.style.height = (roi[3] - roi[1]) * 100 + "%";
  } else box.classList.add("hidden");
  // auto controls
  const a = s.auto || {};
  $("#autoEnabled").checked = !!a.enabled;
  $("#autoThreshold").value = a.threshold ?? 5;
  $("#autoStable").value = a.stable_ms ? a.stable_ms / 1000 : 1.5;
  $("#autoCooldown").value = a.cooldown_s ?? 8;
  syncAutoLabels();
  $("#autoState").textContent = a.enabled ? "运行中" : "已关闭";
  // monitor
  const ms = $("#monitorSel");
  if (ms.options.length !== (s.monitors || []).length + 1) {
    ms.innerHTML = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "自动（主屏）";
    ms.appendChild(o0);
    for (const m of s.monitors || []) {
      const o = document.createElement("option");
      o.value = m.index;
      o.textContent = `显示器 ${m.index} (${m.width}×${m.height})${m.primary ? " 主屏" : ""}`;
      ms.appendChild(o);
    }
  }
  ms.value = String(s.monitor ?? "");
  // scene
  const ss = $("#sceneSel");
  if (!ss.options.length) {
    for (const [id, prompt] of Object.entries(s.scenes || SCENES)) {
      const o = document.createElement("option"); o.value = id;
      o.textContent = { general: "通用问答", mcq: "选择题", code: "编程题", english: "英语考试", fill: "填空简答" }[id] || id;
      ss.appendChild(o);
    }
  }
  ss.value = s.scene || "general";
  // proxy form (fill once / when not focused)
  if (!$("#pKey").value && !document.activeElement.matches("#pKey,#pBase,#pModel")) {
    // don't overwrite user typing; server doesn't send secrets back anyway
  }
  $("#pProvider").value = (s.proxy && s.proxy.provider) || "custom";
  // profiles
  const ps = $("#pProfile");
  const profs = s.profiles || {};
  if (ps.options.length !== Object.keys(profs).length + 1) {
    ps.innerHTML = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "自定义/手动";
    ps.appendChild(o0);
    for (const [n, p] of Object.entries(profs)) {
      const o = document.createElement("option"); o.value = n;
      o.textContent = `${p.label} (${p.model})`;
      ps.appendChild(o);
    }
  }
  ps.value = s.active_profile || "";
  syncSeg();
}

function syncAutoLabels() {
  $("#vThreshold").textContent = $("#autoThreshold").value;
  $("#vStable").textContent = $("#autoStable").value + "s";
  $("#vCooldown").textContent = $("#autoCooldown").value + "s";
}

// ---------------- settings UI ----------------
function fillProviderSelect(sel, providers) {
  sel.innerHTML = "";
  for (const [id, p] of Object.entries(providers)) {
    const o = document.createElement("option"); o.value = id; o.textContent = p.name || id;
    sel.appendChild(o);
  }
}
function syncSeg() {
  document.querySelectorAll("#modeSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === aiMode));
  $("#proxyCfg").classList.toggle("hidden", aiMode !== "proxy");
  $("#directCfg").classList.toggle("hidden", aiMode !== "direct");
}

// ROI select via pointer events on preview wrap
const wrap = $("#previewWrap");
function normPos(e) {
  const r = wrap.getBoundingClientRect();
  return [
    Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  ];
}
wrap.addEventListener("pointerdown", (e) => {
  if (!roiSelecting) return;
  roiStart = normPos(e); wrap.setPointerCapture(e.pointerId);
  drawRoiTemp(roiStart, roiStart);
});
wrap.addEventListener("pointermove", (e) => {
  if (!roiSelecting || !roiStart) return;
  drawRoiTemp(roiStart, normPos(e));
});
wrap.addEventListener("pointerup", (e) => {
  if (!roiSelecting || !roiStart) return;
  const p = normPos(e);
  const x0 = Math.min(roiStart[0], p[0]), x1 = Math.max(roiStart[0], p[0]);
  const y0 = Math.min(roiStart[1], p[1]), y1 = Math.max(roiStart[1], p[1]);
  roiSelecting = false; $("#roiHint").classList.add("hidden");
  if (x1 - x0 > 0.02 && y1 - y0 > 0.02) {
    send({ t: "set", patch: { roi: [x0, y0, x1, y1] } });
    toast("监控区域已设置");
  }
  roiStart = null; $("#roiBox").classList.add("hidden");
});
function drawRoiTemp(a, b) {
  const box = $("#roiBox");
  box.classList.remove("hidden");
  box.style.left = Math.min(a[0], b[0]) * 100 + "%";
  box.style.top = Math.min(a[1], b[1]) * 100 + "%";
  box.style.width = Math.abs(b[0] - a[0]) * 100 + "%";
  box.style.height = Math.abs(b[1] - a[1]) * 100 + "%";
}

// ---------------- wire events ----------------
$("#btnCapture").onclick = () => { send({ t: "capture", ask: true }); };
$("#btnSnap").onclick = () => { send({ t: "capture", ask: false }); };
$("#btnRoi").onclick = () => {
  roiSelecting = true; $("#roiHint").classList.remove("hidden");
  toast("在画面上拖动框选");
};
$("#btnClearRoi").onclick = () => send({ t: "set", patch: { roi: null } });
$("#btnAsk").onclick = doAsk;
$("#askInput").addEventListener("keydown", e => { if (e.key === "Enter") doAsk(); });
$("#btnAbort").onclick = () => {
  if (aiMode === "direct" && abortCtrl) { abortCtrl.abort(); return; }
  send({ t: "abort" });
};
$("#btnClearChat").onclick = () => {
  $("#answers").innerHTML = ""; directHistory = [];
  send({ t: "clear" });
};
$("#btnShutdown").onclick = () => {
  if (confirm("确定关闭 examlink 服务？考试电脑上需重新运行 service.py 才能恢复。")) send({ t: "shutdown" });
};
$("#btnSaveCfg").onclick = saveCfg;
$("#btnModels").onclick = fetchModels;
$("#modelList").onclick = (e) => { if (e.target.dataset.model) { $("#pModel").value = e.target.dataset.model; } };
$("#pProfile").onchange = (e) => {
  if (e.target.value) send({ t: "set", patch: { profile: e.target.value } });
};
// editing proxy fields manually => switch profile select to custom
["#pBase", "#pKey", "#pModel", "#pProvider"].forEach(sel =>
  $(sel).addEventListener("input", () => { $("#pProfile").value = ""; }));

function doAsk() {
  const q = $("#askInput").value.trim();
  if (!q) return;
  $("#askInput").value = "";
  if (aiMode === "direct") {
    directAsk({ images: window._lastB64 ? [window._lastB64] : [], q, newConv: false });
  } else {
    const id = "a" + Date.now().toString(36);
    addCard({ id, image: null, trigger: "ask", tag: "追问" })._text = "";
    send({ t: "ask", q, new: false });
    // server uses its own cid in ask_ack; simplest: rely on ask_ack card
    document.getElementById("card-" + id)?.remove();
    $("#btnAbort").classList.remove("hidden");
  }
}

function saveCfg() {
  const prof = $("#pProfile").value;
  const patch = { scene: $("#sceneSel").value, ai_mode: aiMode };
  if (prof) {
    patch.profile = prof;   // profile wins; don't overwrite with stale form fields
  } else {
    patch.proxy = {
      provider: $("#pProvider").value,
      base_url: $("#pBase").value.trim(),
      api_key: $("#pKey").value.trim(),
      model: $("#pModel").value.trim(),
    };
  }
  send({ t: "set", patch });
  // direct config stays local
  directCfg = {
    provider: $("#dProvider").value,
    base_url: $("#dBase").value.trim(),
    api_key: $("#dKey").value.trim(),
    model: $("#dModel").value.trim(),
  };
  localStorage.setItem(LS.d, JSON.stringify(directCfg));
  localStorage.setItem(LS.mode, aiMode);
  toast("已保存");
}

async function fetchModels() {
  const base = $("#pBase").value.trim() || (PROVIDERS[$("#pProvider").value] || {}).base_url || "";
  const key = $("#pKey").value.trim();
  if (!base) { toast("请先填写 Base URL"); return; }
  $("#modelList").classList.remove("hidden");
  $("#modelList").innerHTML = "<div>加载中…</div>";
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/models", { headers: { Authorization: "Bearer " + (key || "x") } });
    const j = await r.json();
    const ids = (j.data || []).map(m => m.id).filter(Boolean);
    $("#modelList").innerHTML = ids.length
      ? ids.map(id => `<div data-model="${id}">${id}</div>`).join("")
      : "<div>无结果（可能不支持 /models 或需鉴权）</div>";
  } catch (e) {
    $("#modelList").innerHTML = "<div>请求失败: " + e.message + "</div>";
  }
}

// auto sliders -> server
function bindAuto(id, key, scale = 1) {
  $(id).addEventListener("input", syncAutoLabels);
  $(id).addEventListener("change", () => {
    let v = parseFloat($(id).value);
    if (key === "stable_ms") v = Math.round(v * 1000);
    send({ t: "set", patch: { auto: { [key]: v } } });
  });
}
bindAuto("#autoThreshold", "threshold");
bindAuto("#autoStable", "stable_ms");
bindAuto("#autoCooldown", "cooldown_s");
$("#autoEnabled").onchange = (e) => {
  send({ t: "set", patch: { auto: { enabled: e.target.checked } } });
  $("#autoState").textContent = e.target.checked ? "运行中" : "已关闭";
};
$("#monitorSel").onchange = (e) => send({ t: "set", patch: { monitor: e.target.value === "" ? null : parseInt(e.target.value) } });
$("#sceneSel").onchange = (e) => send({ t: "set", patch: { scene: e.target.value } });

// mode seg
$("#modeSeg").addEventListener("click", (e) => {
  const b = e.target.closest(".seg-btn"); if (!b) return;
  aiMode = b.dataset.mode;
  localStorage.setItem(LS.mode, aiMode);
  syncSeg();
});

// provider selects
fillProviderSelect($("#pProvider"), PROVIDERS);
fillProviderSelect($("#dProvider"), PROVIDERS);
function onProvChange(sel, baseInp, modelInp) {
  sel.addEventListener("change", () => {
    const p = PROVIDERS[sel.value];
    if (p && p.base_url && !baseInp.value) baseInp.value = p.base_url;
    if (p && p.models && p.models.length && !modelInp.value) modelInp.value = p.models[0];
  });
}
onProvChange($("#pProvider"), $("#pBase"), $("#pModel"));
onProvChange($("#dProvider"), $("#dBase"), $("#dModel"));
// load direct cfg
(function initDirect() {
  $("#dProvider").value = directCfg.provider || "doubao";
  $("#dBase").value = directCfg.base_url || "";
  $("#dKey").value = directCfg.api_key || "";
  $("#dModel").value = directCfg.model || "";
  // auto-fill preset if empty
  const p = PROVIDERS[$("#dProvider").value];
  if (p && !$("#dBase").value) $("#dBase").value = p.base_url;
  if (p && p.models && p.models[0] && !$("#dModel").value) $("#dModel").value = p.models[0];
})();

syncSeg();
if (!TOKEN) toast("URL 缺少 token，请从电脑上显示的链接打开", 4000);
connect();
