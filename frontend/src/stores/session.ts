/* Server session: token, ws connection state, public_state mirror,
   AI mode (proxy/direct) + direct-mode provider cfg (localStorage). */
import { defineStore } from "pinia";
import type { ServerState } from "../types";

const LS_MODE = "examlink.mode";
const LS_DIRECT = "examlink.direct";

function readToken(): string {
  const params = new URLSearchParams(location.search);
  let t = params.get("t") || params.get("token") || "";
  if (!t) {
    const m = location.hash.match(/[#&?]t=([a-zA-Z0-9]+)/);
    if (m) t = m[1];
  }
  return t;
}

export const useSessionStore = defineStore("session", {
  state: () => ({
    token: readToken(),
    conn: "off" as "on" | "err" | "off",
    connText: "连接中…",
    state: null as ServerState | null,
    aiMode: (localStorage.getItem(LS_MODE) || "proxy") as "proxy" | "direct",
    directCfg: JSON.parse(localStorage.getItem(LS_DIRECT) || "{}") as {
      provider?: string; base_url?: string; api_key?: string; model?: string;
    },
    busy: false,
    ws: null as WebSocket | null,
  }),
  getters: {
    autoOn: (s) => !!s.state?.auto?.enabled,
    previewUrl: (s) => `/preview.mjpg?token=${encodeURIComponent(s.token)}`,
  },
  actions: {
    send(obj: Record<string, any>) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    },
    set(patch: Record<string, any>) { this.send({ t: "set", patch }); },
    toggleAuto() { this.set({ auto: { enabled: !this.autoOn } }); },
    setAiMode(m: "proxy" | "direct") {
      this.aiMode = m;
      localStorage.setItem(LS_MODE, m);
    },
    saveDirectCfg(cfg: typeof this.directCfg) {
      this.directCfg = { ...cfg };
      localStorage.setItem(LS_DIRECT, JSON.stringify(this.directCfg));
    },
  },
});
