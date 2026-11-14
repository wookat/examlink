"""examlink - LAN screen-capture + AI-answer service.

Exam PC runs `python service.py` (or pythonw for zero window). A phone or
second computer opens the served web page and does everything: live preview,
ROI select, manual capture, AI chat, auto-trigger toggle.

WS protocol (JSON):
  C->S: {t:'ping'} {t:'capture',ask,q} {t:'ask',q,images} {t:'set',patch}
        {t:'clear'} {t:'abort'} {t:'shutdown'}
  S->C: {t:'state',...} {t:'capture',id,image,w,h,trigger}
        {t:'chunk',id,text} {t:'done',id} {t:'error',msg,id?}
        {t:'status',stage,detail}
"""

import asyncio
import base64
import collections
import json
import os
import re
import socket
import sys
import time
import uuid
from pathlib import Path

import capture as cap
import ai as aimod
import hotkeys as hkmod
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

if getattr(sys, "frozen", False):
    # PyInstaller bundle: read-only assets in _MEIPASS, writable files next to the exe
    BUNDLE = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    BASE = Path(sys.executable).resolve().parent
else:
    BUNDLE = BASE = Path(__file__).resolve().parent
CONFIG_PATH = BASE / "config.json"
KB_PATH = BASE / "knowledge.md"
WEB = BUNDLE / "web"  # legacy static dir (unused; the SPA lives in frontend/dist)

app = FastAPI()

# ---------------- config / state ----------------

def load_config():
    example = BASE / "config.example.json"
    if not example.exists():
        example = BUNDLE / "config.example.json"
    if not CONFIG_PATH.exists() and example.exists():
        import shutil
        shutil.copy(example, CONFIG_PATH)
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8")) if CONFIG_PATH.exists() else {}
    if example.exists():
        for k, v in json.loads(example.read_text(encoding="utf-8")).items():
            cfg.setdefault(k, v)
    if not cfg.get("token"):
        cfg["token"] = uuid.uuid4().hex[:12]
        save_config(cfg)
    return cfg


def save_config(cfg):
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


CFG = load_config()
HISTORY = []           # proxy-mode conversation (OpenAI messages format)
CLIENTS = set()        # websocket connections
STATE = {"busy": False, "last_capture": None, "last_error": None, "qnum": 0}

# ---------------- card history (survives client refresh + service restart) ----
CARD_LOG = collections.deque(maxlen=60)
HIST_PATH = BASE / "history.json"


