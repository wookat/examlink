/* examlink extension — service worker.
 * Hub between the side panel and content scripts on AI web pages.
 * Panel sends {kind:'solve', ...}; we fetch the screenshot, ensure the
 * AI tab exists, forward the ask to the content script, and relay
 * streamed answer chunks back to every panel/page context. */

const AI_SITES = {
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/", match: /chatgpt\.com|chat\.openai\.com/ },
  doubao: { name: "豆包", url: "https://www.doubao.com/chat/", match: /doubao\.com/ },
  gemini: { name: "Gemini", url: "https://gemini.google.com/app", match: /gemini\.google\.com/ },
  deepseek: { name: "DeepSeek", url: "https://chat.deepseek.com/", match: /chat\.deepseek\.com/ },
  kimi: { name: "Kimi", url: "https://www.kimi.com/", match: /kimi\.(moonshot\.cn|com)/ },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// global shortcuts (chrome://extensions/shortcuts to customize)
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "open-panel") {
    chrome.sidePanel.open({}).catch(() => {});
    return;
  }
  if (cmd === "solve-now") {
    const r = await chrome.storage.local.get("examlinkPanel");
    const CFG = r.examlinkPanel;
    if (!CFG) { reply({ status: "error", text: "请先打开侧边栏完成设置" }); return; }
    const source = CFG.src === "examlink"
      ? { type: "examlink", base: CFG.exBase, token: CFG.exToken, roi: CFG.exRoi }
      : { type: "tab" };
    solve({ source, site: CFG.site, prompt: CFG.prompt, focusTab: CFG.focusTab, newChat: CFG.newChat })
      .catch((e) => reply({ status: "error", text: String(e.message || e) }));
  }
});

// ---------------- message hub ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.kind) return;

  // ---- from panel ----
  if (msg.kind === "solve") {
    solve(msg).catch((e) => reply({ status: "error", text: String(e.message || e) }));
    sendResponse({ ok: true });
    return false;
  }
  if (msg.kind === "openSite") {
    ensureAiTab(msg.site, true).then((t) => sendResponse({ ok: !!t }));
    return true;
  }
  if (msg.kind === "testExamlink") {
    testExamlink(msg.base, msg.token).then(sendResponse);
    return true;
  }
  if (msg.kind === "previewFrame") {
    fetchFrame(msg.base, msg.token, msg.roi).then((d) => sendResponse(d)).catch((e) => sendResponse({ error: String(e.message || e) }));
    return true;
  }

  // ---- from content script: relay to all extension contexts (panel) ----
  if (msg.kind === "reply" || msg.kind === "attach") {
    msg._site = msg._site || siteOfUrl(sender.tab && sender.tab.url);
    forwardToPanels(msg);
    return false;
  }
});

function forwardToPanels(msg) {
  // broadcast to extension pages (side panel, popup window)
  chrome.runtime.sendMessage({ ...msg, _relay: true }).catch(() => {});
}

function reply(payload) { forwardToPanels({ kind: "reply", ...payload }); }

function siteOfUrl(url) {
  if (!url) return null;
  for (const [id, s] of Object.entries(AI_SITES)) if (s.match.test(url)) return id;
  return null;
}

// ---------------- solve pipeline ----------------
async function solve(msg) {
  let image = null;
  if (msg.source) {
    reply({ status: "stage", stage: "capture", text: "正在截图…" });
    image = await getImage(msg.source);
    reply({ status: "captured", image });
  }

  const site = AI_SITES[msg.site] ? msg.site : "doubao";
  reply({ status: "stage", stage: "tab", text: `正在打开 ${AI_SITES[site].name}…` });
  const tab = await ensureAiTab(site, msg.focusTab !== false);
  if (!tab) throw new Error("无法打开 AI 页面");

  await waitTabReady(tab.id);
  await pingContent(tab.id); // injects if needed

  reply({ status: "stage", stage: "ask", text: "已投递，等待回答…" });
  chrome.tabs.sendMessage(tab.id, {
    kind: "examlink:ask",
    image,
    text: msg.prompt || "",
    newChat: !!msg.newChat,
    reqId: msg.reqId || String(Date.now()),
  }).catch((e) => reply({ status: "error", text: "内容脚本投递失败：" + e.message }));
}

async function getImage(source) {
  if (!source || source.type === "tab") {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    const dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: "jpeg", quality: 85 });
    return dataUrl; // full data:image/... url
  }
  if (source.type === "examlink") {
    const r = await fetchFrame(source.base, source.token, source.roi);
    if (r.error) throw new Error("examlink 截图失败：" + r.error);
    return r.image;
  }
  throw new Error("未知截图来源");
}

async function fetchFrame(base, token, roi) {
  const u = `${(base || "").replace(/\/$/, "")}/api/frame.jpg?token=${encodeURIComponent(token || "")}${roi ? "&roi=1" : ""}`;
  const resp = await fetch(u, { cache: "no-store" });
  if (!resp.ok) return { error: "HTTP " + resp.status };
  const buf = await resp.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { image: "data:image/jpeg;base64," + b64 };
}

async function testExamlink(base, token) {
  try {
    const u = `${(base || "").replace(/\/$/, "")}/api/state?token=${encodeURIComponent(token || "")}`;
    const resp = await fetch(u, { cache: "no-store" });
    if (!resp.ok) return { ok: false, error: "HTTP " + resp.status };
    const j = await resp.json();
    return { ok: true, state: { monitors: j.monitors, scene: j.scene, auto: j.auto } };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// ---------------- AI tab management ----------------
async function ensureAiTab(site, focus) {
  const s = AI_SITES[site];
  const tabs = await chrome.tabs.query({});
  const found = tabs.find((t) => t.url && s.match.test(t.url));
  if (found) {
    if (focus) {
      await chrome.tabs.update(found.id, { active: true });
      await chrome.windows.update(found.windowId, { focused: true });
    }
    return found;
  }
  return await chrome.tabs.create({ url: s.url, active: focus });
}

function waitTabReady(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (t) => {
      if (t && t.status === "complete") return resolve();
      const onUpd = (id, info) => {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpd);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(onUpd);
      setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpd); resolve(); }, 15000);
    });
  });
}

async function pingContent(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { kind: "examlink:ping" });
    if (r && r.ok) return true;
  } catch {}
  // not injected (tab opened before install / script missed) — inject now
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content/inject.js"] });
  await new Promise((r) => setTimeout(r, 300));
  const r = await chrome.tabs.sendMessage(tabId, { kind: "examlink:ping" }).catch(() => null);
  if (!r || !r.ok) throw new Error("内容脚本注入失败，请刷新 AI 页面");
  return true;
}
