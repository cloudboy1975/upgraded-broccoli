# upgraded-broccoli
mod1

## Simple Games

A small collection of single-file, mobile-friendly browser games — no build
step, no dependencies, no server required. [`index.html`](index.html) links
to all of them.

- **Browse them all instantly:** [Open the games hub](https://cloudboy1975.github.io/upgraded-broccoli/)
- **Or run locally:** download any `.html` file below and double-click it (or drag it into a browser tab).

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

All three games follow the same look and feel, and every screen has a link
back to the games hub.
