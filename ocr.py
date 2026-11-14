"""Best-effort question-number OCR via RapidOCR (onnxruntime, on-device).

Lazy singleton — the ~15MB ONNX models load on first use and stay resident.
Everything fails open: if the engine or models are unavailable the caller
just gets None and falls back to the internal counter.
"""

import re
import threading

import numpy as np

_engine = None
_broken = False
_lock = threading.Lock()


def _get_engine():
    global _engine, _broken
    if _broken:
        return None
    with _lock:
        if _engine is None and not _broken:
            try:
                from rapidocr_onnxruntime import RapidOCR
                _engine = _make_engine()
            except Exception:
                _broken = True
                return None
        return _engine


def _make_engine():
    """Build RapidOCR with onnxruntime capped at 2 intra-op threads.

    OrtInferSession leaves intra_op_num_threads unset → onnxruntime grabs
    EVERY physical core, so each ~2s OCR pass freezes the exam machine.
    Patching the SessionOptions factory before engine init caps all three
    sessions (det/rec/cls) without touching site-packages."""
    try:
        import rapidocr_onnxruntime.utils as ru
        real_so = ru.SessionOptions

        def _limited():
            o = real_so()
            o.intra_op_num_threads = 2
            o.inter_op_num_threads = 1
            return o

        ru.SessionOptions = _limited
    except Exception:
        pass
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR()


# "第13题", "13.", "13、", "13/60", "13 :" — take the first plausible number
_QNUM_RE = re.compile(r"第\s*(\d{1,3})\s*题|(\d{1,3})\s*/\s*\d{1,3}|^\s*(\d{1,3})\s*[\.、．:：]")


def ocr_lines(img):
    """[(box, text, score)] for the whole image; [] when engine is down."""
    eng = _get_engine()
    if eng is None:
        return []
    try:
        res, _elapse = eng(np.asarray(img.convert("RGB")))
    except Exception:
        return []
    out = []
    for item in (res or []):
        if len(item) < 3:
            continue
        try:
            out.append((item[0], str(item[1]), float(item[2])))
        except (TypeError, ValueError):
            continue
    return out


def question_number(img):
    """Parse the real question number from the captured frame.

    Scans only the top ~30% of the image where exam platforms put their
    question index headers — cheaper and far less error-prone than the
    full frame. Returns int or None.
    """
    w, h = img.size
    strip = img.crop((0, 0, w, max(1, int(h * 0.3))))
    for _box, txt, score in ocr_lines(strip):
        if score < 0.45:
            continue
        m = _QNUM_RE.search(txt.strip())
        if m:
            for g in m.groups():
                if g:
                    n = int(g)
                    if 0 < n <= 500:
                        return n
    return None
