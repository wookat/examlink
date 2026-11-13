/* examlink panel — side panel / popup window logic. */
"use strict";
const $ = (s) => document.querySelector(s);

const DEFAULT_PROMPT = "你是一个答题助手。仔细看截图中的题目，直接给出准确、简洁的答案。选择题给出选项和理由，编程题给出思路和代码，简答题给出要点。不要寒暄。";
const SITES = [
  { id: "doubao", name: "豆包" },
  { id: "chatgpt", name: "ChatGPT" },
  { id: "gemini", name: "Gemini" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "kimi", name: "Kimi" },
];

let CFG = {
  src: "examlink", exBase: "", exToken: "", exRoi: true,
  site: "doubao", focusTab: true, newChat: false,
  prompt: DEFAULT_PROMPT, fontpx: 18,
};
let curCard = null, reqId = 0;

/* ---------------- storage ---------------- */
function save() { chrome.storage.local.set({ examlinkPanel: CFG }); }
chrome.storage.local.get("examlinkPanel", (r) => {
  if (r.examlinkPanel) CFG = { ...CFG, ...r.examlinkPanel };
  initUI();
});

/* ---------------- ui init ---------------- */
function initUI() {
  // source seg
  document.querySelectorAll("#srcSeg .seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.src === CFG.src);
    b.onclick = () => { CFG.src = b.dataset.src; syncSrc(); save(); };
  });
  syncSrc();
  $("#exBase").value = CFG.exBase; $("#exToken").value = CFG.exToken; $("#exRoi").checked = CFG.exRoi;
  $("#exBase").oninput = () => { CFG.exBase = $("#exBase").value.trim(); save(); };
  $("#exToken").oninput = () => { CFG.exToken = $("#exToken").value.trim(); save(); };
  $("#exRoi").onchange = (e) => { CFG.exRoi = e.target.checked; save(); };

  // site grid
  const grid = $("#siteGrid");
  for (const s of SITES) {
    const d = document.createElement("div");
    d.className = "site-opt" + (s.id === CFG.site ? " active" : "");
    d.textContent = s.name; d.dataset.site = s.id;
    d.onclick = () => {
      CFG.site = s.id; save();
      grid.querySelectorAll(".site-opt").forEach((x) => x.classList.toggle("active", x.dataset.site === s.id));
      updateSiteTag();
    };
    grid.appendChild(d);
  }
  updateSiteTag();
  $("#focusTab").checked = CFG.focusTab; $("#focusTab").onchange = (e) => { CFG.focusTab = e.target.checked; save(); };
  $("#newChat").checked = CFG.newChat; $("#newChat").onchange = (e) => { CFG.newChat = e.target.checked; save(); };

  $("#prompt").value = CFG.prompt;
  $("#prompt").oninput = () => { CFG.prompt = $("#prompt").value; save(); };
  $("#btnPromptReset").onclick = () => { $("#prompt").value = DEFAULT_PROMPT; CFG.prompt = DEFAULT_PROMPT; save(); };

  applyFont(CFG.fontpx);
  $("#fontRange").value = CFG.fontpx;

  if (new URLSearchParams(location.search).get("pop")) $("#btnPop").classList.add("hidden");
}

function syncSrc() {
  document.querySelectorAll("#srcSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.src === CFG.src));
  $("#srcExamlink").classList.toggle("hidden", CFG.src !== "examlink");
  $("#srcTab").classList.toggle("hidden", CFG.src !== "tab");
}
function updateSiteTag() {
  $("#siteTag").textContent = (SITES.find((s) => s.id === CFG.site) || {}).name || "";
}

/* ---------------- font ---------------- */
function applyFont(px) {
  CFG.fontpx = Math.min(40, Math.max(14, px)); save();
  document.documentElement.style.setProperty("--fs", CFG.fontpx + "px");
  $("#fontPct").textContent = Math.round(CFG.fontpx / 18 * 100) + "%";
  $("#fontRange").value = CFG.fontpx;
}
$("#fontMinus").onclick = () => applyFont(CFG.fontpx - 2);
$("#fontPlus").onclick = () => applyFont(CFG.fontpx + 2);
$("#fontRange").addEventListener("input", (e) => applyFont(parseInt(e.target.value, 10)));
document.querySelectorAll(".fp").forEach((b) => (b.onclick = () => applyFont(parseInt(b.dataset.px, 10))));

/* ---------------- settings toggle / pop-out ---------------- */
$("#btnCfg").onclick = () => $("#cfg").classList.toggle("hidden");
$("#btnPop").onclick = () => {
  chrome.windows.create({ url: chrome.runtime.getURL("panel/panel.html?pop=1"), type: "popup", width: 560, height: 800 });
};

/* ---------------- test / preview ---------------- */
$("#btnTest").onclick = () => {
  toast("连接中…");
  chrome.runtime.sendMessage({ kind: "testExamlink", base: CFG.exBase, token: CFG.exToken }, (r) => {
    $("#connDot").className = "conn-dot " + (r && r.ok ? "on" : "err");
    toast(r && r.ok ? `已连接 · ${r.state.monitors.length} 个显示器` : "连接失败：" + ((r && r.error) || "无响应"), 3000);
  });
};
$("#btnPeek").onclick = () => {
  chrome.runtime.sendMessage({ kind: "previewFrame", base: CFG.exBase, token: CFG.exToken, roi: CFG.exRoi }, (r) => {
    if (r && r.image) { $("#peekImg").src = r.image; $("#peekWrap").classList.remove("hidden"); }
    else toast("预览失败：" + ((r && r.error) || "无响应"));
  });
};

/* ---------------- solve ---------------- */
$("#btnSolve").onclick = () => {
  const source = CFG.src === "examlink"
    ? { type: "examlink", base: CFG.exBase, token: CFG.exToken, roi: CFG.exRoi }
    : { type: "tab" };
  if (CFG.src === "examlink" && (!CFG.exBase || !CFG.exToken)) {
    toast("请先填写 examlink 服务地址和 Token"); $("#cfg").classList.remove("hidden"); return;
  }
  reqId++;
  chrome.runtime.sendMessage({
    kind: "solve", reqId: String(reqId),
    source, site: CFG.site, prompt: CFG.prompt,
    focusTab: CFG.focusTab, newChat: CFG.newChat,
  });
};

$("#btnAsk").onclick = doAsk;
$("#askInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doAsk(); });
function doAsk() {
  const q = $("#askInput").value.trim();
  if (!q) return;
  $("#askInput").value = "";
  reqId++;
  chrome.runtime.sendMessage({
    kind: "solve", reqId: String(reqId), source: null,
    site: CFG.site, prompt: q, focusTab: false,
  });
}

/* ---------------- replies from background ---------------- */
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.kind !== "reply" || !msg._relay) return;
  handle(msg);
});

