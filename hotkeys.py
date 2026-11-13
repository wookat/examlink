"""Global hotkey listener for the exam PC (pynput).

Supports multiple (action, trigger) items. Actions:
  "capture"   — screenshot + AI answer
  "snap"      — screenshot only
  "nav_next" / "nav_prev" — jump to next/previous answer card on clients
  "nav_down" / "nav_up"   — scroll answer page on clients

Trigger formats:
  "key:f9" / "key:print_screen" / "key:insert" / "key:pause"
  "mouse:middle" / "mouse:x1" / "mouse:x2"
  "mouse:wheel_up" / "mouse:wheel_down"   (scroll wheel)
  "combo:ctrl+shift+q"  (ctrl/alt/shift/win + a key)

Callbacks fire on listener threads; main.py marshals onto the asyncio loop.
"""

import threading

TRIGGER_CHOICES = {
    "": "—",
    "key:f9": "F9",
    "key:f10": "F10",
    "key:f11": "F11",
    "key:print_screen": "Print Screen",
    "key:insert": "Insert",
    "key:pause": "Pause",
    "mouse:middle": "鼠标中键",
    "mouse:x1": "鼠标侧键X1",
    "mouse:x2": "鼠标侧键X2",
    "mouse:wheel_up": "滚轮上",
    "mouse:wheel_down": "滚轮下",
    "combo:ctrl+shift+q": "Ctrl+Shift+Q",
    "combo:ctrl+shift+s": "Ctrl+Shift+S",
    "combo:ctrl+shift+z": "Ctrl+Shift+Z",
    "combo:ctrl+shift+x": "Ctrl+Shift+X",
}

ACTIONS = {
    "capture": "截屏答题",
    "snap": "仅截图",
    "nav_next": "下一题",
    "nav_prev": "上一题",
    "nav_down": "向下滚",
    "nav_up": "向上滚",
}


class HotkeyListener:
    def __init__(self, on_fire):
        self.on_fire = on_fire          # (action: str) -> None
        self._items = {}                # trigger -> action
        self._mouse = None
        self._keyboard = None
        self._pressed = set()
        self._lock = threading.Lock()

    def configure(self, items):
        """items: list of {"action": str, "trigger": str}"""
        with self._lock:
            self._items = {i["trigger"]: i["action"] for i in items if i.get("trigger") and i.get("action")}

    def start(self):
        try:
            from pynput import mouse, keyboard
            self._mouse = mouse.Listener(on_click=self._on_click, on_scroll=self._on_scroll)
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

    # ---- pynput callbacks (listener threads) ----
    def _on_click(self, x, y, button, pressed):
        if not pressed:
            return
        name = "mouse:" + getattr(button, "name", str(button))
        self._try_fire(name)

    def _on_scroll(self, x, y, dx, dy):
        name = "mouse:wheel_up" if dy > 0 else "mouse:wheel_down"
        self._try_fire(name)

    def _on_press(self, key):
        canon = self._canon(key)
        if canon:
            self._pressed.add(canon)
        if canon:
            self._try_fire("key:" + canon)
            with self._lock:
                for trig, action in self._items.items():
                    if trig.startswith("combo:"):
                        spec = trig.split(":", 1)[1].split("+")
                        mods, key_want = set(spec[:-1]), spec[-1]
                        if canon == key_want and mods.issubset(self._pressed):
                            self._fire(action)

    def _on_release(self, key):
        canon = self._canon(key)
        if canon:
            self._pressed.discard(canon)

    def _try_fire(self, name):
        with self._lock:
            action = self._items.get(name)
        if action:
            self._fire(action)

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
                return {112 + i: f"f{i+1}" for i in range(24)}.get(vk) or {
                    44: "print_screen", 45: "insert", 46: "delete",
                    19: "pause", 36: "home", 35: "end", 33: "page_up", 34: "page_down",
                }.get(vk)
            return None
        name = getattr(key, "name", None) or str(key)
        name = name.lower().replace("key.", "")
        if name in ("ctrl", "ctrl_l", "ctrl_r", "control"):
            return "ctrl"
        if name in ("shift", "shift_l", "shift_r"):
            return "shift"
        if name in ("alt", "alt_l", "alt_r", "alt_gr"):
            return "alt"
        if name in ("cmd", "cmd_l", "cmd_r", "super_l", "super_r", "win"):
            return "win"
        return name

    def _fire(self, action):
        try:
            self.on_fire(action)
        except Exception:
            pass
