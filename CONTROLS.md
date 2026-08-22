# Two-thumb control bar (reusable pattern)

A bottom control bar split into thirds — hold the **left** third to turn
left, hold the **right** third to turn right, and the **middle** third is
dual-purpose: a quick tap fires, holding it thrusts. Used in
[`asteroids.html`](asteroids.html) and [`asteroids-2.html`](asteroids-2.html).
On a phone, held with both thumbs, it plays like a left/right stick plus a
fire button — the two-handed feel that's usually missing from browser
shooters on mobile.

Everything below is copied verbatim from `asteroids.html` (the plainer,
hand-rolled-canvas implementation — `asteroids-2.html`'s version is
functionally identical, it just also calls `Sound.ensureAudio()` at the
top of each `pointerdown` handler to unlock Web Audio on the first touch).
Building a new game with this bar: copy the three blocks below, keep the
element IDs (`#zoneLeft` / `#zoneMid` / `#zoneRight` / `#controlBar`), and
wire your own game state into the `setFlag`/`composeInput` calls.

Every defensive-looking line in here traces back to a real bug hit during
development, not a hypothetical — see the comment next to each one.

## 1. HTML skeleton

```html
<div class="control-bar" id="controlBar">
  <button type="button" class="zone zone-left" id="zoneLeft" aria-label="Turn left"><span class="zone-shape arrow-left" aria-hidden="true"></span></button>
  <button type="button" class="zone zone-mid" id="zoneMid" aria-label="Fire or hold to thrust">
    <span class="zone-shape fire-dot" aria-hidden="true"></span>
    <span class="zone-caption" aria-hidden="true">tap fire &middot; hold thrust</span>
  </button>
  <button type="button" class="zone zone-right" id="zoneRight" aria-label="Turn right"><span class="zone-shape arrow-right" aria-hidden="true"></span></button>
</div>
```

Real `<button>` elements (not `<div>`s) for free focus/semantics; the icons
are `aria-hidden` CSS shapes rather than text or emoji glyphs (see the CSS
comment below for why).

## 2. CSS

```css
.control-bar {
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: 420px;
  touch-action: none;
}

.zone {
  flex: 1;
  border: none;
  outline: none;
  background: var(--bg-2);
  color: var(--text);
  border-radius: 16px;
  height: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: none;         /* stop the browser from trying to pan/scroll on this element */
  -webkit-touch-callout: none; /* suppress the iOS long-press callout menu */
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;          /* stop the score/HUD text-selection-drag bug from applying here too */
  -webkit-user-drag: none;
  transition: background 0.1s, transform 0.08s;
}
.zone:active, .zone.active { background: #263449; transform: scale(0.97); }
.zone-mid { gap: 8px; }
.zone-caption { font-size: 0.62rem; font-weight: 600; color: var(--muted); }

/* Pure CSS shapes, zero text/image content - a mobile browser's
   double-tap-then-hold word-selection gesture (which shows a
   magnifier/loupe bubble - the "image popping up" artifact) needs
   actual text or image content to select. These shapes give it
   nothing to grab. */
.zone-shape { display: block; pointer-events: none; }
.zone-shape.arrow-left {
  width: 0; height: 0;
  border-top: 13px solid transparent;
  border-bottom: 13px solid transparent;
  border-right: 18px solid var(--text);
}
.zone-shape.arrow-right {
  width: 0; height: 0;
  border-top: 13px solid transparent;
  border-bottom: 13px solid transparent;
  border-left: 18px solid var(--text);
}
.zone-shape.fire-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--flame);
}
```

