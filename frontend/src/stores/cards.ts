/* Answer cards + bounded card deck (iOS lockscreen / Wallet stack).

   In the Vue port, deck state is data-driven instead of a DOM pass:
   groups are contiguous runs of the same source qnum (positional —
   identical numbers in separate runs stay separate groups), deckFocus
   indexes into groups, and each card's --d depth comes from a computed
   lookup the AnswerDeck binds onto the same CSS rules as before. */
import { defineStore } from "pinia";
import type { CardItem } from "../types";
import { extractAnswer, extractTitle, stripAnswerLines } from "../utils/extract";
import { useDispStore } from "./disp";

export const DECK_LAYERS = 4;

function fmtTime(ts?: number): string {
  const d = ts ? new Date(ts * 1000) : new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

let cardSeq = 0;

export const useCardsStore = defineStore("cards", {
  state: () => ({
    cards: [] as CardItem[],
    deckFocus: -1,          // index into groups; -1 = latest
    dotUnseen: 0,
    replaying: false,
    flashTick: 0,           // increments → retriggers the done-flash anim
  }),
  getters: {
    /** contiguous runs of equal qnum → array of card arrays */
    groups(): CardItem[][] {
      const gs: CardItem[][] = [];
      let prev: any = Symbol();
      for (const c of this.cards) {
        const q = c.qnum ?? ("#" + gs.length);
        if (q !== prev) { gs.push([]); prev = q; }
        gs[gs.length - 1].push(c);
      }
      return gs;
    },
    /** card.id → { depth, isRep, isCur, groupFirst } deck placement lookup */
    placement(): Record<string, { depth: number; rep: boolean; cur: boolean; groupFirst: boolean }> {
      const gs = this.groups;
      const focus = this.deckFocus < 0 || this.deckFocus >= gs.length ? gs.length - 1 : this.deckFocus;
      const out: Record<string, { depth: number; rep: boolean; cur: boolean; groupFirst: boolean }> = {};
      gs.forEach((g, gi) => {
        const depth = focus - gi;
        g.forEach((c, ci) => {
          const rep = ci === g.length - 1;
          out[c.id] = {
            depth,
            rep,
            cur: gi === focus,
            groupFirst: ci === 0,
          };
        });
      });
      return out;
    },
    /** whether a card is visible on the bounded deck (index mode) */
    onDeck(): Record<string, boolean> {
      const out: Record<string, boolean> = {};
      const p = this.placement;
      for (const c of this.cards) {
        const pl = p[c.id];
        out[c.id] = pl.rep && pl.depth >= 0 && pl.depth <= DECK_LAYERS;
      }
      return out;
    },
    heroCard(): CardItem | undefined {
      const gs = this.groups;
      const focus = this.deckFocus < 0 || this.deckFocus >= gs.length ? gs.length - 1 : this.deckFocus;
      return gs[focus]?.[gs[focus].length - 1];
    },
  },
  actions: {
    deckStep(dir: number) {
      const n = this.groups.length;
      if (n < 2) return;
      this.deckFocus = Math.min(n - 1, Math.max(0, (this.deckFocus < 0 ? n - 1 : this.deckFocus) + dir));
    },
    focusGroupOf(cardId: string) {
      const gi = this.groups.findIndex(g => g.some(c => c.id === cardId));
      if (gi >= 0) this.deckFocus = gi;
    },
    focusLatest() { this.deckFocus = -1; },

    newCard(partial: Partial<CardItem> & { id: string }): CardItem {
      const c: CardItem = {
        kind: "cap", trigger: "manual", tag: "", qnum: null, qno: "",
        image: null, text: "", streaming: false, ts: 0, time: fmtTime(partial.ts),
        answer: "", answerLetter: "", answerRest: "", textAns: false, title: "",
        verify: null, error: false, stopped: false, detailOpen: false,
        ...partial,
      };
      if (!c.time) c.time = fmtTime();
      this.cards.push(c);
      if (this.cards.length > 120) this.cards.splice(0, this.cards.length - 120);
      this.deckFocus = -1;
      // dot mode: count unseen answers while the panel is closed
      const disp = useDispStore();
      if (disp.dot && !disp.dotOpen && !this.replaying) this.dotUnseen++;
      return c;
    },
    byId(id: string) { return this.cards.find(c => c.id === id); },

    appendChunk(id: string, text: string) {
      const c = this.byId(id); if (!c) return;
      c.text += text;
      c.streaming = true;
    },
    finish(id: string) {
      const c = this.byId(id); if (!c) return;
      c.streaming = false;
      const t = extractTitle(c.text);
      if (t) { c.title = t.title; if (t.qno) c.qno = t.qno; }
      const a = extractAnswer(c.text);
      if (a) {
        c.answer = a.answer; c.answerLetter = a.letter; c.answerRest = a.rest; c.textAns = a.textAns;
        c.detailOpen = !useDispStore().fold;      // user pref: reasoning expanded by default
      }
      this.flashTick++;
    },
    fail(id: string | undefined, msg: string) {
      const c = id ? this.byId(id) : undefined;
      if (c) { c.streaming = false; c.error = true; c.text += (c.text ? "\n\n" : "") + msg; }
      else {
        this.newCard({ id: "e" + (++cardSeq) + Date.now().toString(36), trigger: "err", tag: "错误", text: msg, error: true });
      }
    },
    setVerify(id: string, v: { agree: boolean; alt: string; model: string }) {
      const c = this.byId(id); if (c) c.verify = v;
    },
    replay(entries: any[]) {
      this.replaying = true;
      for (const e of entries) {
        const isAsk = e.kind === "ask";
        const tag = isAsk ? "追问" : (e.trigger === "auto" ? "自动截图" : (e.ask ? "AI答题" : "截图"));
        const c = this.newCard({
          id: e.id, kind: isAsk ? "ask" : "cap",
          trigger: isAsk ? "ask" : (e.trigger || "manual"), tag,
          qnum: e.qnum ?? null, image: e.thumb || null,
          text: e.answer || (isAsk ? (e.q ? "追问：" + e.q : "追问") : "（仅截图，未请求 AI）"),
          ts: e.ts, error: !!e.error, stopped: !!e.stopped,
        });
        if (!e.answer && !isAsk) c.tag = "截图";
        if (e.answer) {
          const t = extractTitle(e.answer);
          if (t) { c.title = t.title; if (t.qno) c.qno = t.qno; }
          const a = extractAnswer(e.answer);
          if (a) {
            c.answer = a.answer; c.answerLetter = a.letter; c.answerRest = a.rest; c.textAns = a.textAns;
            c.detailOpen = !useDispStore().fold;
          }
        }
      }
      this.replaying = false;
      this.deckFocus = -1;
    },
    clear() {
      this.cards = [];
      this.deckFocus = -1;
      this.dotUnseen = 0;
    },
    /** markdown text actually rendered in the card body (answer line stripped) */
    bodyText(c: CardItem): string {
      return c.answer ? stripAnswerLines(c.text) : c.text;
    },
    bumpUnseen() {
      if (!this.replaying) this.dotUnseen++;
    },
    seenDot() { this.dotUnseen = 0; },
  },
});
