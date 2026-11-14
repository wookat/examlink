/* examlink — hash-routed SPA. Live answer view + settings view. */
"use strict";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let TOKEN = params.get("t") || params.get("token") || "";
if (!TOKEN) {
  const m = location.hash.match(/[#&?]t=([a-zA-Z0-9]+)/);
  if (m) TOKEN = m[1];
}
const TOKEN_FINAL = TOKEN;

const LS = { mode: "examlink.mode", d: "examlink.direct", font: "examlink.fontpx" };

const SCENES = {
  general: "你是一个答题助手。仔细看截图中的题目，直接给出准确、简洁的答案。选择题给出选项和理由，编程题给出思路和代码，简答题给出要点。不要寒暄。",
  mcq: "你是选择题答题专家。分析截图中的选择题，先判断题型，再给出答案选项（如 A、BC、ABD）和简短理由。如果是多选，列出所有正确选项。只输出答案和理由，不要多余内容。",
  code: "你是编程答题专家。分析截图中的编程/算法题，给出：1) 解题思路 2) 完整可运行代码 3) 复杂度分析。代码要简洁正确，注释清晰。如果题目要求用特定语言，用该语言作答。",
  english: "你是英语考试助手。分析截图中的英语题目（阅读/完形/翻译/作文），给出答案和必要的解释。作文题给出参考范文。",
  fill: "你是笔试答题助手。分析截图中的题目，给出可直接填写的答案。如果是填空题给出填空内容，如果是简答题给出条理清晰的答案要点。",
};
const SCENE_LABELS = {
  general: "通用问答", mcq: "选择题", code: "编程题", english: "英语考试", fill: "填空简答",
  telecom_cs: "电信·计算机类", telecom_comm: "电信·通信类", carrier: "运营商·计算机类",
};

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
let ws = null, state = null, view = "live";
let aiMode = localStorage.getItem(LS.mode) || "proxy";
let directCfg = JSON.parse(localStorage.getItem(LS.d) || "{}");
let directHistory = [];
let abortCtrl = null;
let roiSelecting = false, roiStart = null;
let fontPx = parseInt(localStorage.getItem(LS.font) || "20", 10);
let previewLoaded = false;

// ---------------- helpers ----------------
function toast(msg, ms = 2400) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}
function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function b64Of(dataUri) { return dataUri.slice(dataUri.indexOf(",") + 1); }
function fmtTime() { const d = new Date(); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }

// LaTeX -> readable unicode math (offline, no KaTeX dependency).
// Covers the operators/structures that actually appear in exam answers.
const SUP_C = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
  "+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ","x":"ˣ","a":"ᵃ","b":"ᵇ","c":"ᶜ","t":"ᵗ","k":"ᵏ","m":"ᵐ" };
const SUB_C = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
  "+":"₊","-":"₋","=":"₌","(":"₍",")":"₎","a":"ₐ","e":"ₑ","o":"ₒ","x":"ₓ","i":"ᵢ","n":"ₙ","r":"ᵣ","t":"ₜ","k":"ₖ","m":"ₘ","s":"ₛ","u":"ᵤ","v":"ᵥ" };
const LATEX_OPS = { times:"×", div:"÷", pm:"±", mp:"∓", cdot:"·", ast:"∗", le:"≤", leq:"≤", ge:"≥", geq:"≥",
  neq:"≠", ne:"≠", approx:"≈", sim:"∼", cong:"≅", equiv:"≡", propto:"∝", infty:"∞",
  pi:"π", alpha:"α", beta:"β", gamma:"γ", delta:"δ", Delta:"Δ", epsilon:"ε", zeta:"ζ", eta:"η",
  theta:"θ", lambda:"λ", mu:"μ", nu:"ν", xi:"ξ", rho:"ρ", sigma:"σ", Sigma:"Σ", tau:"τ", phi:"φ", Phi:"Φ",
  chi:"χ", psi:"ψ", omega:"ω", Omega:"Ω",
  sum:"∑", prod:"∏", int:"∫", oint:"∮", partial:"∂", nabla:"∇", sqrt:"√",
  in:"∈", ni:"∋", notin:"∉", subset:"⊂", supset:"⊃", subseteq:"⊆", supseteq:"⊇",
  cup:"∪", cap:"∩", emptyset:"∅", forall:"∀", exists:"∃", neg:"¬", land:"∧", lor:"∨",
  to:"→", gets:"←", rightarrow:"→", leftarrow:"←", Rightarrow:"⇒", Leftarrow:"⇐", mapsto:"↦",
  lfloor:"⌊", rfloor:"⌋", lceil:"⌈", rceil:"⌉", langle:"⟨", rangle:"⟩",
  log:"log", ln:"ln", lg:"lg", sin:"sin", cos:"cos", tan:"tan", cot:"cot", sec:"sec", csc:"csc",
  arcsin:"arcsin", arccos:"arccos", arctan:"arctan", exp:"exp", max:"max", min:"min", lim:"lim", deg:"°" };
const _sup = s => [...s].map(c => SUP_C[c] ?? ("^" + c)).join("");
const _sub = s => [...s].map(c => SUB_C[c] ?? ("_" + c)).join("");
function latexFix(t) {
  return t.split(/(`{1,3}[\s\S]*?`{1,3})/g).map((part, i) => {
    if (i % 2) return part;                 // keep code spans verbatim
    let s = part
      .replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, "")
      .replace(/\$([^$\n]+)\$/g, "$1")
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `(${a})⁄(${b})`)
      .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, (_, n, x) => _sup(n) + `√(${x})`)
      .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|boldsymbol?)\{([^{}]*)\}/g, "$1")
      .replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, "")
      .replace(/\^\{([^{}]*)\}/g, (_, g) => _sup(g))
      .replace(/\^([0-9a-zA-Z+\-=()ntkxbm])/g, (_, c) => _sup(c))
      .replace(/_\{([^{}]*)\}/g, (_, g) => _sub(g))
      .replace(/_([0-9aeoxinrkmsuv])/g, (_, c) => _sub(c))
      .replace(/\\([a-zA-Z]+)/g, (m, name) => LATEX_OPS[name] ?? name)
      .replace(/\\([%$&#_{}])/g, "$1")
      .replace(/\\[,;:!]/g, " ");
    return s;
  }).join("");
}

// minimal markdown renderer
function md(src) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let s = esc(latexFix(src));
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^######\s*(.+)$/gm, "<h6>$1</h6>")
       .replace(/^###\s*(.+)$/gm, "<h4>$1</h4>")
       .replace(/^##\s*(.+)$/gm, "<h3>$1</h3>")
       .replace(/^#\s*(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/((?:^\s*[-*]\s+.+\n?)+)/gm, m =>
    "<ul>" + m.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>") + "</ul>");
  s = s.replace(/((?:^\s*\d+[.)]\s+.+\n?)+)/gm, m =>
    "<ol>" + m.replace(/^\s*\d+[.)]\s+(.+)$/gm, "<li>$1</li>") + "</ol>");
  s = s.split(/(<\/?(?:ul|ol|pre|h[3-6]|li|p|code|b|blockquote|table|th|td|tr)[^>]*>)/).map(part => {
    if (part.startsWith("<")) return part;
    return part.split(/\n{2,}/).map(p => p.trim() ? `<p>${p.replace(/\n/g, "<br>")}</p>` : "").join("");
  }).join("");
  return s;
}