def _hist_save():
    try:
        HIST_PATH.write_text(json.dumps(list(CARD_LOG), ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def _hist_load():
    try:
        if HIST_PATH.exists():
            for e in json.loads(HIST_PATH.read_text(encoding="utf-8"))[-60:]:
                if isinstance(e, dict) and e.get("id"):
                    CARD_LOG.append(e)
            # resume question numbering past the highest persisted qnum so a
            # restart never merges new captures into old groups
            STATE["qnum"] = max((e.get("qnum") or 0 for e in CARD_LOG), default=0)
    except Exception:
        pass


def log_card(entry):
    CARD_LOG.append(entry)
    _hist_save()


def log_card_update(cid, **kw):
    for e in reversed(CARD_LOG):
        if e.get("id") == cid:
            e.update(kw)
            _hist_save()
            return


_hist_load()
STATE.update({"started": time.time()})
CURRENT_TASK = None


def lan_ips():
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip.startswith(("192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
                              "172.2", "172.30.", "172.31.")) and ip not in ips:
                ips.insert(0, ip)
            elif ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        ips = ["127.0.0.1"]
    return ips


def ai_mode():
    return CFG.get("ai_mode") or ("proxy" if aimod.provider_cfg(CFG)["api_key"] else "direct")


def resolve_prompt():
    """custom_prompt > per-scene override > scene default."""
    cp = (CFG.get("custom_prompt") or "").strip()
    if cp:
        return cp
    scene = CFG.get("scene", "general")
    overrides = CFG.get("scenes") or {}
    if scene in overrides and overrides[scene]:
        return overrides[scene]
    return aimod.SCENES.get(scene, aimod.SCENES["general"])


def effective_scenes():
    """scene_id -> effective prompt (override or default)."""
    overrides = CFG.get("scenes") or {}
    return {sid: (overrides.get(sid) or prompt) for sid, prompt in aimod.SCENES.items()}


def load_kb():
    """Effective knowledge base = knowledge.md file + inline config text."""
    parts = []
    try:
        if KB_PATH.exists():
            parts.append(KB_PATH.read_text(encoding="utf-8").strip())
    except Exception:
        pass
    inline = (CFG.get("knowledge") or "").strip()
    if inline:
        parts.append(inline)
    return "\n\n".join(parts)


def resolve_system():
    return aimod.with_kb(resolve_prompt(), load_kb())


def kb_append(answer):
    """Auto-grow knowledge.md with answered Q&A (dedup, size-capped, toggleable)."""
    if not CFG.get("kb_auto_append"):
        return
    a = (answer or "").strip()
    if len(a) < 20 or "无法确定" in a[:60]:
        return
    try:
        existing = KB_PATH.read_text(encoding="utf-8") if KB_PATH.exists() else ""
        head = a.splitlines()[0].strip()
        if (head and head in existing) or len(existing) > 80000:
            return
        with KB_PATH.open("a", encoding="utf-8") as f:
            f.write(f"\n\n## 答过 {time.strftime('%m-%d %H:%M')}\n{a[:600]}\n")
    except Exception:
        pass


def profile_prov(name):
    """Resolve a named profile into a provider cfg dict for verify calls."""
    p = (CFG.get("profiles") or {}).get(name) or {}
    return {"name": p.get("label", name), "base_url": (p.get("base_url") or "").rstrip("/"),
            "api_key": p.get("api_key", ""), "model": p.get("model", ""), "vision": True}


def extract_answer(text):
    m = re.search(r"答案[:：]\s*\**\s*([^\n*]{1,24})", text or "")
    return m.group(1).strip().rstrip("*") if m else ""


async def run_verify(cid, image_b64s, question):
    """Second-model cross-check: re-ask the same image with verify_profile,
    compare extracted answers, broadcast agree/disagree."""
    try:
        prov = profile_prov(CFG.get("verify_profile"))
        if not (prov["api_key"] and prov["base_url"] and prov["model"]):
            return
        msgs = [{"role": "system", "content": resolve_system()},
                {"role": "user", "content": aimod.build_user_content(question, image_b64s)}]
        text = ""
        async for piece in aimod.stream_chat(msgs, prov):
            text += piece
        a2 = extract_answer(text)
        # wait for the primary card to finish (verify may return first)
        a1 = ""
        for _ in range(240):
            done = False
            for c in reversed(CARD_LOG):
                if c.get("id") == cid:
                    done = c.get("done") or c.get("stopped") or c.get("error")
                    a1 = extract_answer(c.get("answer", ""))
                    break
            if done or a1:
                break
            await asyncio.sleep(0.5)
        if not (a1 and a2):
            return
        norm = lambda s: re.sub(r"[^0-9A-Za-z一-鿿]", "", s).upper()
        agree = norm(a1) == norm(a2)
        await broadcast({"t": "verify", "id": cid, "agree": agree,
                         "alt": "" if agree else a2,
                         "model": prov["name"] + "/" + prov["model"]})
    except Exception:
        pass


def public_state():
    pc = aimod.provider_cfg(CFG)
    mon = cap.monitors()[cap.effective_index(CFG.get("monitor"))]
    return {
        "port": CFG["port"], "token": CFG["token"],
        "urls": [f"http://{ip}:{CFG['port']}/?t={CFG['token']}" for ip in lan_ips()],
        "monitor": cap.effective_index(CFG.get("monitor")),
        "monitors": [{"index": i, "width": m["width"], "height": m["height"], "primary": bool(m.get("is_primary"))}
                     for i, m in enumerate(cap.monitors()) if i > 0],
        "monitor_size": {"width": mon["width"], "height": mon["height"]},
        "roi": CFG.get("roi"),
        "auto": CFG.get("auto", {}),
        "scene": CFG.get("scene", "general"),
        "custom_prompt": CFG.get("custom_prompt", ""),
        "scene_overrides": [k for k, v in (CFG.get("scenes") or {}).items() if v],
        "knowledge": CFG.get("knowledge", ""),
        "knowledge_file": {"exists": KB_PATH.exists(),
                           "chars": len(KB_PATH.read_text(encoding="utf-8")) if KB_PATH.exists() else 0},
        "ai_mode": ai_mode(),
        "proxy": {"provider": pc["name"], "model": pc["model"], "configured": bool(pc["api_key"] and pc["base_url"] and pc["model"])},
        "active_profile": CFG.get("active_profile"),
        "profiles": {n: {"label": p.get("label", n), "model": p.get("model", "")}
                     for n, p in CFG.get("profiles", {}).items()},
        "busy": STATE["busy"],
        "providers": {k: {"name": v["name"], "base_url": v["base_url"], "models": v["models"]}
                      for k, v in aimod.PROVIDERS.items()},
        "scenes": effective_scenes(),
        "hotkey": {"items": hk_items()},
        "hotkey_choices": hkmod.TRIGGER_CHOICES,
        "hotkey_actions": hkmod.ACTIONS,
        "jpeg_quality": CFG.get("jpeg_quality", 92),
        "max_image_dim": CFG.get("max_image_dim", 3000),
        "kb_auto_append": bool(CFG.get("kb_auto_append")),
        "verify_profile": CFG.get("verify_profile", ""),
        "fallback_profile": CFG.get("fallback_profile", ""),
    }


async def broadcast(msg):
    dead = []
    for ws in list(CLIENTS):
        try:
            await ws.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            dead.append(ws)
    for ws in dead:
        CLIENTS.discard(ws)


async def status(stage, detail=""):
    await broadcast({"t": "status", "stage": stage, "detail": detail})


def auth(req):
    tok = req.query_params.get("token") or req.query_params.get("t")
    return tok == CFG["token"]


# ---------------- capture pipeline ----------------

def grab_current():
    """Grab configured monitor, crop ROI if set -> PIL image."""
    idx = cap.effective_index(CFG.get("monitor"))
    img, mon = cap.grab_monitor(idx)
    roi = CFG.get("roi")
    if roi:
        rect = cap.norm_to_pixels(roi, mon)
        if rect and rect[2] > 8 and rect[3] > 8:
            img = img.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]))
    return img


