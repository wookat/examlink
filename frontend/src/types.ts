/* Shared types for the examlink frontend. */

export interface MonitorInfo {
  index: number;
  width: number;
  height: number;
  primary: boolean;
}

export interface ProfileInfo {
  label: string;
  model: string;
}

export interface ProviderInfo {
  name: string;
  base_url: string;
  models: string[];
}

export interface ServerState {
  port: number;
  token: string;
  urls: string[];
  monitor: number | null;
  monitors: MonitorInfo[];
  monitor_size: { width: number; height: number };
  roi: [number, number, number, number] | null;
  auto: { enabled?: boolean; threshold?: number; stable_ms?: number; cooldown_s?: number; [k: string]: any };
  scene: string;
  custom_prompt: string;
  scene_overrides: string[];
  knowledge: string;
  knowledge_file: { exists: boolean; chars: number };
  ai_mode: string;
  proxy: { provider: string; model: string; configured: boolean };
  active_profile: string | null;
  profiles: Record<string, ProfileInfo>;
  busy: boolean;
  providers: Record<string, ProviderInfo>;
  scenes: Record<string, string>;
  hotkey: { items: { action: string; trigger: string }[] };
  hotkey_choices: Record<string, string>;
  hotkey_actions: Record<string, string>;
  jpeg_quality: number;
  max_image_dim: number;
  kb_auto_append: boolean;
  verify_profile: string;
  fallback_profile: string;
}

export interface CardItem {
  id: string;
  kind: "cap" | "ask";
  trigger: string;           // auto | manual | hotkey | ask | err
  tag: string;               // 自动截图 / AI答题 / 截图 / 追问 / 错误
  qnum: number | null;       // server-side running counter
  qno: string;               // question number printed on the exam paper, if parsed
  image: string | null;      // data uri (live) or thumb (history)
  text: string;              // full accumulated answer text
  streaming: boolean;
  ts: number;                // epoch seconds (or ms for local direct cards)
  time: string;              // "HH:MM" display
  answer: string;            // extracted "答案 X" badge
  answerLetter: string;      // giant option letter(s) e.g. "ABD"
  answerRest: string;        // trailing text after the letters
  textAns: boolean;          // non-letter answer → render smaller
  title: string;             // keyword line (first meaningful line)
  verify: { agree: boolean; alt: string; model: string } | null;
  error: boolean;
  stopped: boolean;
  detailOpen: boolean;
}