// ---------------- font scaling ----------------
function applyFont(px) {
  fontPx = Math.min(72, Math.max(14, px));
  document.documentElement.style.setProperty("--fs", fontPx + "px");
  localStorage.setItem(LS.font, String(fontPx));
  $("#fontPct").textContent = Math.round(fontPx / 20 * 100) + "%";
  $("#fontRange") && ($("#fontRange").value = fontPx);
  $("#vFontPx") && ($("#vFontPx").textContent = fontPx + "px");
}
$("#fontMinus").onclick = () => applyFont(fontPx - 2);
$("#fontPlus").onclick = () => applyFont(fontPx + 2);

// ---------------- fullscreen ----------------
const fsBtn = $("#btnFullscreen");
function fsActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function syncFsIcon() {
  const on = fsActive();
  fsBtn.querySelector(".ico-expand").classList.toggle("hidden", on);
  fsBtn.querySelector(".ico-compress").classList.toggle("hidden", !on);
  fsBtn.title = on ? "退出全屏" : "全屏";
  fsBtn.setAttribute("aria-label", fsBtn.title);
}
fsBtn.onclick = () => {
  const el = document.documentElement;
  if (fsActive()) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
};
["fullscreenchange", "webkitfullscreenchange"].forEach(ev =>
  document.addEventListener(ev, syncFsIcon));
syncFsIcon();

// ---------------- display prefs (gaze / align / contrast / latest) ----------------
const DISP_KEY = "examlink.disp";
let DISP = { align: "center", cw: 80, contrast: "std", latestOnly: false, gaze: "", dot: false, wake: true, fold: true, index: false, fsH: null, fsT: null, fsA: null, fsM: null, heroPos: "right", compHide: false };
try { Object.assign(DISP, JSON.parse(localStorage.getItem(DISP_KEY) || "{}")); } catch {}

const GAZE_PRESETS = {
  left:  { align: "right",  cw: 58 },
  front: { align: "center", cw: 80 },
  right: { align: "left",   cw: 58 },
  far:   { align: "center", cw: 88, latestOnly: true, font: 30 },
};