def grab_watch():
    """Grab just the watched area (ROI or full screen) for diffing."""
    idx = cap.effective_index(CFG.get("monitor"))
    mon = cap.monitors()[idx] if idx < len(cap.monitors()) else cap.primary_monitor()
    roi = CFG.get("roi")
    if roi:
        rect = cap.norm_to_pixels(roi, mon)
        if rect and rect[2] > 8 and rect[3] > 8:
            return cap.grab_region(idx, rect)
    return cap.grab_monitor(idx)[0]


async def do_capture(trigger="manual", ask=True, question=""):
    """Capture -> broadcast image -> optionally run proxy AI."""
    global CURRENT_TASK
    try:
        await status("capture", trigger)
        img = await asyncio.to_thread(grab_current)
        b64, w, h, datauri = cap.encode_jpeg_b64(img, CFG.get("jpeg_quality", 88), CFG.get("max_image_dim", 2000))
        STATE["qnum"] += 1
        cid = uuid.uuid4().hex[:10]
        thumb = cap.encode_jpeg_b64(img, 55, 240)[3]
        STATE["last_capture"] = {"id": cid, "b64": b64, "w": w, "h": h, "ts": time.time()}
        log_card({"id": cid, "kind": "cap", "trigger": trigger, "qnum": STATE["qnum"],
                  "thumb": thumb, "ask": ask, "ts": time.time(), "answer": ""})
        await broadcast({"t": "capture", "id": cid, "image": datauri, "w": w, "h": h,
                         "trigger": trigger, "ask": ask, "qnum": STATE["qnum"]})
        if ask and ai_mode() == "proxy":
            if STATE["busy"]:
                await broadcast({"t": "error", "msg": "AI 正在生成中，本次截图未送答", "id": cid})
            else:
                CURRENT_TASK = asyncio.create_task(run_ai(cid, [b64], question, new_conv=True))
                if CFG.get("verify_profile"):
                    asyncio.create_task(run_verify(cid, [b64], question))
    except Exception as e:
        STATE["last_error"] = str(e)
        await broadcast({"t": "error", "msg": f"截图失败: {e}"})


