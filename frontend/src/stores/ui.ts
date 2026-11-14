/* Transient UI state: toast, lightbox, live-preview panel, last capture. */
import { defineStore } from "pinia";

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = defineStore("ui", {
  state: () => ({
    toast: "",
    lightboxSrc: "" as string | "",
    liveOpen: false,
    lastB64: "" as string,          // last capture jpeg b64 for direct-mode asks
  }),
  actions: {
    show(msg: string, ms = 2400) {
      this.toast = msg;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { this.toast = ""; }, ms);
    },
    openLightbox(src: string) { this.lightboxSrc = src; },
    closeLightbox() { this.lightboxSrc = ""; },
    toggleLive() { this.liveOpen = !this.liveOpen; },
  },
});

export function copyText(t: string, show: (m: string, ms?: number) => void) {
  if (!t || !t.trim()) { show("没有可复制的内容"); return; }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(t).then(() => show("已复制"), () => legacyCopy(t, show));
  } else legacyCopy(t, show);
}
function legacyCopy(t: string, show: (m: string, ms?: number) => void) {
  const ta = document.createElement("textarea");
  ta.value = t; ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); show("已复制"); }
  catch { show("复制失败，请长按文本手动复制"); }
  ta.remove();
}