function saveDisp() { localStorage.setItem(DISP_KEY, JSON.stringify(DISP)); }
function applyDisp() {
  document.body.dataset.align = DISP.align;
  document.body.dataset.contrast = DISP.contrast;
  document.body.dataset.hero = DISP.heroPos || "right";
  document.body.classList.toggle("comp-hide", !!DISP.compHide);
  document.body.classList.toggle("latest-only", !!DISP.latestOnly);
  document.body.classList.toggle("idx-mode", !!DISP.index);
  if (DISP.index) markCurGroup();
  document.body.classList.toggle("dot-mode", !!DISP.dot);
  if (!DISP.dot) document.body.classList.remove("dot-open");
  const narrow = window.matchMedia("(max-width: 640px)").matches;
  $("#view-live").style.setProperty("--cw", (narrow ? Math.max(DISP.cw, 86) : DISP.cw) + "%");
  // settings sync
  document.querySelectorAll("#alignSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.align === DISP.align));
  document.querySelectorAll("#gazeSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.gaze === DISP.gaze));
  if ($("#widthRange")) { $("#widthRange").value = DISP.cw; $("#vWidth").textContent = DISP.cw + "%"; }
  if ($("#contrastSw")) $("#contrastSw").checked = DISP.contrast === "high";
  if ($("#latestSw")) $("#latestSw").checked = !!DISP.latestOnly;
  if ($("#dotSw")) $("#dotSw").checked = !!DISP.dot;
  if ($("#wakeSw")) $("#wakeSw").checked = !!DISP.wake;
  if ($("#foldSw")) $("#foldSw").checked = !!DISP.fold;
  if ($("#indexSw")) $("#indexSw").checked = !!DISP.index;
  document.querySelectorAll("#heroSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.hero === DISP.heroPos));
  // per-section font sizes; null = derived from the master --fs slider
  const vl = $("#view-live").style;
  const autoFs = { fsH: Math.round(fontPx * 1.45), fsT: 14, fsA: fontPx, fsM: 12 };
  [["fsH", "--fs-h", "fsHRange", "vFsH"], ["fsT", "--fs-t", "fsTRange", "vFsT"],
   ["fsA", "--fs-a", "fsARange", "vFsA"], ["fsM", "--fs-m", "fsMRange", "vFsM"]].forEach(([k, v, rid, oid]) => {
    const eff = DISP[k] || autoFs[k];
    if (DISP[k]) vl.setProperty(v, eff + "px"); else vl.removeProperty(v);
    if ($("#" + rid)) { $("#" + rid).value = eff; $("#" + oid).textContent = eff + "px"; }
  });
  syncDotFab();
  keepAwake();
  placeWdrag();
}
function setGaze(g) {
  const p = GAZE_PRESETS[g]; if (!p) return;
  DISP.gaze = g;
  DISP.align = p.align;
  DISP.cw = p.cw;
  if (p.latestOnly !== undefined) DISP.latestOnly = p.latestOnly;
  applyDisp(); saveDisp();
  if (p.font) applyFont(p.font);
}
document.querySelectorAll("#gazeSeg .seg-btn").forEach(b => b.onclick = () => setGaze(b.dataset.gaze));
document.querySelectorAll("#alignSeg .seg-btn").forEach(b => b.onclick = () => {
  DISP.align = b.dataset.align; DISP.gaze = ""; applyDisp(); saveDisp();
});
document.querySelectorAll("#heroSeg .seg-btn").forEach(b => b.onclick = () => {
  DISP.heroPos = b.dataset.hero; applyDisp(); saveDisp();
});
$("#widthRange")?.addEventListener("input", e => {
  DISP.cw = parseInt(e.target.value, 10); DISP.gaze = ""; applyDisp(); saveDisp();
});
$("#contrastSw")?.addEventListener("change", e => {
  DISP.contrast = e.target.checked ? "high" : "std"; applyDisp(); saveDisp();
});
$("#latestSw")?.addEventListener("change", e => {
  DISP.latestOnly = e.target.checked; applyDisp(); saveDisp();
});
$("#dotSw")?.addEventListener("change", e => {
  DISP.dot = e.target.checked; applyDisp(); saveDisp();
});
$("#wakeSw")?.addEventListener("change", e => {
  DISP.wake = e.target.checked; applyDisp(); saveDisp();
});
$("#foldSw")?.addEventListener("change", e => {
  DISP.fold = e.target.checked; applyDisp(); saveDisp();
});
$("#indexSw")?.addEventListener("change", e => {
  DISP.index = e.target.checked; applyDisp(); saveDisp();
});
// independent font-size sliders for title / answer / analysis / meta rows
[["fsHRange", "fsH"], ["fsTRange", "fsT"], ["fsARange", "fsA"], ["fsMRange", "fsM"]].forEach(([rid, k]) => {
  $("#" + rid)?.addEventListener("input", e => {
    DISP[k] = parseInt(e.target.value, 10); DISP.gaze = ""; applyDisp(); saveDisp();
  });
});

/* column width drag handle on the inner edge of the content column */
const wdrag = $("#wdrag");
const compTab = $("#compTab");
function placeWdrag() {
  if (!wdrag) return;
  const col = document.querySelector("#answers .ans") || document.querySelector(".composer .composer-box");
  const hide = view !== "live" || DISP.dot || !col || window.innerWidth < 700;
  wdrag.classList.toggle("hidden", hide);
  if (!hide) {
    const r = col.getBoundingClientRect();
    wdrag.style.left = ((DISP.align === "left" ? r.right : r.left) - 7) + "px";
    if (compTab) compTab.style.left = (r.left + r.width / 2) + "px";
  }
}
wdrag?.addEventListener("pointerdown", e => {
  e.preventDefault();
  const vw = window.innerWidth;
  const move = ev => {
    const x = ev.clientX;
    let pct;
    if (DISP.align === "left") pct = x / vw * 100;
    else if (DISP.align === "center") pct = Math.abs(vw / 2 - x) * 2 / vw * 100;
    else pct = (vw - x) / vw * 100;
    DISP.cw = Math.min(100, Math.max(30, Math.round(pct)));
    DISP.gaze = "";
    applyDisp();
  };
  const up = () => {
    saveDisp();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});

/* floating composer: fold button collapses it to a bottom tab;
   while collapsed, moving the mouse into the bottom strip peeks it back out */
let compPeeked = false, compPeekTimer = null;
$("#compFold")?.addEventListener("click", () => {
  DISP.compHide = true; compPeeked = false; clearTimeout(compPeekTimer); applyDisp(); saveDisp();
});
compTab?.addEventListener("click", () => {
  DISP.compHide = false; compPeeked = false; clearTimeout(compPeekTimer); applyDisp(); saveDisp();
});
document.addEventListener("mousemove", e => {
  if (!document.body.classList.contains("comp-hide")) return;
  if (e.clientY > window.innerHeight - 64) {
    document.body.classList.remove("comp-hide");
    compPeeked = true;
  }
});
document.addEventListener("mousemove", e => {
  if (!compPeeked || document.body.classList.contains("comp-hide")) return;
  if (e.clientY < window.innerHeight - 180) {
    clearTimeout(compPeekTimer);
    compPeekTimer = setTimeout(() => {
      compPeeked = false;
      if (DISP.compHide) document.body.classList.add("comp-hide");
    }, 1600);
  }
});

/* index mode: only the current (latest) question group shows full cards;
   earlier groups collapse to one-line answer index rows, click to expand */
function markCurGroup() {
  const cards = [...document.querySelectorAll("#answers .ans")];
  const cur = cards.length ? cards[cards.length - 1].dataset.qnum : null;
  cards.forEach(c => c.classList.toggle("cur-q", !!cur && c.dataset.qnum === cur));
}
document.addEventListener("click", e => {
  if (!DISP.index) return;
  const card = e.target.closest("#answers .ans:not(.cur-q)");
  if (card && !e.target.closest(".copy-btn, .shot-thumb, a, .detail-toggle"))
    card.classList.toggle("force-open");
});

// ---------------- minimal dot mode (QuiteWin-style) ----------------
let dotUnseen = 0;
function syncDotFab() {
  $("#dotFab").classList.toggle("hidden", !DISP.dot);
  $("#dotBadge").classList.toggle("hidden", !dotUnseen);
  $("#dotBadge").textContent = dotUnseen > 9 ? "9+" : dotUnseen;
}
$("#dotFab").onclick = () => {
  const open = !document.body.classList.contains("dot-open");
  document.body.classList.toggle("dot-open", open);
  if (open) { dotUnseen = 0; scrollFeed(); updateNavCtl(); }
  syncDotFab();
  $("#dotFab").setAttribute("aria-label", open ? "收起答案" : "展开答案");
};
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#lightbox").classList.contains("hidden"))
    $("#lightbox").classList.add("hidden");
  else if (document.body.classList.contains("dot-open"))
    $("#dotFab").click();
});
// dot-mode action row mirrors the composer's buttons
$("#dotCap")?.addEventListener("click", () => $("#btnCapture").click());
$("#dotSnap")?.addEventListener("click", () => $("#btnSnap").click());
$("#dotAbort")?.addEventListener("click", () => $("#btnAbort").click());
new MutationObserver(() =>
  $("#dotAbort")?.classList.toggle("hidden", $("#btnAbort").classList.contains("hidden"))
).observe($("#btnAbort"), { attributes: true, attributeFilter: ["class"] });

// ---------------- keep screen awake (PWA wake lock; no-op on insecure origins) ----------------
let wakeLock = null;
async function keepAwake() {
  if (!DISP.wake) { try { await wakeLock?.release?.(); } catch {} wakeLock = null; return; }
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible")
      wakeLock = await navigator.wakeLock.request("screen");
  } catch {}
}
document.addEventListener("visibilitychange", keepAwake);
wakeLock && wakeLock.addEventListener?.("release", () => { wakeLock = null; });

// ---------------- device hotkeys (this browser page) ----------------
const HK_KEY = "examlink.hk";
let HK = { solve: "", snap: "", prev: "ArrowUp", next: "ArrowDown", up: "PageUp", down: "PageDown" };
try { Object.assign(HK, JSON.parse(localStorage.getItem(HK_KEY) || "{}")); } catch {}

const HK_SLOTS = { solve: "hkSolveRec", snap: "hkSnapRec", prev: "hkPrevRec", next: "hkNextRec", up: "hkUpRec", down: "hkDownRec" };
const HK_LABELS = { "mouse:1": "鼠标中键", "mouse:3": "鼠标侧键X1", "mouse:4": "鼠标侧键X2" };
function hkLabel(code) {
  if (!code) return "未设置";
  if (HK_LABELS[code]) return HK_LABELS[code];
  if (code.startsWith("mouse:")) return "鼠标键 " + code.slice(6);
  return code.replace(/\+/g, " + ").replace(/Key|Digit/, m => m === "Key" ? "" : "");
}
function saveHK() { localStorage.setItem(HK_KEY, JSON.stringify(HK)); renderHK(); }
function renderHK() {
  for (const [k, id] of Object.entries(HK_SLOTS)) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains("listening")) el.textContent = hkLabel(HK[k]);
  }
}