async def run_ai(cid, image_b64s, question, new_conv=False):
    """Proxy-mode AI call with streaming. cid identifies the answer on client."""
    global CURRENT_TASK
    prov = aimod.provider_cfg(CFG)
    if not (prov["api_key"] and prov["base_url"] and prov["model"]):
        await broadcast({"t": "error", "msg": "代理模式未配置 API Key/模型", "id": cid})
        return
    if new_conv:
        HISTORY.clear()
    system = {"role": "system", "content": resolve_system()}
    if not HISTORY or HISTORY[0].get("role") != "system":
        HISTORY.insert(0, system)
    else:
        HISTORY[0] = system
    user_content = aimod.build_user_content(question, image_b64s)
    HISTORY.append({"role": "user", "content": user_content})
    # keep history bounded: last 8 user/assistant turns
    while len(HISTORY) > 17:
        # drop oldest non-system pair
        if len(HISTORY) > 2:
            del HISTORY[1:3]
        else:
            break
    STATE["busy"] = True
    await status("thinking", prov["name"] + "/" + prov["model"])
    # provider chain: primary first, then fallback profile if configured
    provs = [prov]
    fb = profile_prov(CFG.get("fallback_profile")) if CFG.get("fallback_profile") else None
    if fb and fb["api_key"] and fb["base_url"] and fb["model"]:
        provs.append(fb)
    full = []
    sent_done = False
    last_err = None
    try:
        for i, pv in enumerate(provs):
            if i:
                note = f"\n\n> ⚠ 主模型失败，已切换备选：{pv['name']}/{pv['model']}\n\n"
                full.append(note)
                await broadcast({"t": "chunk", "id": cid, "text": note})
                await status("thinking", pv["name"] + "/" + pv["model"])
            try:
                async for piece in aimod.stream_chat(HISTORY, pv):
                    full.append(piece)
                    await broadcast({"t": "chunk", "id": cid, "text": piece})
                sent_done = True
                break
            except asyncio.CancelledError:
                raise
            except Exception as e:
                last_err = e
        if sent_done:
            text = "".join(full) or "（模型没有返回内容）"
            HISTORY.append({"role": "assistant", "content": text})
            await broadcast({"t": "done", "id": cid})
        else:
            e = last_err or Exception("unknown")
            STATE["last_error"] = str(e)
            log_card_update(cid, answer="".join(full), error=str(e))
            await broadcast({"t": "error", "msg": f"AI 请求失败: {e}", "id": cid})
            # roll back the unanswered user message
            if HISTORY and HISTORY[-1].get("role") == "user":
                HISTORY.pop()
    except asyncio.CancelledError:
        log_card_update(cid, answer="".join(full), stopped=True)
        raise
    finally:
        if sent_done:
            text_done = "".join(full)
            log_card_update(cid, answer=text_done, done=True)
            kb_append(text_done)
        STATE["busy"] = False
        if CURRENT_TASK is asyncio.current_task():
            CURRENT_TASK = None
        await status("idle")


# ---------------- auto trigger ----------------

def make_watcher():
    auto_cfg = CFG.get("auto", {})
    tw, th = int(auto_cfg.get("thumb_w", 96)), int(auto_cfg.get("thumb_h", 54))

    def thumb_fn(img):
        return cap.thumb_gray(img, tw, th)

    watcher = cap.DiffWatcher(on_trigger=on_auto_trigger, cfg_getter=lambda: CFG,
                              grab_fn=grab_watch, thumb_fn=thumb_fn)

    def busy():
        return STATE["busy"] or CURRENT_TASK is not None and not CURRENT_TASK.done()
    watcher.busy_fn = busy
    return watcher


def on_auto_trigger():
    """Called from watcher thread -> schedule capture on the main loop."""
    if MAIN_LOOP is not None and MAIN_LOOP.is_running():
        asyncio.run_coroutine_threadsafe(do_capture("auto", ask=True), MAIN_LOOP)


WATCHER = None
MAIN_LOOP = None
HOTKEY = None


def on_hotkey(action):
    """Global hotkey fired on the exam PC -> capture or nav broadcast."""
    if MAIN_LOOP is None or not MAIN_LOOP.is_running():
        return
    if action == "capture":
        asyncio.run_coroutine_threadsafe(do_capture("hotkey", ask=True), MAIN_LOOP)
    elif action == "snap":
        asyncio.run_coroutine_threadsafe(do_capture("hotkey", ask=False), MAIN_LOOP)
    elif action.startswith("nav_"):
        asyncio.run_coroutine_threadsafe(broadcast({"t": "nav", "action": action}), MAIN_LOOP)


def hk_items():
    """Normalized hotkey items list, migrating legacy {enabled,trigger}."""
    hk = CFG.get("hotkey", {})
    items = hk.get("items")
    if isinstance(items, list):
        return [{"action": i.get("action", "capture"), "trigger": i.get("trigger", "")} for i in items]
    if hk.get("enabled") and hk.get("trigger"):  # legacy single binding
        return [{"action": "capture", "trigger": hk["trigger"]}]
    return []


