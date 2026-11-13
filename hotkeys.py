"""Global hotkey listener for the exam PC (pynput).

Trigger formats:
  "key:f9" / "key:print_screen" / "key:insert" / "key:pause"
  "mouse:middle" / "mouse:x1" / "mouse:x2"
  "combo:ctrl+shift+q"  (ctrl/alt/shift/win + a key)

Callback is invoked on the listener thread; main.py marshals it onto
the asyncio loop via run_coroutine_threadsafe.
"""

import threading

TRIGGER_CHOICES = {
    "": "关闭",
    "key:f9": "F9",
    "key:f10": "F10",
    "key:print_screen": "Print Screen",
    "key:insert": "Insert",
    "key:pause": "Pause",
    "mouse:middle": "鼠标中键",
    "mouse:x1": "鼠标侧键 X1",
    "mouse:x2": "鼠标侧键 X2",
    "combo:ctrl+shift+q": "Ctrl+Shift+Q",
    "combo:ctrl+shift+s": "Ctrl+Shift+S",
}


class HotkeyListener:
    def __init__(self, on_fire):
        self.on_fire = on_fire
        self._trigger = None
        self._mouse = None
        self._keyboard = None
        self._pressed = set()
        self._lock = threading.Lock()

    def configure(self, trigger):
        with self._lock:
            self._trigger = trigger or ""
        self._sync()

    def start(self):
        try:
            from pynput import mouse, keyboard
            self._mouse = mouse.Listener(on_click=self._on_click)
            self._keyboard = keyboard.Listener(on_press=self._on_press, on_release=self._on_release)
            self._mouse.daemon = True
            self._keyboard.daemon = True
            self._mouse.start()
            self._keyboard.start()
        except Exception:
            self._mouse = self._keyboard = None

    def stop(self):
        for l in (self._mouse, self._keyboard):
            try:
                if l:
                    l.stop()
            except Exception:
                pass
        self._mouse = self._keyboard = None

    def _sync(self):
        """Nothing to restart — listeners are always on; trigger check is cheap."""
        pass

    # ---- pynput callbacks (listener threads) ----
    def _on_click(self, x, y, button, pressed):
        t = self._trigger
        if not t or not pressed or not t.startswith("mouse:"):
            return
        want = t.split(":", 1)[1]
        name = getattr(button, "name", str(button))
        if name == want:
            self._fire()

    def _on_press(self, key):
        t = self._trigger
        if not t:
            return
        try:
            from pynput import keyboard
            canon = self._canon(key)
        except Exception:
            canon = None
        if canon:
            self._pressed.add(canon)
        if t.startswith("key:"):
            want = t.split(":", 1)[1]
            if canon == want:
                self._fire()
        elif t.startswith("combo:"):
            spec = t.split(":", 1)[1].split("+")
            mods, key_want = set(spec[:-1]), spec[-1]
            if canon == key_want and mods.issubset(self._pressed):
                self._fire()

    def _on_release(self, key):
        canon = self._canon(key)
        if canon:
            self._pressed.discard(canon)

    @staticmethod
    def _canon(key):
        """Normalize pynput Key/KeyCode to a simple name."""
        from pynput import keyboard
        if isinstance(key, keyboard.KeyCode):
            c = key.char
            if c:
                return c.lower()
            if key.vk:
                vk = key.vk
                # common virtual keys
                return {112 + i: f"f{i+1}" for i in range(24)}.get(vk) or {
                    44: "print_screen", 45: "insert", 46: "delete",
                    19: "pause", 36: "home", 35: "end", 33: "page_up", 34: "page_down",
                }.get(vk)
            return None
        name = getattr(key, "name", None) or str(key)
        name = name.lower().replace("key.", "")
        # unify modifier names
        if name in ("ctrl", "ctrl_l", "ctrl_r", "control"):
            return "ctrl"
        if name in ("shift", "shift_l", "shift_r"):
            return "shift"
        if name in ("alt", "alt_l", "alt_r", "alt_gr"):
            return "alt"
        if name in ("cmd", "cmd_l", "cmd_r", "super_l", "super_r", "win"):
            return "win"
        return name

    def _fire(self):
        try:
            self.on_fire()
        except Exception:
            pass