let recording = null;
function startRec(which) {
  stopRec();
  recording = which;
  const el = document.getElementById(HK_SLOTS[which]);
  el.textContent = "按下按键或鼠标键… (Esc取消)";
  el.classList.add("listening");
  el.focus();
}
function stopRec() {
  if (!recording) return;
  recording = null;
  document.querySelectorAll(".hk-rec.listening").forEach(el => el.classList.remove("listening"));
  renderHK();
}
function comboOf(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("win");
  const c = e.code;
  if (["ControlLeft","ControlRight","AltLeft","AltRight","ShiftLeft","ShiftRight","MetaLeft","MetaRight"].includes(c)) return null;
  parts.push(c);
  return parts.join("+");
}
for (const [k, id] of Object.entries(HK_SLOTS)) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", () => recording === k ? stopRec() : startRec(k));
}
$("#hkClear").onclick = () => { HK = { solve: "", snap: "", prev: "", next: "", up: "", down: "" }; saveHK(); toast("本设备按键已清除"); };

function hkAction(code) {
  if (!code) return false;
  if (code === HK.solve) { $("#btnCapture").click(); return true; }
  if (code === HK.snap) { $("#btnSnap").click(); return true; }
  if (code === HK.prev) { navCard(-1); return true; }
  if (code === HK.next) { navCard(1); return true; }
  if (code === HK.up) { scrollPage(-1); return true; }
  if (code === HK.down) { scrollPage(1); return true; }
  return false;
}

window.addEventListener("keydown", (e) => {
  if (recording) {
    e.preventDefault();
    if (e.key === "Escape") { stopRec(); return; }
    const c = comboOf(e);
    if (c) { HK[recording] = c; saveHK(); stopRec(); }
    return;
  }
  if (view !== "live") return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
  const c = comboOf(e);
  if (c && hkAction(c)) e.preventDefault();
});
function onPointer(e) {
  const code = "mouse:" + e.button;
  if (recording) {
    e.preventDefault();
    HK[recording] = code; saveHK(); stopRec();
    return;
  }
  if (view !== "live") return;
  if (e.button === 0 || e.button === 2) return;
  if (hkAction(code)) { e.preventDefault(); e.stopPropagation(); }
}
window.addEventListener("pointerdown", onPointer, true);
window.addEventListener("auxclick", (e) => {
  if (HK["mouse:" + e.button] !== undefined && hkAction("mouse:" + e.button)) e.preventDefault();
}, true);
window.addEventListener("contextmenu", (e) => { if (recording) e.preventDefault(); }, true);

// ---------------- card navigation (prev/next question, page scroll) ----------------
function navCard(dir) {
  const cards = groupAnchors();
  if (!cards.length) return;
  const feed = $("#answers");
  const ft = feed.getBoundingClientRect().top + 10;
  let idx = cards.findIndex(c => c.getBoundingClientRect().bottom > ft);
  if (idx < 0) idx = cards.length - 1;
  idx = Math.min(cards.length - 1, Math.max(0, idx + dir));
  cards[idx].scrollIntoView({ behavior: "smooth", block: "start" });
}
/* first card of each question group (same-qnum cards collapse into one stop) */
function groupAnchors() {
  const seen = new Set(), anchors = [];
  document.querySelectorAll("#answers .ans").forEach(c => {
    const q = c.dataset.qnum;
    if (!q || !seen.has(q)) { if (q) seen.add(q); anchors.push(c); }
  });
  return anchors;
}
function scrollPage(dir) {
  const feed = $("#answers");
  feed.scrollBy({ top: dir * feed.clientHeight * 0.8, behavior: "smooth" });
}
$("#navPrev").onclick = () => navCard(-1);
$("#navNext").onclick = () => navCard(1);
function updateNavCtl() {
  $("#navCtl").classList.toggle("hidden", document.querySelectorAll("#answers .ans").length < 2);
}

// ---------------- router ----------------
function route() {
  const h = location.hash;
  view = h.startsWith("#/settings") ? "settings" : "live";
  $("#view-live").classList.toggle("hidden", view !== "live");
  $("#view-settings").classList.toggle("hidden", view !== "settings");
  if (view === "settings" && !previewLoaded) loadPreview();
  requestAnimationFrame(placeWdrag);
}
window.addEventListener("hashchange", route);
window.addEventListener("resize", applyDisp);

// ---------------- cards ----------------
function ensureFeed() {
  let f = $("#answers");
  if (!f.querySelector(".ans") && !f.querySelector(".empty-feed")) {
    f.innerHTML = `<div class="empty-feed"><div><div class="big">◈</div>截图或自动触发后，答案会显示在这里</div></div>`;
  }
}
function scrollFeed() { const f = $("#answers"); f.scrollTop = f.scrollHeight; }