def make_hotkey():
    l = hkmod.HotkeyListener(on_fire=on_hotkey)
    l.configure(hk_items())
    l.start()
    return l


@app.on_event("startup")
async def _startup():
    global WATCHER, MAIN_LOOP, HOTKEY
    MAIN_LOOP = asyncio.get_running_loop()
    WATCHER = make_watcher()
    WATCHER.start()
    HOTKEY = make_hotkey()
    ips = lan_ips()
    print("=" * 60)
    print(" examlink running")
    for ip in ips:
        print(f"  phone/PC -> http://{ip}:{CFG['port']}/?t={CFG['token']}")
    print(f"  token     -> {CFG['token']}")
    print("  auto mode ->", "ON" if CFG.get("auto", {}).get("enabled") else "off",
          "| ai_mode ->", ai_mode())
    print("=" * 60)


# ---------------- HTTP ----------------

# the SPA is a Vite build: hashed filenames under /assets make caching safe;
# index.html itself and top-level files stay no-cache so updates always land
DIST = BUNDLE / "frontend" / "dist"
NC = {"Cache-Control": "no-cache"}
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

# self-destructing service worker: browsers re-check /sw.js on navigation, so
# clients still running the legacy cached frontend clean up and reload once
SW_POISON = """
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.registration.unregister();
  const ks = await caches.keys();
  await Promise.all(ks.map(k => caches.delete(k)));
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => c.navigate(c.url));
})()));
"""


def _index_html() -> Response:
    return Response((DIST / "index.html").read_text(encoding="utf-8"),
                    media_type="text/html", headers=NC)


@app.get("/")
async def index():
    return _index_html()


# SPA client-side routes (vue-router history mode)
@app.get("/settings")
async def spa_settings():
    return _index_html()


@app.get("/sw.js")
async def service_worker():
    return Response(SW_POISON, media_type="application/javascript", headers=NC)


@app.get("/assets/{name}")
async def asset_file(name: str):
    p = (DIST / "assets" / name).resolve()
    if not str(p).startswith(str(DIST.resolve())) or not p.is_file():
        return JSONResponse({"error": "not found"}, status_code=404)
    # vite emits content-hashed filenames — safe to cache forever
    return FileResponse(p, headers=IMMUTABLE)


@app.get("/manifest.webmanifest")
async def manifest():
    return FileResponse(DIST / "manifest.webmanifest",
                        media_type="application/manifest+json", headers=NC)


@app.get("/icons/{name}")
async def icon_file(name: str):
    p = (DIST / "icons" / name).resolve()
    if not str(p).startswith(str(DIST.resolve())) or not p.is_file():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(p, headers=NC)


@app.get("/api/state")
async def api_state(request: Request):
    if not auth(request):
        return JSONResponse({"error": "bad token"}, status_code=403)
    return public_state()


@app.get("/api/frame.jpg")
async def api_frame(request: Request):
    if not auth(request):
        return JSONResponse({"error": "bad token"}, status_code=403)
    use_roi = request.query_params.get("roi") == "1"
    img = await asyncio.to_thread(grab_monitor_full, use_roi)
    b, w, h = cap.encode_jpeg(img, CFG.get("jpeg_quality", 88), CFG.get("max_image_dim", 2000))
    return Response(content=b, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


def grab_monitor_full(use_roi=False):
    img, mon = cap.grab_monitor(cap.effective_index(CFG.get("monitor")))
    roi = CFG.get("roi")
    if use_roi and roi:
        rect = cap.norm_to_pixels(roi, mon)
        if rect:
            img = img.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]))
    return img


@app.get("/preview.mjpg")
async def preview_mjpg(request: Request):
    if not auth(request):
        return JSONResponse({"error": "bad token"}, status_code=403)

    async def gen():
        boundary = b"frame"
        while True:
            try:
                img = await asyncio.to_thread(grab_monitor_full)
                # small preview: cap width ~960 for bandwidth
                w, h = img.size
                scale = min(1.0, 960 / w)
                if scale < 1.0:
                    img = img.resize((int(w * scale), int(h * scale)))
                b, _, _ = cap.encode_jpeg(img, 70, 960)
                yield (b"--" + boundary + b"\r\nContent-Type: image/jpeg\r\n\r\n" + b + b"\r\n")
            except Exception:
                pass
            await asyncio.sleep(0.33)  # ~3fps

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/qr.png")
async def api_qr(request: Request):
    if not auth(request):
        return JSONResponse({"error": "bad token"}, status_code=403)
    try:
        import qrcode
        from io import BytesIO
        url = public_state()["urls"][0]
        qr = qrcode.make(url)
        buf = BytesIO()
        qr.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")
    except ImportError:
        return JSONResponse({"error": "qrcode not installed"}, status_code=500)