Note on the CSS above vs. the JS in the next section: the CSS
(`user-select`/`touch-callout`/zero-text icons) was the *first* line of
defense tried against the long-press magnifier bug and turned out **not**
to be sufficient on its own — keep it as legitimate defense-in-depth (it's
still what stops the separate "score text getting selected like a normal
paragraph" bug), but the actual fix for the magnifier is the `touchstart`
listener in the JS below.

## 3. JavaScript

```js
// ---- Input: composition ------------------------------------------------------
var touchLeft = false, touchRight = false, touchThrust = false;
var kbLeft = false, kbRight = false, kbThrust = false;
var HOLD_WATCHDOG_MS = 12000; // no legitimate hold needs to last this long

function composeInput() {
  state.input.left = touchLeft || kbLeft;
  state.input.right = touchRight || kbRight;
  state.input.thrust = touchThrust || kbThrust;
}

// Every hold-zone binder below registers its "force release" function here.
// A stuck-held button (the touch never gets a pointerup/pointercancel -
// e.g. the OS backgrounds the tab mid-touch, or a long-press triggers the
// browser's own text-selection/callout takeover) is fixed by calling all
// of these from the visibilitychange/blur handlers below, plus each zone
// also has its own watchdog timeout as a last-resort fallback.
var heldZoneResets = [];

// ---- Input: touch/pointer (three-zone bar) ------------------------------------------------------
// iOS Safari's native long-press-to-select gesture (the magnifier/loupe
// callout) is driven by its own touch gesture recognizer that runs
// independently of Pointer Events - CSS user-select/touch-callout alone
// doesn't reliably suppress it once an element also has active JS touch
// handling. The well-tested way to actually cancel it is a non-passive
// touchstart listener that calls preventDefault().
function suppressCallout(el) {
  el.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
}

function bindHoldZone(el, setFlag) {
  var activeId = null;
  var watchdogTimer = null;
  suppressCallout(el);

  function hardRelease() {
    if (activeId === null) return;
    activeId = null;
    clearTimeout(watchdogTimer);
    el.classList.remove('active');
    setFlag(false);
    composeInput();
  }

  el.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    // A pointerdown while activeId is already set means either a stale
    // session (the previous touch never got a pointerup/pointercancel -
    // exactly the "stuck button" case) or a second finger on the same
    // zone. Either way, release whatever's recorded and start fresh
    // rather than silently ignoring the new press - that silent-ignore
    // was why tapping a stuck button didn't fix it.
    hardRelease();
    activeId = e.pointerId;
    try { el.setPointerCapture(activeId); } catch (err) {}
    el.classList.add('active');
    setFlag(true);
    composeInput();
    clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(hardRelease, HOLD_WATCHDOG_MS);
  });
  function release(e) {
    if (e.pointerId !== activeId) return;
    hardRelease();
  }
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);

  heldZoneResets.push(hardRelease);
}

bindHoldZone(zoneLeft, function (v) { touchLeft = v; });
bindHoldZone(zoneRight, function (v) { touchRight = v; });

(function bindMidZone() {
  var activeId = null;
  var downX = 0, downY = 0;
  var holdTimer = null;
  var holdEngaged = false;
  var watchdogTimer = null;
  suppressCallout(zoneMid);

  function hardRelease() {
    if (activeId === null) return;
    activeId = null;
    zoneMid.classList.remove('active');
    clearTimeout(holdTimer);
    clearTimeout(watchdogTimer);
    if (holdEngaged) {
      touchThrust = false;
      composeInput();
    }
    holdEngaged = false;
  }

  zoneMid.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    // See bindHoldZone above: release any stale/stuck session instead of
    // silently ignoring the new press.
    hardRelease();
    activeId = e.pointerId;
    try { zoneMid.setPointerCapture(activeId); } catch (err) {}
    downX = e.clientX; downY = e.clientY;
    holdEngaged = false;
    zoneMid.classList.add('active');
    holdTimer = setTimeout(function () {
      holdEngaged = true;
      touchThrust = true;
      composeInput();
    }, HOLD_THRESHOLD_MS);
    clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(hardRelease, HOLD_WATCHDOG_MS);
  });

  function endPress(e, allowFire) {
    if (e.pointerId !== activeId) return;
    var wasHoldEngaged = holdEngaged;
    var dx = e.clientX - downX, dy = e.clientY - downY;
    var moved = Math.sqrt(dx * dx + dy * dy);
    hardRelease();
    if (!wasHoldEngaged && allowFire && moved < TAP_MAX_MOVE) fireBullet();
  }

  zoneMid.addEventListener('pointerup', function (e) { endPress(e, true); });
  zoneMid.addEventListener('pointercancel', function (e) { endPress(e, false); });
  zoneMid.addEventListener('lostpointercapture', function (e) { endPress(e, false); });

  heldZoneResets.push(hardRelease);
})();
```

`HOLD_THRESHOLD_MS` and `TAP_MAX_MOVE` are small game-specific constants
(how long a press must be held before it counts as "hold" instead of
"tap", and how far a touch can drift and still count as a tap) — set
these to whatever fits your game; the originals use `180` and `12`.
`fireBullet()` is your own action to run on a tap-release.

### Keyboard fallback (optional, but recommended)

```js
// ---- Input: keyboard fallback ------------------------------------------------------
function isLeftKey(code) { return code === 'ArrowLeft' || code === 'KeyA'; }
function isRightKey(code) { return code === 'ArrowRight' || code === 'KeyD'; }
function isThrustKey(code) { return code === 'Space' || code === 'ArrowUp' || code === 'KeyW'; }

var kbHoldTimer = null;
var kbHoldEngaged = false;

document.addEventListener('keydown', function (e) {
  if (isThrustKey(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (isLeftKey(e.code)) { kbLeft = true; composeInput(); }
  else if (isRightKey(e.code)) { kbRight = true; composeInput(); }
  else if (isThrustKey(e.code)) {
    kbHoldEngaged = false;
    kbHoldTimer = setTimeout(function () {
      kbHoldEngaged = true;
      kbThrust = true;
      composeInput();
    }, HOLD_THRESHOLD_MS);
  }
});

document.addEventListener('keyup', function (e) {
  if (isLeftKey(e.code)) { kbLeft = false; composeInput(); }
  else if (isRightKey(e.code)) { kbRight = false; composeInput(); }
  else if (isThrustKey(e.code)) {
    clearTimeout(kbHoldTimer);
    if (kbHoldEngaged) {
      kbThrust = false;
      composeInput();
    } else {
      fireBullet();
    }
    kbHoldEngaged = false;
  }
});
```

`kbLeft`/`kbRight`/`kbThrust` are OR'd with the touch flags inside
`composeInput()` above, so touch and keyboard work simultaneously without
either needing to know about the other.

### Page-level safety nets

These two blocks live once at the page level (not per-zone) and the hold
zones above depend on the first one for full stuck-button recovery.

```js
// Same stuck-input safety net as the touch zones above, for the keyboard
// fallback (a held key could theoretically miss its keyup the same way a
// touch can miss its pointerup - e.g. alt-tabbing away mid-hold).
function forceReleaseKeyboard() {
  clearTimeout(kbHoldTimer);
  if (kbLeft || kbRight || kbThrust) {
    kbLeft = false; kbRight = false; kbThrust = false;
    composeInput();
  }
  kbHoldEngaged = false;
}

function forceReleaseAllInput() {
  heldZoneResets.forEach(function (fn) { fn(); });
  forceReleaseKeyboard();
}

window.addEventListener('blur', forceReleaseAllInput);

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    forceReleaseAllInput();
  }
});

// Belt-and-suspenders against long-press text selection / callout menus
// some mobile browsers still show on custom buttons despite the CSS above.
controlBar.addEventListener('contextmenu', function (e) { e.preventDefault(); });
controlBar.addEventListener('selectstart', function (e) { e.preventDefault(); });
```

(In `asteroids.html` the `visibilitychange` listener also pauses/resumes
the render loop — that part is game-specific, only the
`forceReleaseAllInput()` call is part of this pattern.)

```js
// ---- Prevent / auto-recover from accidental page pinch-zoom ------------------------------------------------------
// iOS Safari ignores maximum-scale/user-scalable in the viewport meta
// tag (deliberate, for accessibility - Apple won't let a page fully
// block pinch-zoom that way) and touch-action:none isn't 100% reliable
// against pinch specifically on iOS either. Two layers: stop the
// WebKit gesture events outright, and as a safety net, snap the zoom
// back to 1x shortly after any pinch that gets through anyway, so a
// player is never stuck zoomed in with no way back.
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
document.addEventListener('touchmove', function (e) {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, { passive: false });

(function () {
  var viewportMeta = document.querySelector('meta[name="viewport"]');
  var resetTimer = null;

  function forceResetZoom() {
    if (!viewportMeta) return;
    var original = viewportMeta.getAttribute('content');
    viewportMeta.setAttribute('content', original + ', shrink-to-fit=no');
    requestAnimationFrame(function () { viewportMeta.setAttribute('content', original); });
  }

  function scheduleZoomCheck() {
    clearTimeout(resetTimer);
    resetTimer = setTimeout(function () {
      if (window.visualViewport && window.visualViewport.scale > 1.02) forceResetZoom();
    }, 250);
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleZoomCheck);
  }
})();
```

Not strictly part of the control bar, but bundled here because any game
using this bar is played one-handed-per-side with thumbs near the screen
edges — exactly the grip that triggers accidental pinch-zoom. Worth
including any time you reuse the control bar.

## 4. Drop-in checklist

1. Keep the element IDs (`#controlBar`, `#zoneLeft`, `#zoneMid`,
   `#zoneRight`) — the JS above queries them by ID.
2. Define `HOLD_THRESHOLD_MS`, `TAP_MAX_MOVE`, and a `fireBullet()` (or
   equivalent tap-action) before the binder code runs.
3. Call `composeInput()` wherever your game reads input, or replace its
   body with whatever your game's input struct looks like — the touch and
   keyboard booleans feed into it, nothing else depends on its shape.
4. Wire `#controlBar`'s CSS variables (`--bg-2`, `--text`, `--muted`,
   `--flame`) to your game's existing palette, or hard-code colors if you
   don't have a `:root` variable system.
5. If your game doesn't need a keyboard fallback, you can drop that
   section entirely — `heldZoneResets`/`forceReleaseAllInput()` still work
   fine with only the touch zones registered.