function handle(m) {
  if (m.reqId && m.reqId !== String(reqId) && m.status !== "stage") return;
  switch (m.status) {
    case "stage": sysNote(m.text); break;
    case "captured": {
      curCard = addCard(m._site || CFG.site, m.image);
      curCard._text = "";
      setText(curCard, "⏳ 思考中…", true);
      break;
    }
    case "warn": sysNote("⚠ " + m.text); break;
    case "streaming": {
      if (!curCard) curCard = addCard(m._site || CFG.site, null);
      setText(curCard, m.text, true);
      break;
    }
    case "done": {
      if (!curCard) curCard = addCard(m._site || CFG.site, null);
      setText(curCard, m.text, false);
      curCard = null;
      break;
    }
    case "error": {
      const c = curCard || addCard("sys", null);
      c.el.classList.add("err-card");
      c.el.querySelector(".tag").className = "tag err";
      c.el.querySelector(".tag").textContent = "错误";
      setText(c, m.text, false);
      curCard = null;
      $("#connDot").className = "conn-dot err";
      break;
    }
  }
}

/* ---------------- cards ---------------- */
function addCard(site, image) {
  const feed = $("#feed");
  feed.querySelector(".empty-feed")?.remove();
  const div = document.createElement("div");
  div.className = "ans";
  const name = (SITES.find((s) => s.id === site) || {}).name || site || "系统";
  div.innerHTML = `<div class="ans-head"><span class="tag ${site || "sys"}">${name}</span><span class="ans-time">${fmtTime()}</span></div><div class="md"></div>`;
  if (image) {
    const img = document.createElement("img");
    img.className = "shot-thumb"; img.src = image;
    img.onclick = () => { $("#lightboxImg").src = image; $("#lightbox").classList.remove("hidden"); };
    div.querySelector(".ans-head").appendChild(img);
  }
  feed.appendChild(div);
  scroll();
  return { el: div, md: div.querySelector(".md") };
}
function setText(c, text, streaming) {
  c.md.innerHTML = md(text);
  c.el.classList.toggle("streaming", !!streaming);
  scroll();
}
function sysNote(t) {
  const d = document.createElement("div");
  d.className = "sys-note"; d.textContent = t;
  $("#feed").appendChild(d); scroll();
}
function scroll() { const f = $("#feed"); f.scrollTop = f.scrollHeight; }
function fmtTime() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

$("#lightboxClose").onclick = () => $("#lightbox").classList.add("hidden");
$("#lightbox").onclick = (e) => { if (e.target.id === "lightbox") $("#lightbox").classList.add("hidden"); };

function toast(msg, ms = 2400) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------------- minimal markdown ---------------- */
function md(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let s = esc(src);
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^######\s*(.+)$/gm, "<h6>$1</h6>").replace(/^###\s*(.+)$/gm, "<h4>$1</h4>").replace(/^##\s*(.+)$/gm, "<h3>$1</h3>").replace(/^#\s*(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/((?:^\s*[-*]\s+.+\n?)+)/gm, (m) => "<ul>" + m.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>") + "</ul>");
  s = s.replace(/((?:^\s*\d+[.)]\s+.+\n?)+)/gm, (m) => "<ol>" + m.replace(/^\s*\d+[.)]\s+(.+)$/gm, "<li>$1</li>") + "</ol>");
  s = s.split(/(<\/?(?:ul|ol|pre|h[3-6]|li|p|code|b)[^>]*>)/).map((part) =>
    part.startsWith("<") ? part : part.split(/\n{2,}/).map((p) => (p.trim() ? `<p>${p.replace(/\n/g, "<br>")}</p>` : "")).join("")
  ).join("");
  return s;
}
