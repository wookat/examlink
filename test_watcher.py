"""Functional test for the baseline-relative DiffWatcher.

Simulates: static → slow crossfade to a new 'question' → static → tiny clock
noise → instant big change. Asserts exactly 2 triggers (fade end + instant).
"""
import sys, time, threading
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, ".")
import capture as cap

W, H = 320, 180

def screen_A(blend=0.0):
    """Question A: dark bg + bright text band; blends toward screen B."""
    a = Image.new("RGB", (W, H), (18, 18, 24))
    b = Image.new("RGB", (W, H), (240, 240, 235))
    da, db = ImageDraw.Draw(a), ImageDraw.Draw(b)
    da.rectangle([30, 40, 200, 60], fill=(220, 220, 230))   # question text
    da.rectangle([30, 80, 120, 95], fill=(120, 120, 140))   # options
    db.rectangle([40, 30, 260, 55], fill=(20, 20, 30))      # new question text
    db.rectangle([40, 75, 180, 90], fill=(90, 90, 110))
    if blend <= 0: return a
    if blend >= 1: return b
    return Image.blend(a, b, blend)

def with_clock(img, tick):
    img = img.copy()
    d = ImageDraw.Draw(img)
    # 18x18 'clock' flicker top-right corner — under both thresholds
    d.rectangle([290, 8, 308, 26], fill=(255, 0, 0) if tick % 2 else (0, 120, 0))
    return img

frames = []
frames += [screen_A()] * 2                     # settle on A (baseline)
frames += [screen_A(i / 6.0) for i in range(1, 7)]  # 6-step slow fade A→B
frames += [screen_A(1.0)] * 3                  # hold on B — trigger #1 expected
frames += [with_clock(screen_A(1.0), t) for t in range(4)]  # clock noise only
frames += [with_clock(screen_A(1.0), 1)] * 2
# instant big change: brand-new layout
c = Image.new("RGB", (W, H), (10, 30, 60))
dc = ImageDraw.Draw(c)
dc.rectangle([10, 100, 300, 150], fill=(240, 240, 240))
frames += [c] * 6                              # trigger #2 expected

i = {"n": 0}
def grab():
    f = frames[min(i["n"], len(frames) - 1)]
    i["n"] += 1
    return f

triggers = []
w = cap.DiffWatcher(
    on_trigger=lambda: triggers.append((time.time(), i["n"])),
    cfg_getter=lambda: {"auto": {"enabled": True, "poll_ms": 250,
                                 "stable_ms": 200, "cooldown_s": 0.3,
                                 "change_ratio": 0.02}},
    grab_fn=grab, thumb_fn=cap.sig_of)

t0 = time.time()
w.start()
time.sleep(5.5)
w.stop()

print("ticks:", i["n"], "triggers:", len(triggers), [n for _, n in triggers])
assert len(triggers) == 2, f"expected 2 triggers, got {len(triggers)}"
print("PASS — fade trigger at tick ~%d, instant trigger at tick ~%d" %
      (triggers[0][1], triggers[1][1]))
