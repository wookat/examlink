/* Display preferences — same localStorage schema as the old app so
   existing users keep their settings across the migration. */
import { defineStore } from "pinia";

const DISP_KEY = "examlink.disp";
const FONT_KEY = "examlink.fontpx";

export interface DispState {
  v: number;
  align: "left" | "center" | "right";
  cw: number;                 // content width %
  contrast: "std" | "high";
  latestOnly: boolean;
  gaze: string;               // '' | left | front | right | far
  dot: boolean;               // minimal dot mode
  wake: boolean;
  fold: boolean;              // reasoning collapsed by default
  index: boolean;             // answer-index → card deck layout
  fsH: number | null;         // per-section font sizes (null = derive from fontPx)
  fsT: number | null;
  fsA: number | null;
  fsM: number | null;
  heroPos: "left" | "right";  // giant letter side
  deckDir: "stack" | "top" | "left" | "right"; // where the hero sits vs the history rail
  compHide: boolean;          // composer collapsed to tab
  dotOpen: boolean;           // dot panel open (session-only)
}

const DEFAULTS: DispState = {
  v: 2, align: "center", cw: 80, contrast: "std", latestOnly: false,
  gaze: "", dot: false, wake: true, fold: true, index: true,
  fsH: null, fsT: null, fsA: null, fsM: null,
  heroPos: "right", deckDir: "stack", compHide: false, dotOpen: false,
};

const GAZE_PRESETS: Record<string, { align: DispState["align"]; cw: number; latestOnly?: boolean; font?: number }> = {
  left: { align: "right", cw: 58 },
  front: { align: "center", cw: 80 },
  right: { align: "left", cw: 58 },
  far: { align: "center", cw: 88, latestOnly: true, font: 30 },
};

let wakeLock: any = null;

export const useDispStore = defineStore("disp", {
  state: () => {
    const s = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(DISP_KEY) || "{}");
      Object.assign(s, saved);
      if ((saved.v || 0) < 2) { s.index = true; s.v = 2; }   // deck layout is the default
    } catch {}
    s.dotOpen = false;
    return {
      ...s,
      fontPx: Math.min(72, Math.max(14, parseInt(localStorage.getItem(FONT_KEY) || "20", 10) || 20)),
      compPeeked: false,
      isNarrow: typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
    };
  },
  getters: {
    fontPct: (s) => Math.round(s.fontPx / 20 * 100) + "%",
    // per-section sizes: explicit override or derived from the master slider
    fsHeff: (s) => s.fsH ?? Math.round(s.fontPx * 1.45),
    fsTeff: (s) => s.fsT ?? 14,
    fsAeff: (s) => s.fsA ?? s.fontPx,
    fsMeff: (s) => s.fsM ?? 12,
    liveVars(): Record<string, string> {
      const v: Record<string, string> = { "--cw": (this.isNarrow ? Math.max(this.cw, 92) : this.cw) + "%" };
      if (this.fsH) v["--fs-h"] = this.fsH + "px";
      if (this.fsT) v["--fs-t"] = this.fsT + "px";
      if (this.fsA) v["--fs-a"] = this.fsA + "px";
      if (this.fsM) v["--fs-m"] = this.fsM + "px";
      return v;
    },
  },
  actions: {
    save() {
      const { dotOpen, compPeeked, fontPx, isNarrow, ...persist } = this.$state as any;
      localStorage.setItem(DISP_KEY, JSON.stringify(persist));
    },
    setFont(px: number) {
      this.fontPx = Math.min(72, Math.max(14, px));
      document.documentElement.style.setProperty("--fs", this.fontPx + "px");
      localStorage.setItem(FONT_KEY, String(this.fontPx));
    },
    setGaze(g: string) {
      const p = GAZE_PRESETS[g]; if (!p) return;
      this.gaze = g; this.align = p.align; this.cw = p.cw;
      if (p.latestOnly !== undefined) this.latestOnly = p.latestOnly;
      if (p.font) this.setFont(p.font);
      this.save();
    },
    patch(p: Partial<DispState>) { Object.assign(this, p); this.save(); },
    bindMedia() {
      const mq = window.matchMedia("(max-width: 900px)");
      const f = () => { this.isNarrow = mq.matches; };
      mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    },
    toggleDotOpen() { this.dotOpen = !this.dotOpen; },
    async keepAwake() {
      if (!this.wake) { try { await wakeLock?.release?.(); } catch {} wakeLock = null; return; }
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible")
          wakeLock = await (navigator as any).wakeLock.request("screen");
      } catch {}
    },
  },
});
