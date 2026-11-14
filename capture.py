"""Screen capture + pixel-diff change detection.

Design borrowed from:
- PrepPro/windows-server/capture.py : Windows DPI awareness, mss monitor grab
- ScreenCapture/screencapture/capture.py : cheap change detection on downscaled thumb
- Peekaboo client/src/main/capture/capture.js : MAE diff idea, but with ROI + stability
"""

import ctypes
import io
import threading
import time

import mss
import numpy as np
from PIL import Image


def _set_dpi_awareness():
    """Windows: make mss return physical pixels, not scaled logical ones."""
    if not hasattr(ctypes, "windll"):
        return
    try:
        # PROCESS_PER_MONITOR_DPI_AWARE = 2
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


_set_dpi_awareness()

_sct = mss.mss()


def monitors():
    """Return list of monitor dicts; index 0 is the 'all monitors' union."""
    return _sct.monitors


def primary_monitor():
    for i, m in enumerate(_sct.monitors):
        if i > 0 and m.get("is_primary"):
            return m
    return _sct.monitors[1] if len(_sct.monitors) > 1 else _sct.monitors[0]


def primary_index():
    for i, m in enumerate(_sct.monitors):
        if i > 0 and m.get("is_primary"):
            return i
    return 1 if len(_sct.monitors) > 1 else 0


def effective_index(monitor_index):
    """None/invalid -> primary monitor index."""
    mons = _sct.monitors
    if monitor_index and 1 <= int(monitor_index) < len(mons):
        return int(monitor_index)
    return primary_index()


def grab_monitor(monitor_index=1):
    """Grab one monitor as a PIL Image (BGRA -> RGB)."""
    mons = _sct.monitors
    idx = monitor_index if 1 <= monitor_index < len(mons) else 1
    mon = mons[idx]
    shot = _sct.grab(mon)
    img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
    return img, mon


def grab_region(monitor_index, rect):
    """Grab a sub-rect (left, top, w, h in physical px) of a monitor."""
    mons = _sct.monitors
    idx = monitor_index if 1 <= monitor_index < len(mons) else 1
    mon = mons[idx]
    box = {
        "left": int(mon["left"] + rect[0]),
        "top": int(mon["top"] + rect[1]),
        "width": max(1, int(rect[2])),
        "height": max(1, int(rect[3])),
    }
    shot = _sct.grab(box)
    img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
    return img


def norm_to_pixels(roi_norm, mon):
    """Normalized [x0,y0,x1,y1] fractions -> pixel rect within monitor."""
    if not roi_norm:
        return None
    x0, y0, x1, y1 = roi_norm
    left = int(mon["left"] + x0 * mon["width"])
    top = int(mon["top"] + y0 * mon["height"])
    right = int(mon["left"] + x1 * mon["width"])
    bottom = int(mon["top"] + y1 * mon["height"])
    return (left - mon["left"], top - mon["top"], right - left, bottom - top)


def thumb_gray(img, w=96, h=54):
    """Small grayscale numpy array for cheap diffing."""
    t = img.convert("L").resize((w, h), Image.BILINEAR)
    return np.asarray(t, dtype=np.float32)


def mae(a, b):
    return float(np.mean(np.abs(a - b)))


def encode_jpeg(img, quality=88, max_dim=2000):
    """PIL Image -> (jpeg_bytes, width, height). Downscales if needed."""
    w, h = img.size
    scale = min(1.0, max_dim / max(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        w, h = img.size
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue(), w, h


def encode_jpeg_b64(img, quality=88, max_dim=2000):
    data, w, h = encode_jpeg(img, quality, max_dim)
    import base64
    return base64.b64encode(data).decode(), w, h, f"data:image/jpeg;base64,{base64.b64encode(data).decode()}"


class DiffWatcher:
    """Polls a screen region and fires on_trigger() when content stabilizes
    after a change. Runs in a daemon thread; state mutated via methods.

    - diff computed only inside ROI (or full screen when roi is None)
    - 'stable': content unchanged for stable_ms after last detected change
    - cooldown: minimum seconds between triggers
    - busy_fn: callable returning True while an AI request is in flight
    """

    def __init__(self, on_trigger, cfg_getter, grab_fn, thumb_fn):
        self.on_trigger = on_trigger
        self.cfg_getter = cfg_getter      # () -> dict with auto settings + monitor + roi
        self.grab_fn = grab_fn            # () -> PIL.Image of watched area
        self.thumb_fn = thumb_fn          # (img) -> np.ndarray
        self._stop = False
        self._dirty_since = None
        self._last_change = 0.0
        self._last_trigger = 0.0
        self._prev = None
        self._thread = None

    def start(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def stop(self):
        self._stop = True

    def _loop(self):
        while not self._stop:
            cfg = self.cfg_getter()
            auto = cfg.get("auto", {})
            enabled = auto.get("enabled", False)
            poll = max(0.3, auto.get("poll_ms", 900) / 1000.0)
            if not enabled:
                self._prev = None
                self._dirty_since = None
                time.sleep(1.0)
                continue
            try:
                img = self.grab_fn()
                cur = self.thumb_fn(img)
                if self._prev is None:
                    self._prev = cur
                    time.sleep(poll)
                    continue
                diff = mae(cur, self._prev)
                self._prev = cur
                now = time.time()
                threshold = float(auto.get("threshold", 5.0))
                if diff > threshold:
                    self._last_change = now
                    self._dirty_since = self._dirty_since or now
                stable_ms = float(auto.get("stable_ms", 1500)) / 1000.0
                cooldown = float(auto.get("cooldown_s", 3))
                stable_for = now - self._last_change
                cooled = now - self._last_trigger >= cooldown
                if (self._dirty_since is not None
                        and stable_for >= stable_ms
                        and cooled
                        and not self._busy()):
                    self._last_trigger = now
                    self._dirty_since = None
                    self.on_trigger()
            except Exception:
                pass
            time.sleep(poll)

    def _busy(self):
        fn = getattr(self, "busy_fn", None)
        return bool(fn and fn())

    busy_fn = None
