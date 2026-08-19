// Keyboard/mouse and touch, unified into one input state the loop polls.
// Touch is a first-class mode: left-thumb joystick, right-half look-drag,
// dedicated fire/dash/jump/reload buttons, and the HUD stays out of thumb zones.

export class Input {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.state = { x: 0, y: 0, jump: false, dash: false, crouch: false, fire: false, reload: false, _jumpHeld: false, _dashHeld: false };
    this.look = { dx: 0, dy: 0 };
    this.locked = false;
    // How someone is *playing*, not what the device claims it can do.
    // `"ontouchstart" in window` is true on any Windows box with a digitizer,
    // and latching on it drops a desktop into touch mode - which gates mouse
    // look off and, because poll() skips the keyboard there, movement too.
    // A machine with a fine pointer available is a mouse machine until
    // someone actually touches the screen; real events correct it both ways.
    this.isTouch = matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
    this._lastTouchAt = 0;
    // Set while the game wants the pointer captured, kept separate from
    // `locked` so a refused request stays *wanted* and stays visible.
    this.wantLock = false;
    this.mouseSens = 0.0022;
    this.touchSens = 0.0045;
    this.keys = new Set();
    this._onLockChange = () => { this.locked = document.pointerLockElement === canvas; };
    document.addEventListener("pointerlockchange", this._onLockChange);

