/* WebSocket client: connects to the examlink service and routes every
   server message into the Pinia stores. Mirrors the old app's protocol. */
import { useSessionStore } from "./stores/session";
import { useCardsStore } from "./stores/cards";
import { useUiStore } from "./stores/ui";
import { useDispStore } from "./stores/disp";
import { effectiveCfg, directChat, FALLBACK_SCENES } from "./utils/direct";

let directHistory: any[] = [];
let abortCtrl: AbortController | null = null;
let started = false;

export function abortDirect() { abortCtrl?.abort(); }
export function clearDirectHistory() { directHistory = []; }

function b64Of(dataUri: string) { return dataUri.slice(dataUri.indexOf(",") + 1); }

function clientScenePrompt(): string {
  const session = useSessionStore();
  const s = session.state;
  if (s?.custom_prompt) return s.custom_prompt;
  const sid = s?.scene || "general";
  return (s?.scenes && s.scenes[sid]) || FALLBACK_SCENES[sid] || FALLBACK_SCENES.general;
}

export function directAsk(opts: { images: string[]; q: string; newConv: boolean; trigger?: string; image?: string | null }) {
  const session = useSessionStore();
  const cards = useCardsStore();
  const ui = useUiStore();
  const cfg = effectiveCfg(session.directCfg);
  if (!cfg.base_url || !cfg.model) {
    ui.show("直连模式未配置 Base URL/模型");
    cards.fail(undefined, "未配置模型：请在 设置 → AI 模型 → 直连 中填写");
    return;
  }
  if (opts.newConv) directHistory = [];
  const msgs: any[] = [{ role: "system", content: clientScenePrompt() }];
  for (const h of directHistory.slice(-12)) msgs.push(h);
  const content: any[] = [];
  for (const b64 of opts.images) content.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64 } });
  if (opts.q) content.push({ type: "text", text: opts.q });
  if (!content.length) content.push({ type: "text", text: "请分析这张截图并给出答案。" });
  const userMsg = { role: "user", content };
  msgs.push(userMsg);
  const id = "d" + Date.now().toString(36);
  const tag = opts.trigger === "auto" ? "自动截图" : "AI答题";
  const card = cards.newCard({
    id, kind: "cap", trigger: opts.trigger || "manual", tag,
    image: opts.image || (opts.images.length ? "data:image/jpeg;base64," + opts.images[0] : null),
  });
  card.text = "⏳ 思考中…";
  card.streaming = true;
  session.busy = true;
  abortCtrl = new AbortController();
  directChat({
    cfg, messages: msgs, signal: abortCtrl.signal,
    onText: (full, streaming) => { card.text = full; card.streaming = streaming; },
  }).then(last => {
    directHistory.push(userMsg, { role: "assistant", content: last });
    while (directHistory.length > 16) directHistory.splice(0, 2);
    cards.finish(id);
  }).catch(e => {
    if (e?.name !== "AbortError") { ui.show("直连请求失败: " + e.message, 3500); cards.fail(id, "请求失败: " + e.message); }
    else card.stopped = true;
  }).finally(() => { abortCtrl = null; session.busy = false; });
}

function handle(m: any) {
  const session = useSessionStore();
  const cards = useCardsStore();
  const ui = useUiStore();
  const disp = useDispStore();
  switch (m.t) {
    case "state":
      session.state = m;
      session.busy = !!m.busy;
      break;
    case "capture": {
      ui.lastB64 = b64Of(m.image);
      if (session.aiMode === "direct" && m.ask) {
        directAsk({ images: [ui.lastB64], q: "", newConv: true, trigger: m.trigger, image: m.image });
      } else {
        const tag = m.trigger === "auto" ? "自动截图" : (m.ask ? "AI答题" : "截图");
        const card = cards.newCard({ id: m.id, kind: "cap", trigger: m.trigger, tag, qnum: m.qnum, image: m.image });
        if (!m.ask) card.text = "（仅截图，未请求 AI）";
        if (m.ask && session.aiMode === "proxy") { card.text = ""; card.streaming = true; session.busy = true; }
      }
      break;
    }
    case "chunk": {
      const c = cards.byId(m.id);
      if (c) cards.appendChunk(m.id, m.text);
      session.busy = true;
      break;
    }
    case "done":
      cards.finish(m.id);
      session.busy = false;
      break;
    case "error":
      ui.show(m.msg || "错误", 3500);
      if (m.id) cards.fail(m.id, m.msg);
      session.busy = false;
      break;
    case "status":
      if (m.stage === "idle") session.busy = false;
      break;
    case "ask_ack": {
      const card = cards.newCard({ id: m.id, kind: "ask", trigger: "ask", tag: "追问", qnum: m.qnum });
      card.text = "⏳ 思考中…";
      card.streaming = true;
      session.busy = true;
      break;
    }
    case "nav":
      if (m.action === "nav_next") cards.deckStep(1);
      else if (m.action === "nav_prev") cards.deckStep(-1);
      else if (m.action === "nav_down") cards.deckStep(1);
      else if (m.action === "nav_up") cards.deckStep(-1);
      break;
    case "verify":
      cards.setVerify(m.id, { agree: m.agree, alt: m.alt || "", model: m.model || "" });
      break;
    case "cleared":
      cards.clear();
      directHistory = [];
      break;
    case "history":
      cards.replay(m.cards || []);
      break;
    case "bye":
      ui.show("服务已关闭");
      break;
  }
}

export function connectWs() {
  const session = useSessionStore();
  if (started) return;
  started = true;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(session.token)}`);
    session.ws = ws;
    ws.onopen = () => { session.conn = "on"; session.connText = "已连接"; };
    ws.onclose = () => {
      session.conn = "err"; session.connText = "已断开";
      setTimeout(open, 2000);
    };
    ws.onerror = () => { session.conn = "err"; session.connText = "连接错误"; };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      handle(m);
    };
  };
  open();
}
