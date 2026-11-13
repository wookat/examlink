/* examlink content script — drives an already-open AI chat web page.
 * Receives {kind:'examlink:ask', image(dataURL), text, reqId, newChat}
 * → attaches the screenshot, types the prompt, submits, then watches the
 * response and streams text back via chrome.runtime.sendMessage({kind:'reply'}).
 *
 * Site adapters are best-effort selectors; web UIs change often, so every
 * adapter has generic fallbacks. Update the ADAPTERS map when a site breaks.
 */
(() => {
  if (window.__examlinkInjected) return;
  window.__examlinkInjected = true;

  const host = location.hostname;
  const SITE =
    /chatgpt|openai/.test(host) ? "chatgpt" :
    /doubao/.test(host) ? "doubao" :
    /gemini/.test(host) ? "gemini" :
    /deepseek/.test(host) ? "deepseek" :
    /kimi/.test(host) ? "kimi" : "generic";

  /* -------- per-site selector adapters (update when sites change) -------- */
  const ADAPTERS = {
    chatgpt: {
      editor: ["#prompt-textarea", "div[contenteditable='true']", "textarea"],
      sendBtn: ["button[data-testid='send-button']", "button[aria-label*='Send']", "button[aria-label*='发送']"],
      fileInput: ["input[type='file']"],
      answers: ["article[data-testid^='conversation-turn'] .markdown", "div.markdown"],
      stopBtn: ["button[data-testid*='stop']", "button[aria-label*='Stop']"],
      attachMarker: ["img[alt*='Uploaded']", "div[role='listitem'] img"],
    },
    doubao: {
      editor: ["textarea[data-testid='chat_input_input']", "textarea[placeholder*='发消息']", "textarea"],
      sendBtn: ["button[data-testid='chat_input_send_button']", "button[aria-label*='发送']"],
      fileInput: ["input[type='file']"],
      answers: ["[class*='receive-message'] [class*='markdown']", "[class*='message-content'] [class*='markdown']", "div[class*='markdown']"],
      stopBtn: ["button[data-testid*='stop']", "[class*='stop-button']"],
      attachMarker: ["[class*='upload'] img", "[class*='image-list'] img", "[class*='attachment']"],
    },
    gemini: {
      editor: [".ql-editor[contenteditable='true']", "rich-textarea div[contenteditable='true']", "div[contenteditable='true']"],
      sendBtn: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button.send-button"],
      fileInput: ["input[type='file']"],
      answers: ["model-response .markdown", "message-content .markdown", ".response-container .markdown"],
      stopBtn: ["button[aria-label*='Stop']", "button[aria-label*='停止']"],
      attachMarker: ["img.preview-image", "[class*='attachment'] img"],
    },
    deepseek: {
      editor: ["#chat-input", "textarea[placeholder*='给 DeepSeek 发送消息']", "textarea"],
      sendBtn: ["div[role='button'][aria-label*='发送']", "button.ds-icon-button"],
      fileInput: ["input[type='file']"],
      answers: [".ds-markdown", ".markdown", "[class*='message'] [class*='markdown']"],
      stopBtn: ["[class*='stop']", "button[aria-label*='Stop']"],
      attachMarker: ["[class*='file-list']", "[class*='attachment']"],
    },
    kimi: {
      editor: ["[data-testid='msh-chatinput-editor']", "div[contenteditable='true']", "textarea"],
      sendBtn: ["[data-testid='msh-chatinput-send-button']", "button[aria-label*='发送']"],
      fileInput: ["input[type='file']"],
      answers: ["[class*='markdown']", ".markdown"],
      stopBtn: ["[class*='stop']", "button[aria-label*='Stop']"],
      attachMarker: ["[class*='attachment']", "[class*='upload'] img"],
    },
    generic: {
      editor: ["textarea", "div[contenteditable='true']"],
      sendBtn: ["button[type='submit']", "button[aria-label*='Send']", "button[aria-label*='发送']"],
      fileInput: ["input[type='file']"],
      answers: [".markdown", "[class*='markdown']", "[class*='message']"],
      stopBtn: ["[class*='stop']", "button[aria-label*='Stop']"],
      attachMarker: ["[class*='attachment']", "[class*='upload']"],
    },
  };
  const A = ADAPTERS[SITE] || ADAPTERS.generic;

  const $any = (sels, root = document) => {
    for (const s of sels) { const el = root.querySelector(s); if (el) return el; }
    return null;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const emit = (payload) => chrome.runtime.sendMessage({ kind: "reply", _site: SITE, ...payload }).catch(() => {});

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.kind === "examlink:ping") { respond({ ok: true, site: SITE }); return false; }
    if (msg.kind === "examlink:ask") {
      run(msg).then(() => respond({ ok: true }))
             .catch((e) => { emit({ status: "error", text: String(e.message || e) }); respond({ ok: false }); });
      return true;
    }
  });

  /* ---------------- main flow ---------------- */
  async function run({ image, text, reqId }) {
    const baseline = lastAnswerText();
    let attached = false;
    if (image) {
      const file = dataUrlToFile(image);
      attached = await attachImage(file);
      if (!attached) emit({ status: "warn", text: "图片可能未成功附加，继续发送文本" });
    }
    if (text) insertText(text);
    await sleep(200);
    clickSend();
    streamAnswer(reqId, baseline);
  }

  function dataUrlToFile(dataUrl) {
    const [head, b64] = dataUrl.split(",");
    const mime = (head.match(/data:(.*?);/) || [])[1] || "image/jpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], "screenshot." + (mime.includes("png") ? "png" : "jpg"), { type: mime });
  }

  /* ---------------- image attach: 3 strategies ---------------- */
  async function attachImage(file) {
    const dt = new DataTransfer();
    dt.items.add(file);

    // 1) hidden file input
    const fi = $any(A.fileInput);
    if (fi) {
      try {
        fi.files = dt.files;
        fi.dispatchEvent(new Event("change", { bubbles: true }));
        if (await waitAttach()) return true;
      } catch {}
    }
    // 2) drop on editor
    const ed = $any(A.editor);
    if (ed) {
      try {
        for (const type of ["dragover", "drop"]) {
          ed.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
        if (await waitAttach()) return true;
      } catch {}
      // 3) paste
      try {
        ed.focus();
        ed.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
        if (await waitAttach()) return true;
      } catch {}
    }
    return attachedHeuristic();
  }

  function attachedHeuristic() {
    if ($any(A.attachMarker)) return true;
    // generic: any new img/progress near composer
    const ed = $any(A.editor);
    if (!ed) return false;
    const composer = ed.closest("form") || ed.parentElement;
    return !!(composer && composer.querySelector("img"));
  }
  async function waitAttach(timeout = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (attachedHeuristic()) return true;
      await sleep(250);
    }
    return attachedHeuristic();
  }

  /* ---------------- prompt + send ---------------- */
  function insertText(text) {
    const ed = $any(A.editor);
    if (!ed) return;
    ed.focus();
    if (ed.tagName === "TEXTAREA" || ed.tagName === "INPUT") {
      const proto = ed.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(ed, text);
      ed.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // contenteditable — execCommand keeps React/ProseMirror in sync
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ed); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
      document.execCommand("insertText", false, text);
      ed.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }

  function clickSend() {
    const btn = $any(A.sendBtn);
    if (btn && !btn.disabled) { btn.click(); return; }
    // fallback: Enter on the editor
    const ed = $any(A.editor);
    if (ed) {
      for (const type of ["keydown", "keypress", "keyup"]) {
        ed.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
      }
    }
  }

  /* ---------------- answer observation ---------------- */
  function lastAnswerText() {
    const nodes = document.querySelectorAll(A.answers.join(","));
    if (!nodes.length) return "";
    return (nodes[nodes.length - 1].innerText || "").trim();
  }

  function generating() {
    // stop/regenerate button present => still streaming
    if ($any(A.stopBtn)) return true;
    const stream = document.querySelector("[class*='result-streaming'], [class*='streaming']");
    return !!stream;
  }

  async function streamAnswer(reqId, baseline) {
    await sleep(800); // let the site register the submission
    let last = "", sameSince = Date.now(), started = Date.now();
    const obs = new MutationObserver(() => {
      const cur = lastAnswerText();
      if (cur !== last) { last = cur; sameSince = Date.now(); emit({ status: "streaming", text: cur, reqId }); }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    // poll for completion — works even if observer misses characterData
    while (Date.now() - started < 240000) {
      await sleep(700);
      const cur = lastAnswerText();
      if (cur !== last) { last = cur; sameSince = Date.now(); emit({ status: "streaming", text: cur, reqId }); }
      const quiet = Date.now() - sameSince > 1800;
      const grew = cur && cur !== baseline;
      if (grew && quiet && !generating()) {
        emit({ status: "done", text: cur, reqId });
        obs.disconnect();
        return;
      }
      if (!grew && Date.now() - started > 20000) {
        emit({ status: "error", text: "未检测到回答内容（可能需要在页面上登录，或选择器已失效）", reqId });
        obs.disconnect();
        return;
      }
    }
    emit({ status: "done", text: last || "（超时）", reqId });
    obs.disconnect();
  }
})();