let replaying = false;
function addCard({ id, image, trigger, tag, qnum }) {
  const feed = $("#answers");
  feed.querySelector(".empty-feed")?.remove();
  const div = document.createElement("div");
  div.className = "ans" + (tag === "err" ? " err-card" : ""); div.id = "card-" + id;
  if (qnum) div.dataset.qnum = qnum;
  const cls = tag === "错误" ? "err" : trigger === "auto" ? "auto" : trigger === "ask" ? "ask" : "shot";
  div.innerHTML = `<div class="ans-head"><span class="qchip hidden"></span><span class="tag ${cls}">${tag || trigger || ""}</span><span class="ans-status"></span><span class="ans-time">${fmtTime()}</span><button class="copy-btn" title="复制答案"><svg class="ico" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div><div class="md"></div>`;
  div.querySelector(".copy-btn").onclick = () => copyText(div.querySelector(".md").innerText);
  if (image) {
    const img = document.createElement("img");
    img.className = "shot-thumb"; img.src = image; img.loading = "lazy";
    img.onclick = () => openLightbox(image);
    div.querySelector(".ans-head").appendChild(img);
  }
  feed.appendChild(div);
  markCurGroup();
  if (DISP.dot && !replaying && !document.body.classList.contains("dot-open")) {
    dotUnseen++; syncDotFab();
    $("#dotFab").classList.add("pulse");
    setTimeout(() => $("#dotFab").classList.remove("pulse"), 1200);
  }
  updateQChips();
  updateNavCtl();
  scrollFeed();
  requestAnimationFrame(placeWdrag);
  return { el: div, md: div.querySelector(".md") };
}
function copyText(t) {
  if (!t || !t.trim()) { toast("没有可复制的内容"); return; }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(t).then(() => toast("已复制"), () => legacyCopy(t));
  } else legacyCopy(t);
}
function legacyCopy(t) {
  const ta = document.createElement("textarea");
  ta.value = t; ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast("已复制"); }
  catch { toast("复制失败，请长按文本手动复制"); }
  ta.remove();
}
/* 第N题 chip: shown only on the first card of each question group */
function updateQChips() {
  const seen = new Set();
  document.querySelectorAll("#answers .ans").forEach(c => {
    const chip = c.querySelector(".qchip");
    if (!chip) return;
    const q = c.dataset.qnum;
    if (q && !seen.has(q)) {
      seen.add(q);
      chip.textContent = "第 " + (c.dataset.qno || q) + " 题";
      chip.classList.remove("hidden");
    } else chip.classList.add("hidden");
  });
}
/* extract "**答案：X**" from finished text -> header chip + glanceable hero with collapsible reasoning */
function setAnsChipFromText(el, text) {
  const m = text && text.match(/答案[:：]\s*\**\s*([^\n*]{1,24})/);
  if (!m) return;
  const ans = m[1].trim().replace(/\*+$/, "");
  let chip = el.querySelector(".ans-ans");
  if (!chip) {
    chip = document.createElement("span"); chip.className = "ans-ans";
    el.querySelector(".ans-head").insertBefore(chip, el.querySelector(".ans-time"));
  }
  chip.textContent = "答案 " + ans;
  // hero already shows it — drop the duplicated "答案：X" lines from the body
  const bodyMd = el.querySelector(".md");
  if (bodyMd) {
    const stripped = (el._text || text).split("\n")
      .filter(l => !/^\s*[*_#>\-\s]*\*{0,2}(?:最终|最后|正确|参考)?答案(?:为|是)?\s*[:：]/.test(l))
      .join("\n");
    bodyMd.innerHTML = md(stripped);
  }
  /* current-question card row: [题号+关键词+截图] on one side, giant
     option letter on the other — side flippable via DISP.heroPos */
  let row = el.querySelector(".qrow");
  if (!row) {
    row = document.createElement("div"); row.className = "qrow";
    row.innerHTML = `<div class="qinfo"></div><div class="qbig"><span class="ql"></span><span class="qr"></span></div>`;
    const info = row.querySelector(".qinfo");
    const sub = el.querySelector(".ans-sub");
    if (sub) info.appendChild(sub);
    const thumb = el.querySelector(".shot-thumb");
    if (thumb) info.appendChild(thumb);
    const tog = document.createElement("button");
    tog.className = "detail-toggle"; tog.textContent = "解析 ▾";
    const flip = () => {
      const open = el.classList.toggle("detail-open");
      tog.textContent = open ? "收起解析 ▴" : "解析 ▾";
    };
    tog.onclick = flip;
    row.addEventListener("click", e => { if (!e.target.closest(".shot-thumb")) flip(); });
    el.insertBefore(row, el.querySelector(".md"));
    el.insertBefore(tog, el.querySelector(".md"));
    el.classList.add("has-hero");
    if (!DISP.fold) flip();   // user pref: reasoning expanded by default
  }
  const big = row.querySelector(".qbig");
  const lm = ans.match(/^([A-FＡ-Ｆ]{1,6})\s*(.*)$/);
  big.classList.toggle("text-ans", !lm);
  big.querySelector(".ql").textContent = lm ? lm[1] : ans;
  big.querySelector(".qr").textContent = lm ? lm[2] : "";
}
function cardById(id) {
  const el = document.getElementById("card-" + id);
  return el ? { el, md: el.querySelector(".md") } : null;
}
function setCardText(id, text, streaming) {
  const c = cardById(id); if (!c) return;
  c.md.innerHTML = md(text);
  c.el.classList.toggle("streaming", !!streaming);
  c.el.querySelector(".ans-status").textContent = streaming ? "作答中" : "";
  scrollFeed();
}
/* question title line: first meaningful line of the reply, for feed scanning */
function setCardTitle(el, text) {
  const lines = (text || "").split("\n").map(l =>
    l.replace(/^[#>*\-\s]+/, "").replace(/\*\*/g, "").trim()).filter(Boolean);
  const title = lines.find(l => !/^答案[:：]/.test(l));
  if (!title) return;
  // question number comes from the exam paper itself ("8. 审计某企业时…")
  const qm = title.match(/^(?:第\s*)?(\d{1,3})\s*[.、．)）\s题]/);
  if (qm) { el.dataset.qno = qm[1]; updateQChips(); }
  let sub = el.querySelector(".ans-sub");
  if (!sub) {
    sub = document.createElement("div"); sub.className = "ans-sub";
    el.querySelector(".ans-head").after(sub);
  }
  sub.textContent = title.slice(0, 34);
}
function finishCard(id) {
  const c = cardById(id); if (!c) return;
  c.el.classList.remove("streaming");
  c.el.querySelector(".ans-status").textContent = "";
  const txt = c.el._text || c.md.innerText;
  setCardTitle(c.el, txt);
  setAnsChipFromText(c.el, txt);
}
function errCard(id, msg) {
  const c = cardById(id) || addCard({ id: id || ("e" + Date.now()), image: null, trigger: "err", tag: "错误" });
  c.md.innerHTML = `<span style="color:var(--danger)">${md(msg)}</span>`;
  c.el.classList.remove("streaming");
  c.el.querySelector(".ans-status").textContent = "";
}

// ---------------- done flash + auto pill + live preview panel ----------------
function flashDone() {
  const f = $("#flashFx");
  f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
}
$("#autoPill").onclick = () =>
  send({ t: "set", patch: { auto: { enabled: !(state?.auto?.enabled) } } });
$("#liveBtn").onclick = () => {
  const p = $("#livePanel"), img = $("#liveImg");
  const open = p.classList.toggle("hidden");
  img.src = open ? "" : `/preview.mjpg?token=${encodeURIComponent(TOKEN_FINAL)}`;
};
$("#liveClose")?.addEventListener("click", () => $("#liveBtn").click());

function openLightbox(src) {
  $("#lightboxImg").src = src;
  $("#lightbox").classList.remove("hidden");
}
$("#lightboxClose").onclick = () => $("#lightbox").classList.add("hidden");
$("#lightbox").onclick = () => $("#lightbox").classList.add("hidden");

// ---------------- websocket ----------------
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(TOKEN_FINAL)}`);
  ws.onopen = () => setConn("on", "已连接");
  ws.onclose = () => { setConn("err", "已断开"); setTimeout(connect, 2000); };
  ws.onerror = () => setConn("err", "连接错误");
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    handle(m);
  };
}
function setConn(cls, txt) {
  const c = "conn-dot " + cls;
  $("#connDot").className = c;
  $("#connDot2").className = c;
  $("#connText").textContent = txt;
  $("#connBar").classList.toggle("hidden", cls === "on");
}

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
      $("#busyDot")?.classList.remove("hidden");
      $("#btnAbort")?.classList.remove("hidden");
      break;
    }
    case "done": finishCard(m.id); flashDone(); $("#busyDot")?.classList.add("hidden"); $("#btnAbort")?.classList.add("hidden"); break;
    case "error": toast(m.msg || "错误", 3500); if (m.id) errCard(m.id, m.msg); $("#busyDot")?.classList.add("hidden"); $("#btnAbort")?.classList.add("hidden"); break;
    case "status": if (m.stage === "idle") { $("#busyDot")?.classList.add("hidden"); $("#btnAbort")?.classList.add("hidden"); } break;
    case "ask_ack": {
      const card = addCard({ id: m.id, image: null, trigger: "ask", tag: "追问", qnum: m.qnum });
      card.el._text = "";
      setCardText(m.id, "⏳ 思考中…", true);
      $("#busyDot")?.classList.remove("hidden");
      $("#btnAbort")?.classList.remove("hidden");
      break;
    }
    case "nav": {
      if (m.action === "nav_next") navCard(1);
      else if (m.action === "nav_prev") navCard(-1);
      else if (m.action === "nav_down") scrollPage(1);
      else if (m.action === "nav_up") scrollPage(-1);
      break;
    }
    case "verify": {
      // dual-model cross-check result: chip on the card head
      const c = cardById(m.id); if (!c) break;
      let v = c.el.querySelector(".verify-chip");
      if (!v) {
        v = document.createElement("span"); v.className = "verify-chip";
        c.el.querySelector(".ans-head").insertBefore(v, c.el.querySelector(".ans-time"));
      }
      if (m.agree) { v.className = "verify-chip ok"; v.textContent = "✓ 双模型一致"; v.title = m.model || ""; }
      else { v.className = "verify-chip diff"; v.textContent = "⚠ 分歧→" + m.model + ": " + (m.alt || "?"); v.title = "两个模型答案不一致"; }
      break;
    }
    case "cleared": $("#answers").innerHTML = ""; ensureFeed(); updateNavCtl(); break;
    case "history": replayHistory(m.cards || []); break;
    case "bye": toast("服务已关闭"); break;
  }
}

// ---------------- capture ----------------
function replayHistory(cards) {
  replaying = true;
  for (const e of cards) {
    const isAsk = e.kind === "ask";
    const tag = isAsk ? "追问" : (e.trigger === "auto" ? "自动截图" : (e.ask ? "AI答题" : "截图"));
    const card = addCard({ id: e.id, image: e.thumb || null, trigger: isAsk ? "ask" : e.trigger, tag, qnum: e.qnum });
    card.el._text = e.answer || "";
    const fallback = isAsk ? (e.q ? "追问：" + e.q : "追问") : "（仅截图，未请求 AI）";
    setCardText(e.id, e.answer || fallback, false);
    if (e.error) card.el.classList.add("err-card");
    if (e.stopped && e.answer) card.md.innerHTML += '<div class="stopped-note">已停止（部分内容）</div>';
    if (e.answer) { setCardTitle(card.el, e.answer); setAnsChipFromText(card.el, e.answer); }
  }
  replaying = false;
  scrollFeed();
}

function onCapture(m) {
  window._lastB64 = b64Of(m.image);
  if (aiMode === "direct" && m.ask) {
    directAsk({ images: [window._lastB64], q: "", newConv: true, trigger: m.trigger, image: m.image });
  } else {
    const tag = m.trigger === "auto" ? "自动截图" : (m.ask ? "AI答题" : "截图");
    const card = addCard({ id: m.id, image: m.image, trigger: m.trigger, tag, qnum: m.qnum });
    card.el._text = "";
    if (!m.ask) { setCardText(m.id, "（仅截图，未请求 AI）", false); card.el.querySelector(".tag").textContent = "截图"; card.el.querySelector(".tag").className = "tag shot"; }
    if (m.ask && aiMode === "proxy") {
      setCardText(m.id, "⏳ 思考中…", true);
      $("#busyDot")?.classList.remove("hidden");
      $("#btnAbort")?.classList.remove("hidden");
    }
  }
}

// ---------------- direct mode ----------------
async function directChat({ messages, cardId, onText }) {
  const cfg = effectiveDirectCfg();
  if (!cfg.base_url || !cfg.model) {
    toast("直连模式未配置 Base URL/模型");
    errCard(cardId, "未配置模型：请在 设置 → AI 模型 → 直连 中填写");
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
    if (e.name !== "AbortError") { toast("直连请求失败: " + e.message, 3500); errCard(cardId, "请求失败: " + e.message); }
  } finally {
    abortCtrl = null;
    onText(full, false);
    $("#busyDot")?.classList.add("hidden");
    $("#btnAbort")?.classList.add("hidden");
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

function clientScenePrompt() {
  // mirror server resolve_prompt: custom_prompt > scene override > default
  if (state?.custom_prompt) return state.custom_prompt;
  const sid = state?.scene || "general";
  return (state?.scenes && state.scenes[sid]) || SCENES[sid] || SCENES.general;
}

function directAsk({ images, q, newConv, trigger, image }) {
  const cfg = effectiveDirectCfg();
  if (newConv) directHistory = [];
  const scene = clientScenePrompt();
  const msgs = [{ role: "system", content: scene }];
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
  $("#busyDot")?.classList.remove("hidden");
  $("#btnAbort")?.classList.remove("hidden");
  let lastFull = "";
  directChat({
    messages: msgs, cardId: id,
    onText: (full, streaming) => { lastFull = full; setCardText(id, full, streaming); },
  }).then(() => {
    directHistory.push(userMsg, { role: "assistant", content: lastFull });
    while (directHistory.length > 16) directHistory.splice(0, 2);
  });
}

// ---------------- state -> UI ----------------
function onState(s) {
  state = s;
  // auto pill
  const pill = $("#autoPill");
  const a = s.auto || {};
  pill.textContent = a.enabled ? "自动开" : "自动关";
  pill.className = "pill " + (a.enabled ? (s.busy ? "pill-busy" : "pill-on") : "pill-off");
  pill.title = "点击切换自动触发";
  pill.style.cursor = "pointer";
  // settings fields
  syncAutoUI(a);
  $("#autoEnabled").checked = !!a.enabled;
  syncMonitorUI(s);
  syncSceneUI(s);
  syncProxyUI(s);
  syncPromptUI(s);
  syncModeSeg();
  syncHotkeyUI(s);
  paintRanges();
}

/* keep webkit range-fill in sync: --fill % drives the colored track */
function paintRanges() {
  document.querySelectorAll('input[type=range]').forEach(el => {
    const min = +el.min || 0, max = +el.max || 100;
    el.style.setProperty('--fill', ((el.value - min) / (max - min) * 100) + '%');
  });
}
document.addEventListener('input', e => {
  if (e.target.matches('input[type=range]')) {
    const el = e.target, min = +el.min || 0, max = +el.max || 100;
    el.style.setProperty('--fill', ((el.value - min) / (max - min) * 100) + '%');
  }
});

function syncHotkeyUI(s) {
  const grid = $("#hkGrid");
  if (!grid || grid.contains(document.activeElement)) return;
  const order = ["capture", "snap", "nav_next", "nav_prev", "nav_down", "nav_up"];
  const actions = s.hotkey_actions || {};
  const choices = s.hotkey_choices || {};
  const items = Object.fromEntries(((s.hotkey || {}).items || []).map(i => [i.action, i.trigger]));
  grid.innerHTML = "";
  for (const a of order) {
    const lab = document.createElement("div");
    lab.className = "hk-act"; lab.textContent = actions[a] || a;
    const sel = document.createElement("select");
    sel.dataset.action = a;
    for (const [v, t] of Object.entries(choices)) {
      const o = document.createElement("option"); o.value = v; o.textContent = t;
      sel.appendChild(o);
    }
    sel.value = items[a] || "";
    sel.onchange = () => {
      const arr = [...grid.querySelectorAll("select")]
        .map(x => ({ action: x.dataset.action, trigger: x.value }))
        .filter(i => i.trigger);
      send({ t: "set", patch: { hotkey: { items: arr } } });
    };
    grid.append(lab, sel);
  }
  // image quality sliders
  if ($("#imgQuality") && document.activeElement !== $("#imgQuality")) {
    $("#imgQuality").value = s.jpeg_quality ?? 92;
    $("#vQuality").textContent = (s.jpeg_quality ?? 92) + "%";
  }
  if ($("#imgMaxDim") && document.activeElement !== $("#imgMaxDim")) {
    $("#imgMaxDim").value = s.max_image_dim ?? 3000;
    $("#vMaxDim").textContent = (s.max_image_dim ?? 3000) + "px";
  }
}

function syncAutoUI(a) {
  $("#autoThreshold").value = a.threshold ?? 5;
  $("#autoStable").value = (a.stable_ms ?? 1500) / 1000;
  $("#autoCooldown").value = a.cooldown_s ?? 3;
  $("#vThreshold").textContent = (a.threshold ?? 5).toFixed(1);
  $("#vStable").textContent = ((a.stable_ms ?? 1500) / 1000).toFixed(1) + "s";
  $("#vCooldown").textContent = (a.cooldown_s ?? 3) + "s";
}

function syncMonitorUI(s) {
  const ms = $("#monitorSel");
  const mons = s.monitors || [];
  if (ms.options.length !== mons.length + 1) {
    ms.innerHTML = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "自动（主屏）";
    ms.appendChild(o0);
    for (const m of mons) {
      const o = document.createElement("option");
      o.value = m.index;
      o.textContent = `显示器 ${m.index} (${m.width}×${m.height})${m.primary ? " · 主屏" : ""}`;
      ms.appendChild(o);
    }
  }
  ms.value = String(s.monitor ?? "");
  // roi badge + box (in settings preview)
  const roi = s.roi;
  $("#roiBadge").classList.toggle("hidden", !roi);
  $("#btnClearRoi").classList.toggle("hidden", !roi);
  const box = $("#roiBox");
  if (roi) {
    box.classList.remove("hidden");
    box.style.left = roi[0] * 100 + "%"; box.style.top = roi[1] * 100 + "%";
    box.style.width = (roi[2] - roi[0]) * 100 + "%"; box.style.height = (roi[3] - roi[1]) * 100 + "%";
  } else box.classList.add("hidden");
}

function syncSceneUI(s) {
  const ss = $("#sceneSel");
  if (!ss.options.length) {
    for (const [id] of Object.entries(s.scenes || SCENES)) {
      const o = document.createElement("option"); o.value = id;
      o.textContent = SCENE_LABELS[id] || id;
      ss.appendChild(o);
    }
  }
  ss.value = s.scene || "general";
  refreshScenePrompt();
}

function syncProxyUI(s) {
  $("#pProvider").value = (s.proxy && s.proxy.provider) || "custom";
  const ps = $("#pProfile");
  const profs = s.profiles || {};
  if (ps.options.length !== Object.keys(profs).length + 1) {
    ps.innerHTML = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "自定义 / 手动";
    ps.appendChild(o0);
    for (const [n, p] of Object.entries(profs)) {
      const o = document.createElement("option"); o.value = n;
      o.textContent = `${p.label} (${p.model})`;
      ps.appendChild(o);
    }
  }
  ps.value = s.active_profile || "";
  for (const [sel, cur] of [[$("#verifySel"), s.verify_profile], [$("#fallbackSel"), s.fallback_profile]]) {
    if (!sel) continue;
    if (sel.options.length !== Object.keys(profs).length + 1) {
      sel.innerHTML = "";
      const v0 = document.createElement("option"); v0.value = ""; v0.textContent = "关闭";
      sel.appendChild(v0);
      for (const [n, p] of Object.entries(profs)) {
        const o = document.createElement("option"); o.value = n;
        o.textContent = `${p.label} (${p.model})`;
        sel.appendChild(o);
      }
    }
    sel.value = cur || "";
  }
}

function syncPromptUI(s) {
  $("#customPrompt").value = s.custom_prompt || "";
  $("#promptBadge").classList.toggle("hidden", !(s.custom_prompt || (s.scene_overrides || []).length));
  if ($("#kbText") && document.activeElement !== $("#kbText")) {
    $("#kbText").value = s.knowledge || "";
    const kf = s.knowledge_file || {};
    $("#kbFileInfo").textContent = kf.exists
      ? `已加载 knowledge.md（${kf.chars} 字），与下方内容合并注入`
      : "可在考试机创建 knowledge.md 存放更大知识库";
    $("#kbBadge").classList.toggle("hidden", !(s.knowledge || kf.exists));
  }
  if ($("#kbAutoSw")) $("#kbAutoSw").checked = !!s.kb_auto_append;
}

function refreshScenePrompt() {
  const sid = $("#sceneSel").value || "general";
  const prompt = (state?.scenes && state.scenes[sid]) || SCENES[sid] || "";
  $("#scenePrompt").value = prompt;
}

function syncModeSeg() {
  document.querySelectorAll("#modeSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === aiMode));
  $("#proxyCfg")?.classList.toggle("hidden", aiMode !== "proxy");
  $("#directCfg")?.classList.toggle("hidden", aiMode !== "direct");
}

// ---------------- preview / ROI (settings view) ----------------
function loadPreview() {
  previewLoaded = true;
  const img = $("#preview");
  if (img && !img.src.includes("preview.mjpg")) {
    img.src = `/preview.mjpg?token=${encodeURIComponent(TOKEN_FINAL)}`;
  }
}

const wrap = $("#settingsPreviewWrap");
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

// ---------------- live view events ----------------
$("#btnCapture").onclick = () => { send({ t: "capture", ask: true }); };
$("#btnSnap").onclick = () => { send({ t: "capture", ask: false }); };
$("#btnAsk").onclick = doAsk;
$("#askInput").addEventListener("keydown", e => { if (e.key === "Enter") doAsk(); });
$("#btnAbort").onclick = () => {
  if (aiMode === "direct" && abortCtrl) { abortCtrl.abort(); return; }
  send({ t: "abort" });
};

function doAsk() {
  const q = $("#askInput").value.trim();
  if (!q) return;
  $("#askInput").value = "";
  if (aiMode === "direct") {
    directAsk({ images: window._lastB64 ? [window._lastB64] : [], q, newConv: false });
  } else {
    send({ t: "ask", q, new: false });
    $("#busyDot")?.classList.remove("hidden");
    $("#btnAbort")?.classList.remove("hidden");
  }
}

// ---------------- settings view events ----------------
$("#btnRoi").onclick = () => { roiSelecting = true; $("#roiHint").classList.remove("hidden"); toast("在画面上拖动框选"); };
$("#btnClearRoi").onclick = () => send({ t: "set", patch: { roi: null } });
$("#autoEnabled").onchange = (e) => {
  send({ t: "set", patch: { auto: { enabled: e.target.checked } } });
  $("#autoPill").textContent = e.target.checked ? "自动开" : "自动关";
  $("#autoPill").className = "pill " + (e.target.checked ? "pill-on" : "pill-off");
};
function bindAuto(id, key) {
  $(id).addEventListener("input", syncAutoLabels);
  $(id).addEventListener("change", () => {
    let v = parseFloat($(id).value);
    if (key === "stable_ms") v = Math.round(v * 1000);
    send({ t: "set", patch: { auto: { [key]: v } } });
  });
}
function syncAutoLabels() {
  $("#vThreshold").textContent = parseFloat($("#autoThreshold").value).toFixed(1);
  $("#vStable").textContent = parseFloat($("#autoStable").value).toFixed(1) + "s";
  $("#vCooldown").textContent = $("#autoCooldown").value + "s";
}
bindAuto("#autoThreshold", "threshold");
bindAuto("#autoStable", "stable_ms");
bindAuto("#autoCooldown", "cooldown_s");
$("#monitorSel").onchange = (e) => send({ t: "set", patch: { monitor: e.target.value === "" ? null : parseInt(e.target.value) } });
$("#sceneSel").onchange = (e) => { send({ t: "set", patch: { scene: e.target.value } }); refreshScenePrompt(); };
$("#fontRange").addEventListener("input", (e) => applyFont(parseInt(e.target.value, 10)));
document.querySelectorAll(".font-preset").forEach(b => b.onclick = () => applyFont(parseInt(b.dataset.px, 10)));

$("#modeSeg").addEventListener("click", (e) => {
  const b = e.target.closest(".seg-btn"); if (!b) return;
  aiMode = b.dataset.mode;
  localStorage.setItem(LS.mode, aiMode);
  syncModeSeg();
});

$("#btnSavePrompt").onclick = () => {
  const sid = $("#sceneSel").value || "general";
  const sceneText = $("#scenePrompt").value.trim();
  const custom = $("#customPrompt").value.trim();
  send({ t: "set", patch: { custom_prompt: custom, scenes: { [sid]: sceneText } } });
  toast("提示词已保存");
};
$("#btnResetPrompt").onclick = () => {
  const sid = $("#sceneSel").value || "general";
  send({ t: "set", patch: { scenes: { [sid]: "" } } });
  toast("已恢复该场景默认提示词");
};
$("#btnSaveKb")?.addEventListener("click", () => {
  send({ t: "set", patch: { knowledge: $("#kbText").value.trim() } });
  toast("知识库已保存");
});
$("#kbAutoSw")?.addEventListener("change", e => {
  send({ t: "set", patch: { kb_auto_append: e.target.checked } });
  toast(e.target.checked ? "答过的题将自动收录进 knowledge.md" : "已关闭自动收录");
});
$("#verifySel")?.addEventListener("change", e => {
  send({ t: "set", patch: { verify_profile: e.target.value } });
  toast(e.target.value ? "双模型校验已开启" : "双模型校验已关闭");
});
$("#fallbackSel")?.addEventListener("change", e => {
  send({ t: "set", patch: { fallback_profile: e.target.value } });
  toast(e.target.value ? "兜底模型已设置" : "兜底模型已关闭");
});

$("#btnSaveCfg").onclick = saveCfg;
$("#btnClearChat").onclick = () => {
  $("#answers").innerHTML = ""; directHistory = []; ensureFeed();
  send({ t: "clear" }); toast("记录已清空");
};
$("#btnShutdown").onclick = () => {
  if (confirm("确定关闭 examlink 服务？需回电脑重新运行 main.py。")) send({ t: "shutdown" });
};
$("#btnModels").onclick = fetchModels;
$("#modelList").onclick = (e) => { if (e.target.dataset.model) $("#pModel").value = e.target.dataset.model; };
$("#pProfile").onchange = (e) => { if (e.target.value) send({ t: "set", patch: { profile: e.target.value } }); };
["#pBase", "#pKey", "#pModel", "#pProvider"].forEach(sel =>
  $(sel).addEventListener("input", () => { $("#pProfile").value = ""; }));

function saveCfg() {
  const prof = $("#pProfile").value;
  const patch = { scene: $("#sceneSel").value, ai_mode: aiMode };
  if (prof) {
    patch.profile = prof;
  } else {
    patch.proxy = {
      provider: $("#pProvider").value,
      base_url: $("#pBase").value.trim(),
      api_key: $("#pKey").value.trim(),
      model: $("#pModel").value.trim(),
    };
  }
  send({ t: "set", patch });
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

// provider selects + direct cfg init
function fillProviderSelect(sel) {
  sel.innerHTML = "";
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const o = document.createElement("option"); o.value = id; o.textContent = p.name || id;
    sel.appendChild(o);
  }
}
function onProvChange(sel, baseInp, modelInp) {
  sel.addEventListener("change", () => {
    const p = PROVIDERS[sel.value];
    if (p && p.base_url && !baseInp.value) baseInp.value = p.base_url;
    if (p && p.models && p.models.length && !modelInp.value) modelInp.value = p.models[0];
  });
}
fillProviderSelect($("#pProvider"));
fillProviderSelect($("#dProvider"));
onProvChange($("#pProvider"), $("#pBase"), $("#pModel"));
onProvChange($("#dProvider"), $("#dBase"), $("#dModel"));
(function initDirect() {
  $("#dProvider").value = directCfg.provider || "doubao";
  $("#dBase").value = directCfg.base_url || "";
  $("#dKey").value = directCfg.api_key || "";
  $("#dModel").value = directCfg.model || "";
  const p = PROVIDERS[$("#dProvider").value];
  if (p && !$("#dBase").value) $("#dBase").value = p.base_url;
  if (p && p.models && p.models[0] && !$("#dModel").value) $("#dModel").value = p.models[0];
})();

$("#imgQuality")?.addEventListener("input", () => $("#vQuality").textContent = $("#imgQuality").value + "%");
$("#imgQuality")?.addEventListener("change", () =>
  send({ t: "set", patch: { jpeg_quality: parseInt($("#imgQuality").value, 10) } }));
$("#imgMaxDim")?.addEventListener("input", () => $("#vMaxDim").textContent = $("#imgMaxDim").value + "px");
$("#imgMaxDim")?.addEventListener("change", () =>
  send({ t: "set", patch: { max_image_dim: parseInt($("#imgMaxDim").value, 10) } }));

// ---------------- boot ----------------
applyFont(fontPx);
applyDisp();
paintRanges();
renderHK();
ensureFeed();
route();
if (!TOKEN_FINAL) toast("URL 缺少 token，请从电脑上显示的链接打开", 4000);
connect();
keepAwake();
// PWA: installable app shell (silent no-op on http LAN where SW is unavailable)
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
