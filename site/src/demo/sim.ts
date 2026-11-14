/* Demo simulator — drives the REAL cards/session stores with a scripted
   exam session so the site shows the actual product UI answering live.
   Everything it does mirrors genuine server messages. */
import { useCardsStore } from "../../../frontend/src/stores/cards";
import { useSessionStore } from "../../../frontend/src/stores/session";
import { useUiStore } from "../../../frontend/src/stores/ui";

interface DemoQ { n: number; t: string; opts: string[]; a: string; ans: string; follow: string; }

const QS: DemoQ[] = [
  { n: 12, t: "事务的 ACID 特性中，保证并发执行互不干扰的是", a: "B",
    opts: ["原子性", "隔离性", "一致性", "持久性"],
    ans: "12. 事务的 ACID 特性中，保证并发执行互不干扰的是\n答案：B\n解析：隔离性通过锁机制或 MVCC 保证并发事务互不干扰；原子性保证全做或全不做，持久性保证已提交数据不丢失。",
    follow: "追问：四种隔离级别由低到高？\n读未提交 < 读已提交 < 可重复读（MySQL 默认）< 串行化；级别越高并发越低。答案仍选 B。" },
  { n: 13, t: "TCP 三次握手中，服务端第二次发送的报文标志位是", a: "C",
    opts: ["SYN", "ACK", "SYN+ACK", "FIN"],
    ans: "13. TCP 三次握手中服务端第二次发送的报文标志位\n答案：C\n解析：第二次握手服务端回复 SYN+ACK，同步自身序号并确认客户端序号；第三次客户端再回 ACK 完成连接。",
    follow: "追问：为什么不是两次握手？\n两次无法让服务端确认客户端的接收能力，且旧 SYN 会误建连接。答案仍选 C。" },
  { n: 14, t: "操作系统中，产生死锁的必要条件不包括", a: "D",
    opts: ["互斥条件", "请求与保持", "循环等待", "时间片轮转"],
    ans: "14. 操作系统中产生死锁的必要条件不包括\n答案：D\n解析：死锁四条件是互斥、占有且等待、不可剥夺、循环等待；时间片轮转属于调度策略，可破坏死锁而非其条件。",
    follow: "追问：如何预防死锁？\n破坏四条件之一即可，如资源有序分配（破循环等待）、一次性申请（破占有且等待）。答案仍选 D。" },
  { n: 15, t: "Java 中 HashMap 在多线程环境下的正确替代是", a: "A",
    opts: ["ConcurrentHashMap", "ArrayList", "LinkedList", "TreeMap"],
    ans: "15. Java 中 HashMap 多线程环境的正确替代\n答案：A\n解析：ConcurrentHashMap 用分段锁/CAS 支持高并发读写；Hashtable 全表锁性能差，官方建议改用 CHM。",
    follow: "追问：JDK8 的 CHM 改动？\n取消分段锁，改为 CAS + synchronized 锁桶头节点，链表过长转红黑树。答案仍选 A。" },
  { n: 16, t: "商业银行负债管理理论认为，保证流动性的手段是", a: "C",
    opts: ["压缩贷款规模", "持有超额准备金", "主动负债", "出售固定资产"],
    ans: "16. 商业银行负债管理理论中保证流动性的手段\n答案：C\n解析：负债管理理论主张通过主动负债（同业拆借、发行大额存单等）获取流动性，只要资产收益大于负债成本即可盈利。",
    follow: "追问：与资产管理理论的区别？\n资产管理靠调整资产端（变现债券），负债管理靠负债端主动借钱补流动性。答案仍选 C。" },
  { n: 17, t: "凯恩斯货币需求理论中，与利率负相关的动机是", a: "B",
    opts: ["交易动机", "投机动机", "预防动机", "储蓄动机"],
    ans: "17. 凯恩斯货币需求理论中与利率负相关的动机\n答案：B\n解析：投机动机的货币需求随利率上升而减少（持币等待债券低价）；交易与预防动机主要取决于收入水平。",
    follow: "追问：流动性陷阱指什么？\n利率极低时投机动机需求趋于无限大，货币政策失效。答案仍选 B。" },
];

