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
import json
import os
import socket
import sys
import time
import uuid
from pathlib import Path

import capture as cap
import ai as aimod
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

BASE = Path(__file__).resolve().parent
CONFIG_PATH = BASE / "config.json"
WEB = BASE / "web"

app = FastAPI()

# ---------------- config / state ----------------

def load_config():
    example = BASE / "config.example.json"
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
STATE = {
    "busy": False,
    "last_capture": None,
    "last_error": None,
    "started": time.time(),
}
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
        "ai_mode": ai_mode(),
        "proxy": {"provider": pc["name"], "model": pc["model"], "configured": bool(pc["api_key"] and pc["base_url"] and pc["model"])},
        "active_profile": CFG.get("active_profile"),
        "profiles": {n: {"label": p.get("label", n), "model": p.get("model", "")}
                     for n, p in CFG.get("profiles", {}).items()},
        "busy": STATE["busy"],
        "providers": {k: {"name": v["name"], "base_url": v["base_url"], "models": v["models"]}
                      for k, v in aimod.PROVIDERS.items()},
        "scenes": aimod.SCENES,
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
        cid = uuid.uuid4().hex[:10]
        STATE["last_capture"] = {"id": cid, "b64": b64, "w": w, "h": h, "ts": time.time()}
        await broadcast({"t": "capture", "id": cid, "image": datauri, "w": w, "h": h,
                         "trigger": trigger, "ask": ask})
        if ask and ai_mode() == "proxy":
            CURRENT_TASK = asyncio.create_task(run_ai(cid, [b64], question, new_conv=True))
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
    system = {"role": "system", "content": aimod.scene_prompt(CFG.get("scene", "general"))}
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
    full = []
    try:
        async for piece in aimod.stream_chat(HISTORY, prov):
            full.append(piece)
            await broadcast({"t": "chunk", "id": cid, "text": piece})
        text = "".join(full) or "（模型没有返回内容）"
        HISTORY.append({"role": "assistant", "content": text})
        await broadcast({"t": "done", "id": cid})
    except Exception as e:
        STATE["last_error"] = str(e)
        await broadcast({"t": "error", "msg": f"AI 请求失败: {e}", "id": cid})
        # roll back the unanswered user message
        if HISTORY and HISTORY[-1].get("role") == "user":
            HISTORY.pop()
    finally:
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


@app.on_event("startup")
async def _startup():
    global WATCHER, MAIN_LOOP
    MAIN_LOOP = asyncio.get_running_loop()
    WATCHER = make_watcher()
    WATCHER.start()
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

@app.get("/")
async def index():
    return FileResponse(WEB / "index.html")


@app.get("/app.js")
async def app_js():
    return FileResponse(WEB / "app.js", media_type="application/javascript")


@app.get("/style.css")
async def style_css():
    return FileResponse(WEB / "style.css", media_type="text/css")


@app.get("/api/state")
async def api_state(request: Request):
    if not auth(request):
        return JSONResponse({"error": "bad token"}, status_code=403)
    return public_state()


@app.get("/api/frame.jpg")
async def api_frame(request: Request):
    if not auth(request):
        return JSONResponse({"error": "bad token"}, status_code=403)
    img = await asyncio.to_thread(grab_monitor_full)
    b, w, h = cap.encode_jpeg(img, CFG.get("jpeg_quality", 88), CFG.get("max_image_dim", 2000))
    return Response(content=b, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


def grab_monitor_full():
    return cap.grab_monitor(cap.effective_index(CFG.get("monitor")))[0]


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
        cid = uuid.uuid4().hex[:10]
        STATE["busy"] = True
        global CURRENT_TASK
        CURRENT_TASK = asyncio.create_task(run_ai(cid, images, q, new_conv=bool(msg.get("new"))))
        await ws.send_text(json.dumps({"t": "ask_ack", "id": cid}))
    elif t == "set":
        patch = msg.get("patch", {})
        apply_patch(patch)
        await broadcast({"t": "state", **public_state()})
    elif t == "clear":
        HISTORY.clear()
        await ws.send_text(json.dumps({"t": "cleared"}))
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
        elif k in ("monitor", "roi", "scene", "ai_mode", "port", "jpeg_quality", "max_image_dim"):
            CFG[k] = v
    save_config(CFG)
    # restart watcher if poll params changed is unnecessary (read each loop)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=CFG["port"], log_level="warning")
