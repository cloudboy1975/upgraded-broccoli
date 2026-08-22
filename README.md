# upgraded-broccoli
mod1

## Simple Games

A small collection of single-file, mobile-friendly browser games — no build
step, no dependencies, no server required. [`index.html`](index.html) links
to all of them.

- **Browse them all instantly:** [Open the games hub](https://cloudboy1975.github.io/upgraded-broccoli/)
- **Or run locally:** download any `.html` file below and double-click it (or drag it into a browser tab).
- **Building another game?** See [`CONTROLS.md`](CONTROLS.md) for the
  reusable two-thumb control-bar pattern used by both Asteroids games.

Served via GitHub Pages from `main`, so these links always reflect what's
merged — no branch or preview links to keep updating.

### Tic-Tac-Toe

[`tic-tac-toe.html`](tic-tac-toe.html) — the classic 3×3 game.

- [Open the game](https://cloudboy1975.github.io/upgraded-broccoli/tic-tac-toe.html)
- Vs Computer (unbeatable minimax AI) or Vs Friend (local 2-player) modes
- Win highlighting, score tracking (saved locally), and a "New Round" reset

### Connect the Dots

[`connect-the-dots.html`](connect-the-dots.html) — the classic pencil-and-paper
game also known as **Dots and Boxes**. Take turns drawing one line between two
adjacent dots; complete the 4th side of a box and you claim it (and go
again). Most boxes when the grid is full wins.

- [Open the game](https://cloudboy1975.github.io/upgraded-broccoli/connect-the-dots.html)
- Vs Computer (greedy/safe-move AI) or Vs Friend (local 2-player) modes
- **Resizable grid** — defaults to 5×5 dots (4×4 boxes), adjustable from
  3×3 up to 8×8 dots with the +/− stepper
- Live box tally per round, round-win score tracking (saved locally), and a
  "New Round" reset

### Asteroids

[`asteroids.html`](asteroids.html) — a variation on the classic arcade game
(v1 experiment, no alien ships or hyperspace). The twist: your ship always
stays centered on screen. Turning just spins the ship in place; thrusting
doesn't move it — instead the asteroid field drifts past you.

- [Open the game](https://cloudboy1975.github.io/upgraded-broccoli/asteroids.html)
- **Bottom control bar, split into thirds** — left/right zones turn the
  ship while held; the middle zone is dual-purpose: a quick tap fires,
  holding it thrusts. Keyboard fallback included (arrows/WASD + space)
- Rocks split into smaller pieces when shot, classic-style, with points
  scaling up as they get smaller
- 3 lives, live score, and a persisted high score (saved locally)

### Asteroids II

[`asteroids-2.html`](asteroids-2.html) &mdash; a bigger step up from the
original: the same ship-centered twist, now with the alien ships and
hyperspace warp v1 deliberately left out, built on the
[Phaser 3](https://phaser.io/) game framework and a real edge-to-edge
full-screen layout.

- [Open the game](https://cloudboy1975.github.io/upgraded-broccoli/asteroids-2.html)
- Built on Phaser 3 (vendored locally as `phaser.min.js` &mdash; still zero
  build step, and it keeps the game working fully offline, true to "download
  and double-click")
- **Alien saucers** periodically drift through and fire back, plus a
  **hyperspace warp** button (top-right, with a cooldown ring) to instantly
  teleport out of danger
- **Full-screen edge-to-edge layout** &mdash; the canvas fills the whole
  viewport with thin translucent HUD/control bars floating over it, instead
  of the centered-card look the other games use. Real `requestFullscreen()`
  is still gated behind an iOS Safari developer flag most users will never
  enable, so this leans on `100dvh`, safe-area insets, and
  `overscroll-behavior: none` to feel fullscreen and glitch-free without it
- **Procedural sound** &mdash; laser, explosions, alien blips, and a warp
  whoosh, all synthesized in code via the Web Audio API, zero audio asset
  files
- Same three-zone control bar as the original (left/right turn, tap-fire /
  hold-thrust middle zone), plus a keyboard fallback and a Shift-to-warp
  shortcut
- 3 lives, live score, and a persisted high score (saved locally)

All four games share the same color palette and type system; the first
three additionally share a centered-card page layout, while Asteroids II
breaks out to an edge-to-edge full-screen layout suited to its controls.
Every screen links back to the games hub.