/* fake exam-page screenshot shown on each card's shot band + lightbox */
function mkShot(q: DemoQ): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const opts = q.opts.map((o, i) =>
    `<circle cx="34" cy="${116 + i * 34}" r="8" fill="none" stroke="#8a93a6" stroke-width="1.6"/>` +
    `<text x="52" y="${121 + i * 34}" font-size="15" fill="#2a3040" font-family="sans-serif">${"ABCD"[i]}. ${esc(o)}</text>`
  ).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="300" viewBox="0 0 780 300">` +
    `<rect width="780" height="300" fill="#f3f5f9"/>` +
    `<rect width="780" height="42" fill="#2456a6"/>` +
    `<text x="20" y="28" font-size="16" font-weight="600" fill="#fff" font-family="sans-serif">在线考试系统 · 单选题</text>` +
    `<text x="700" y="28" font-size="14" fill="#cfdcf5" font-family="sans-serif">00:42:18</text>` +
    `<text x="24" y="76" font-size="17" font-weight="600" fill="#151923" font-family="sans-serif">${q.n}. ${esc(q.t)}</text>` +
    opts +
    `<rect x="24" y="256" width="92" height="30" rx="5" fill="#2456a6"/>` +
    `<text x="52" y="276" font-size="14" fill="#fff" font-family="sans-serif">下一题</text>` +
    `</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let streamIv: ReturnType<typeof setInterval> | null = null;
let qi = 0;
let seq = 0;

/* stream an AI response into the card the same way SSE chunks do */
function streamInto(id: string, full: string, done?: () => void) {
  const cards = useCardsStore();
  const session = useSessionStore();
  let i = 0;
  streamIv = setInterval(() => {
    i += 11 + Math.floor(Math.random() * 9);
    const c = cards.byId(id);
    if (c) c.text = full.slice(0, i);
    if (i >= full.length) {
      clearInterval(streamIv!); streamIv = null;
      cards.finish(id);
      session.busy = false;
      done?.();
    }
  }, 64);
}

function fire(q: DemoQ, trigger: "auto" | "manual", ask = true) {
  const cards = useCardsStore();
  const session = useSessionStore();
  const id = "sim" + (++seq).toString(36);
  const tag = trigger === "auto" ? "自动截图" : "AI答题";
  const card = cards.newCard({ id, kind: "cap", trigger, tag, qnum: q.n, image: mkShot(q) });
  if (!ask) { card.text = "（仅截图，未请求 AI）"; return; }
  card.text = ""; card.streaming = true; session.busy = true;
  streamInto(id, q.ans);
}

function liveCapture() {
  const q = QS[qi % QS.length]; qi++;
  fire(q, "auto");
  timer = setTimeout(liveCapture, 7000 + Math.random() * 2000);
}

export function startSim() {
  const cards = useCardsStore();
  const now = Math.floor(Date.now() / 1000);
  // seed three finished questions so the carousel is populated immediately
  QS.slice(0, 3).forEach((q, i) => {
    const id = "seed" + q.n;
    const c = cards.newCard({
      id, kind: "cap", trigger: "auto", tag: "自动截图",
      qnum: q.n, image: mkShot(q), ts: now - (3 - i) * 90,
    });
    c.text = q.ans;
    cards.finish(id);
  });
  qi = 3;
  timer = setTimeout(liveCapture, 3800);
}

export function stopSim() {
  if (timer) clearTimeout(timer);
  if (streamIv) clearInterval(streamIv);
  timer = streamIv = null;
}

/* the real ComposerBar / TopBar call session.send() — reroute it here so
   every button in the demo actually does something honest */
export function simSend(m: any) {
  const session = useSessionStore();
  const cards = useCardsStore();
  const ui = useUiStore();
  switch (m?.t) {
    case "capture": {
      const q = QS[qi % QS.length]; qi++;
      fire(q, "manual", m.ask !== false);
      break;
    }
    case "ask": {
      const hero = cards.heroCard;
      const q = QS.find(x => x.n === hero?.qnum) || QS[0];
      const id = "simA" + (++seq).toString(36);
      const c = cards.newCard({ id, kind: "ask", trigger: "ask", tag: "追问", qnum: q.n });
      c.text = ""; c.streaming = true; session.busy = true;
      streamInto(id, (m.q ? "追问：" + m.q + "\n" : "") + q.follow);
      break;
    }
    case "abort":
      if (streamIv) { clearInterval(streamIv); streamIv = null; }
      cards.cards.forEach(c => { if (c.streaming) { c.streaming = false; c.stopped = true; } });
      session.busy = false;
      break;
    case "set": {
      session.state = { ...(session.state || {}), ...(m.patch || {}) } as any;
      if (m.patch?.auto) ui.show(m.patch.auto.enabled ? "自动截题已开启" : "自动截题已关闭");
      break;
    }
    case "clear": cards.clear(); break;
  }
}