    if (this.isTouch) document.body.classList.add("touch");
    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch(hud);          // touch listeners only; inert under a mouse
    this._bindModeSwitch();
  }

  /** Ask for the pointer. Chrome refuses this whenever the request did not come
   *  from a user gesture, and for about a second after the player pressed Esc -
   *  both silently. The previous retry-on-a-timer could never have worked: a
   *  timer callback carries no gesture, so Chrome refuses it for the very same
   *  reason. The *want* is recorded instead, `lockLost` makes it visible, and
   *  the player next click on the canvas satisfies it inside a real gesture. */
  requestLock() {
    this.wantLock = true;
    if (this.isTouch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});   // stays wanted; the next click retries
    } catch { /* unavailable in iframes and some emulated environments */ }
  }

  releaseLock() {
    this.wantLock = false;
    if (this.locked) document.exitPointerLock?.();
  }

  /** The game wants mouse look and does not have it. This is the state that
   *  stranded a player with working WASD, dead aim and no explanation. */
  get lockLost() { return this.wantLock && !this.locked && !this.isTouch; }

  /** Whoever actually touches the glass or moves a mouse picks the scheme. */
  _setTouch(on) {
    if (this.isTouch === on) return;
    this.isTouch = on;
    document.body.classList.toggle("touch", on);
    this.look.dx = 0; this.look.dy = 0;
    this.state.x = 0; this.state.y = 0;
  }

  _bindModeSwitch() {
    window.addEventListener("touchstart", () => {
      this._lastTouchAt = performance.now();
      this._setTouch(true);
    }, { passive: true, capture: true });
    // A tap synthesises a mouse event a moment later. Ignoring that echo stops
    // every tap on a phone from flipping the game back to mouse controls.
    const byMouse = () => { if (performance.now() - this._lastTouchAt > 900) this._setTouch(false); };
    window.addEventListener("mousedown", byMouse, { capture: true });
    window.addEventListener("mousemove", (e) => { if (e.movementX || e.movementY) byMouse(); }, { capture: true });
  }

  _bindKeyboard() {
    const map = { KeyW: "f", KeyS: "b", KeyA: "l", KeyD: "r", ArrowUp: "f", ArrowDown: "b", ArrowLeft: "l", ArrowRight: "r" };
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") { e.preventDefault(); this.state.jump = true; }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.state.dash = true;
      if (e.code === "KeyR") this.state.reload = true;
      if (map[e.code]) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Space") this.state.jump = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.state.dash = false;
    });
    window.addEventListener("blur", () => { this.keys.clear(); this.state.fire = false; });
  }

  _bindMouse() {
    // Fire on every left press. Requesting lock and firing are independent — if
    // pointer lock is unavailable (iframes, some browsers) you can still shoot.
    this.canvas.addEventListener("mousedown", (e) => { if (e.button === 0) { if (!this.locked && !this.isTouch) this.requestLock(); this.state.fire = true; } });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) this.state.fire = false; });
    window.addEventListener("mousemove", (e) => { if (this.locked) { this.look.dx += e.movementX; this.look.dy += e.movementY; } });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  _bindTouch(hud) {
    const joy = hud.querySelector("#joy"), knob = joy?.querySelector("i");
    if (!joy || !knob) return;      // bound unconditionally now, so tolerate a HUD without them
    const R = 48;
    let joyId = null, joyCx = 0, joyCy = 0, lookId = null, lastX = 0, lastY = 0;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };

    const onStart = (e) => {
      for (const t of e.changedTouches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el && el.closest && el.closest(".tbtn")) continue;               // buttons handle themselves
        if (t.clientX < window.innerWidth * 0.45 && joyId === null) {
          joyId = t.identifier; joyCx = t.clientX; joyCy = t.clientY;
          const r = joy.getBoundingClientRect();
          // snap joystick base under the thumb for comfort
          joy.style.left = `${t.clientX - r.width / 2}px`; joy.style.bottom = "auto"; joy.style.top = `${t.clientY - r.height / 2}px`;
        } else if (lookId === null) { lookId = t.identifier; lastX = t.clientX; lastY = t.clientY; }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = t.clientX - joyCx, dy = t.clientY - joyCy;
          const len = Math.hypot(dx, dy); if (len > R) { dx = dx / len * R; dy = dy / len * R; }
          this.state.x = dx / R; this.state.y = -dy / R; setKnob(dx, dy);
        } else if (t.identifier === lookId) {
          this.look.dx += (t.clientX - lastX) * (this.touchSens / this.mouseSens);
          this.look.dy += (t.clientY - lastY) * (this.touchSens / this.mouseSens);
          lastX = t.clientX; lastY = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { joyId = null; this.state.x = 0; this.state.y = 0; setKnob(0, 0); joy.style.left = ""; joy.style.top = ""; joy.style.bottom = ""; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    const surface = this.canvas;
    surface.addEventListener("touchstart", onStart, { passive: false });
    surface.addEventListener("touchmove", onMove, { passive: false });
    surface.addEventListener("touchend", onEnd); surface.addEventListener("touchcancel", onEnd);
    hud.addEventListener("touchstart", onStart, { passive: false });
    hud.addEventListener("touchmove", onMove, { passive: false });
    hud.addEventListener("touchend", onEnd); hud.addEventListener("touchcancel", onEnd);

    const btn = (id, down, up) => {
      const b = hud.querySelector(id);
      b.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
      b.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); up?.(); }, { passive: false });
      b.addEventListener("touchcancel", () => up?.());
    };
    btn("#btnFire", () => { this.state.fire = true; }, () => { this.state.fire = false; });
    btn("#btnDash", () => { this.state.dash = true; }, () => { this.state.dash = false; });
    btn("#btnJump", () => { this.state.jump = true; }, () => { this.state.jump = false; });
    btn("#btnReload", () => { this.state.reload = true; });
  }

  /** call once per frame; returns movement axes from keys merged with touch */
  poll() {
    if (!this.isTouch) {
      let x = 0, y = 0;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
      this.state.x = x; this.state.y = y;
      this.state.crouch = this.keys.has("ControlLeft") || this.keys.has("KeyC");
    }
    const s = { ...this.state };
    // one-shot edges
    s._jumpHeld = this._prevJump; this._prevJump = this.state.jump;
    s.dash = this.state.dash && !this._prevDash; this._prevDash = this.state.dash;
    s.reload = this.state.reload; this.state.reload = false;
    const look = { ...this.look }; this.look.dx = 0; this.look.dy = 0;
    return { s, look };
  }
}
