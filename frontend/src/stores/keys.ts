/* Device hotkeys: key/mouse-button bindings that fire while THIS browser
   page is focused. Same localStorage schema as the old app. */
import { defineStore } from "pinia";

const HK_KEY = "examlink.hk";

export const HK_LABELS: Record<string, string> = {
  "mouse:1": "鼠标中键", "mouse:3": "鼠标侧键X1", "mouse:4": "鼠标侧键X2",
};
export const HK_SLOTS = [
  ["solve", "截屏答题"], ["snap", "仅截图"],
  ["prev", "上一题"], ["next", "下一题"], ["up", "向上滚"], ["down", "向下滚"],
] as const;

export type HkAction = "solve" | "snap" | "prev" | "next" | "up" | "down";

export function hkLabel(code: string): string {
  if (!code) return "未设置";
  if (HK_LABELS[code]) return HK_LABELS[code];
  if (code.startsWith("mouse:")) return "鼠标键 " + code.slice(6);
  return code.replace(/\+/g, " + ").replace(/Key|Digit/, m => (m === "Key" ? "" : ""));
}

export function comboOf(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("win");
  const c = e.code;
  if (["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(c)) return null;
  parts.push(c);
  return parts.join("+");
}

export const useKeysStore = defineStore("keys", {
  state: () => {
    const hk = { solve: "", snap: "", prev: "ArrowUp", next: "ArrowDown", up: "PageUp", down: "PageDown" } as Record<HkAction, string>;
    try { Object.assign(hk, JSON.parse(localStorage.getItem(HK_KEY) || "{}")); } catch {}
    return { hk, recording: null as HkAction | null };
  },
  actions: {
    save() { localStorage.setItem(HK_KEY, JSON.stringify(this.hk)); },
    startRec(which: HkAction) { this.recording = which; },
    stopRec() { this.recording = null; },
    clearAll() {
      this.hk = { solve: "", snap: "", prev: "", next: "", up: "", down: "" };
      this.save();
    },
    /** returns true when the combo is bound (caller preventDefaults) */
    action(code: string): HkAction | null {
      for (const [k, v] of Object.entries(this.hk)) if (v && v === code) return k as HkAction;
      return null;
    },
  },
});
