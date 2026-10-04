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

### Head-On

[`head-on.html`](head-on.html) — a Galaga-style shooter, and the first
chapter of a longer game about two-dimensional aliens.

- [Open the shooter](https://cloudboy1975.github.io/upgraded-broccoli/head-on.html) — straight into a run
- [Start at the house](https://cloudboy1975.github.io/upgraded-broccoli/yard.html)
  — chapter 1's opening scene: night, your house, your ship parked in
  the yard. Walk right into the ship and it takes off; walk left into
  the front door — it opens as you come up the path, with the light
  spilling onto the grass — and you are inside, where the computer runs
  the flight tutorial and the TV is showing the news. Walk up past the
  right-hand side of the house instead and you come out on the drive.
  The bottom-right button skips straight to the game.
- **Dive waves, colour-matched missiles and meteor runs** — enemies come
  in red, green and blue families; banked orbs become slow homing
  missiles that only hurt their own colour, and falling strips build the
  colour trails that chip the bricks
- **A boss at the home world** — after five meteor stages the approach
  arrives and he rises out of the planet. Three belly cores answer only
  to matching missiles, tentacle armour only to colour trails, and the
  hull is untouchable until both are gone

#### Round the side of the house

You get there by walking **past the house**, not off the edge of the
screen. The house's own front line, extended to its right, is the way
out: cross it past the corner and you are round the side. No detour
behind the building, and no transition — touching the line puts you on
the next screen, the way the games this is pretending to be did it. The
takeoff and the front door still have their sequences; a doorway does
not get one.

Coming back is simpler still: the yard is off to the left, so walking
left is how you get there. Hold left from where you land and you walk
in front of the house and straight out of the scene.

The things standing on the drive are things: the bin, the mailbox and
the garage door while it is down all stop you, the same way the
buildings do.

#### The letter in the mailbox

Stand at the mailbox and the corner button says **Read**. Inside is
Form 7-B: a receipt for the ship on the lawn — signed by you, this
morning — and three standing orders, of which the third is to try
talking to them before you shoot. It is a **first draft**: the words
are one list near the top of `driveway.html`, so rewriting it is
editing that list, and the tests check the letter's shape rather than
its prose. Read it once and the mailbox's flag goes down for good.

The garage here does **not** open because you walked at it — it
is the one thing in the chapter you have to work for. Stand at it and
the corner button stops saying *Back* and starts saying **Open**; press
it and the door rolls up on your father's convertible, a low, wide,
pointed thing from the years when cars were drawn by the same people
drawing rockets. No keys in it yet. It stays however you left it — including
after you walk out of the scene and come back, which is what makes it a
switch rather than a motion sensor. (Remembered for as long as the tab
is open; closing it forgets, until there is something worth calling a
save.)

Neither screen puts you down at a spot of its own: you arrive at the
door you came through. Walk past the house in the yard and you come in
at the drive's left-hand border, a stride in from it; walk back out of
that border and you are at the house's corner again, right at the line
you crossed, with the ship a walk back down the lawn. Both spots are
worked out from where the buildings are standing rather than written
down as coordinates, so the two sides of a doorway cannot drift apart.
And if you look up while you are round there,
something is moving in the sky over the ridges: three lights in loose
formation, one of which will roll through a loop now and then, or put a
couple of bolts down toward the horizon. Not much. Enough.

#### The six o'clock news

Stand at the TV in the front room; the button in the corner becomes
**Watch**. A cartoon anchor reports the
invasion in eight shots, with the dialogue in captions under the picture
and a mouth that moves while a line is up — including the bit of phone
footage the network cannot stop replaying. It is a **first draft**: the
script is one array near the top of `house.html`, so rewriting it is
editing a list of lines and how long each one is on screen.

#### The flight tutorial

[`head-on.html?tutorial`](https://cloudboy1975.github.io/upgraded-broccoli/head-on.html?tutorial)
— or the computer in the front room, which is where it is meant to be
found. Five lessons, and you fly the real ship through every one of
them: nothing advances until you have actually done the thing.

1. **Shield pods** — fly into one, then shoot the next and catch what it
   becomes
2. **Missiles** — a banked shield fired at the colour it matches, with
   another colour on screen ignoring it
3. **Pulse cannon** — ride a falling strip the whole way down, then break
   the bricks in that colour
4. **Lightning** — hold fire, and watch it spend the shields to do it
5. **Speed jump** — dodge the rock, and see the planet come closer

Moving and shooting are left out on purpose. **Skip lesson** moves to
the next one and **Exit** stops there; either way you end up back in the
front room, standing at the computer you got up from. Nothing in there
can cost you a life or a high score.

#### Sharing the boss fight

`?boss` drops straight into the boss fight, for handing to somebody
without making them play five stages first:

- [The fight as designed](https://cloudboy1975.github.io/upgraded-broccoli/head-on.html?boss) — arriving with one
  of everything, which is meant to be workable but not a walkover
- [The siege](https://cloudboy1975.github.io/upgraded-broccoli/head-on.html?boss&orbs=0,0,0&fire=0,0,0) — arriving
  empty-handed, surviving on his spawns until the drops come round
- [Loaded for bear](https://cloudboy1975.github.io/upgraded-broccoli/head-on.html?boss&orbs=3,3,3&fire=3,3,3)

`orbs` and `fire` are comma lists in red, green, blue order (0–6 each).
Anything missing or unparseable falls back to the default rather than
emptying the fight, and Restart comes back to the same fight. `?boss=0`
turns it off.

There is also a hidden tuning panel — backquote on a keyboard, or triple-tap
the "Best" readout on a phone — with live sliders for the dive rhythm,
the boss, the meteor stages and everything else, plus a back door into
the boss fight with a loadout chooser.

### Painted Lands (Prototype)

[`painted-lands.html`](painted-lands.html) &mdash; an early prototype for a
different kind of game: no score, no fail state, just a single painterly
scene to wander and a mood to shift. Built to try out two things before
committing to a full game around them:

- **A reusable NES-style controller** &mdash; the left-thumb turn zones from
  Asteroids II extended into a proper 4-way D-pad, paired with one
  right-hand action button. Same touch-hardening (pointer capture, stuck-hold
  watchdogs, iOS long-press/callout suppression, pinch-zoom recovery) ported
  over verbatim, plus a keyboard fallback (arrows/WASD to walk, Space/Z/X/E
  for the action button)
- **Simulated 3D, old-adventure-game style** &mdash; the D-pad's up/down
  walks toward or away from the horizon; the character shrinks and slows
  as it recedes, sized and positioned by a perspective trapezoid rather
  than a real 3D camera. Distant hills drift at a different rate than the
  ground when you move sideways, for cheap parallax depth
- **Deep-color mood over detail** &mdash; the action button cross-fades the
  whole scene through four hand-picked palettes (dawn/day/dusk/night),
  swapping sky gradient, mountain silhouettes, ground tones, stars, and
  fireflies together, so the "painting" feeling comes from color harmony
  rather than pixel detail
- Procedural ambience (looping filtered wind, a soft two-note chime on
  each mood shift) via Web Audio, same zero-asset-files approach as the
  other games

All of them share the same color palette and type system; the first three
additionally share a centered-card page layout, while Asteroids II,
Head-On and Painted Lands break out to layouts suited to their controls.
Every screen links back to the games hub.

`head-on.html`, `yard.html`, `house.html` and `driveway.html` have a
browser test suite in
[`tests/`](tests/) — plain Node scripts driving a real Chromium through
Playwright. `./tests/run.sh` serves the repo and runs all of them.
