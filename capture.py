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


_SIG = 64     # signature side length — sampled, not resized
_NOISE = 12   # per-pixel luma floor: kills AA redraws and codec jitter


def sig_of(img, size=_SIG):
    """64x64 luma signature sampled directly off the PIL image (strided,
    no resize pass). ScreenQA showed buffer-level sampling is ~5x cheaper
    than convert+resize; sampling a PIL array gets the same signature."""
    arr = np.asarray(img.convert("RGB"), dtype=np.uint8)
    h, w = arr.shape[:2]
    ys = np.linspace(0, h - 1, size).astype(np.intp)
    xs = np.linspace(0, w - 1, size).astype(np.intp)
    sub = arr[np.ix_(ys, xs)].astype(np.uint32)
    lum = (sub[:, :, 0] * 77 + sub[:, :, 1] * 150 + sub[:, :, 2] * 29) >> 8
    return lum.astype(np.int16)


def diff_ratio(a, b):
    """Fraction of sampled pixels whose luma moved by more than _NOISE."""
    if a is None or b is None:
        return 1.0
    return float(np.mean(np.abs(a.astype(np.int32) - b.astype(np.int32)) > _NOISE))


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
    """Baseline-relative change detector (twin-comparison style, after video
    shot-boundary detection + ScreenQA's fingerprint watcher).

    - baseline: signature of the last answered frame. Manual captures rebase
      it via note_captured() so the same screen never double-fires.
    - changed: diff_ratio(cur, baseline) > change_ratio. Because the
      comparison is against the baseline, drift ACCUMULATES — slow fades /
      smooth question scrolls always pass the threshold eventually.
    - motion: diff_ratio(cur, prev) > motion_ratio — only used to tell when
      the screen has gone quiet again.
    - fires when changed && quiet for stable_ms && cooldown && !busy.
    """

    def __init__(self, on_trigger, cfg_getter, grab_fn, thumb_fn):
        self.on_trigger = on_trigger
        self.cfg_getter = cfg_getter      # () -> dict with auto settings + monitor + roi
        self.grab_fn = grab_fn            # () -> PIL.Image of watched area
        self.thumb_fn = thumb_fn          # (img) -> np.ndarray signature
        self._stop = False
        self._prev = None
        self._baseline = None
        self._noise_ema = None    # ambient frame-to-frame ratio tracker
        self._still_since = time.time()
        self._last_trigger = 0.0
        self._thread = None

    def start(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def stop(self):
        self._stop = True

    def note_captured(self, img):
        """Any capture (manual / ask / hotkey / auto) rebases the detector so
        the same screen never triggers a second pass."""
        try:
            sig = self.thumb_fn(img)
            self._baseline = sig
            self._prev = sig
            self._still_since = time.time()
            self._last_trigger = time.time()   # doubles as cooldown
        except Exception:
            pass

    def _loop(self):
        while not self._stop:
            cfg = self.cfg_getter()
            auto = cfg.get("auto", {})
            enabled = auto.get("enabled", False)
            poll = max(0.25, auto.get("poll_ms", 900) / 1000.0)
            if not enabled:
                self._prev = self._baseline = None
                time.sleep(1.0)
                continue
            try:
                img = self.grab_fn()
                cur = self.thumb_fn(img)
                now = time.time()
                if self._prev is None:
                    self._prev = self._baseline = cur
                    self._still_since = now
                    time.sleep(poll)
                    continue
                th = float(auto.get("change_ratio", auto.get("threshold", 0.015)))
                if th >= 1.0:
                    th = 0.015    # legacy MAE-scale value → sane ratio default
                changed = diff_ratio(cur, self._baseline) > th
                d_prev = diff_ratio(cur, self._prev)
                # adaptive stillness floor: ambient desktop noise (clock,
                # wallpaper, animations) must not count as "still moving".
                # EMA tracks noise only while the screen is NOT in a change.
                motion_th = float(auto.get(
                    "motion_ratio", max(0.004, (self._noise_ema or 0.0) * 2.5, th * 0.4)))
                moving = d_prev > motion_th
                if not changed:
                    self._noise_ema = (d_prev if self._noise_ema is None
                                       else self._noise_ema * 0.9 + d_prev * 0.1)
                self._prev = cur
                if moving:
                    self._still_since = now
                stable_ms = float(auto.get("stable_ms", 1500)) / 1000.0
                cooldown = float(auto.get("cooldown_s", 3))
                if (changed
                        and now - self._still_since >= stable_ms
                        and now - self._last_trigger >= cooldown
                        and not self._busy()):
                    self._last_trigger = now
                    self._baseline = cur
                    self._prev = cur
                    self._still_since = now
                    self.on_trigger()
            except Exception:
                pass
            time.sleep(poll)

    def _busy(self):
        fn = getattr(self, "busy_fn", None)
        return bool(fn and fn())

    busy_fn = None