# ---------------- websocket ----------------

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    token = ws.query_params.get("token") or ws.query_params.get("t")
    if token != CFG["token"]:
        await ws.close(code=4401)
        return
    await ws.accept()
    CLIENTS.add(ws)
    try:
        await ws.send_text(json.dumps({"t": "state", **public_state()}, ensure_ascii=False))
        if CARD_LOG:
            await ws.send_text(json.dumps(
                {"t": "history", "cards": list(CARD_LOG), "qnum": STATE["qnum"]},
                ensure_ascii=False))
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            await handle_msg(ws, msg)
    except WebSocketDisconnect:
        pass
    finally:
        CLIENTS.discard(ws)


async def handle_msg(ws, msg):
    t = msg.get("t")
    if t == "ping":
        await ws.send_text(json.dumps({"t": "pong"}))
    elif t == "capture":
        await do_capture("manual", ask=bool(msg.get("ask", True)), question=msg.get("q", ""))
    elif t == "ask":
        # follow-up / general ask. images: optional list of b64 (phone may reuse last capture)
        images = msg.get("images") or []
        q = msg.get("q", "")
        if ai_mode() != "proxy":
            await ws.send_text(json.dumps({"t": "error", "msg": "当前为直连模式，请在本机浏览器中直接调用模型"}))
            return
        if STATE["busy"]:
            await ws.send_text(json.dumps({"t": "error", "msg": "AI 正在生成中，请稍后再试"}))
            return
        cid = uuid.uuid4().hex[:10]
        STATE["busy"] = True
        log_card({"id": cid, "kind": "ask", "q": (q or "")[:80],
                  "qnum": STATE["qnum"], "ts": time.time(), "answer": ""})
        global CURRENT_TASK
        CURRENT_TASK = asyncio.create_task(run_ai(cid, images, q, new_conv=bool(msg.get("new"))))
        await ws.send_text(json.dumps({"t": "ask_ack", "id": cid, "qnum": STATE["qnum"]}))
    elif t == "set":
        patch = msg.get("patch", {})
        apply_patch(patch)
        await broadcast({"t": "state", **public_state()})
    elif t == "clear":
        HISTORY.clear()
        CARD_LOG.clear()
        STATE["qnum"] = 0
        _hist_save()
        await broadcast({"t": "cleared"})
    elif t == "abort":
        if CURRENT_TASK and not CURRENT_TASK.done():
            CURRENT_TASK.cancel()
        await status("idle")
    elif t == "shutdown":
        await broadcast({"t": "bye"})
        os._exit(0)
    elif t == "state":
        await ws.send_text(json.dumps({"t": "state", **public_state()}, ensure_ascii=False))


def apply_patch(patch):
    """Apply whitelisted config updates."""
    global CURRENT_TASK
    prof_name = patch.pop("profile", None)
    if prof_name:
        prof = CFG.get("profiles", {}).get(prof_name)
        if prof:
            CFG.setdefault("proxy", {}).update({
                "provider": "custom",
                "custom_name": prof.get("label", prof_name),
                "base_url": prof.get("base_url", ""),
                "api_key": prof.get("api_key", ""),
                "model": prof.get("model", ""),
            })
            CFG["active_profile"] = prof_name
    for k, v in patch.items():
        if k == "auto" and isinstance(v, dict):
            CFG.setdefault("auto", {}).update(v)
        elif k == "proxy" and isinstance(v, dict):
            CFG.setdefault("proxy", {}).update(v)
        elif k == "scenes" and isinstance(v, dict):
            ov = CFG.setdefault("scenes", {})
            for sid, prompt in v.items():
                if prompt:
                    ov[sid] = prompt
                else:
                    ov.pop(sid, None)
        elif k == "hotkey" and isinstance(v, dict):
            CFG["hotkey"] = v
            if HOTKEY:
                HOTKEY.configure(hk_items())
        elif k in ("monitor", "roi", "scene", "ai_mode", "port", "jpeg_quality", "max_image_dim", "custom_prompt", "knowledge", "kb_auto_append", "verify_profile", "fallback_profile"):
            CFG[k] = v
    save_config(CFG)
    # restart watcher if poll params changed is unnecessary (read each loop)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=CFG["port"], log_level="warning")
