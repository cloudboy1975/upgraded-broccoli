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
  the flight tutorial and the TV is showing the news — and the house
  carries on in both directions, with a kitchen at one end of it and a
  bed at the other. Walk up past the
  right-hand side of the house instead and you come out on the drive;
  walk left off the lawn and you are in the woods.
  The bottom-right button skips straight to the game.
- **Dive waves, colour-matched missiles and meteor runs** — enemies come
  in red, green and blue families; banked orbs become slow homing
  missiles that only hurt their own colour, and falling strips build the
  colour trails that chip the bricks
- **A boss at the home world** — after five meteor stages the approach
  arrives and he rises out of the planet. Three belly cores answer only
  to matching missiles, tentacle armour only to colour trails, and the
  hull is untouchable until both are gone

#### Descent (prototype)

[`descent.html`](descent.html) is a prototype of what comes after the
boss: flying down to the planet.
[Try it](https://cloudboy1975.github.io/upgraded-broccoli/descent.html).
It isn't connected to the boss fight yet. The plan is to hand off from
`endBoss()` once the descent feels right.

- **A behind-the-ship view with no 3D engine.** Every object is a flat
  shape at some depth, drawn at `centre + (world - camera) / depth`. The
  camera follows the ship only part of the way, so steering moves the
  ship on screen and swings the world the other way. That parallax is
  what gives the depth. The world is built from flat cutouts, which
  fits a game about two-dimensional aliens.
- **The same stick as the yard.** Left thumb, analog, centred wherever
  you press. Arrows/WASD on a keyboard.
- **Big touch areas.** The circles only show where your thumbs go.
  The whole left half of the control bar steers, the whole right half
  fires, and the two halves meet in the middle with no gap. Each half
  also has **hit slop**: an invisible strip about 56px tall above the
  bar that still counts, because a thumb coming back to the controls
  tends to land high. Both thumbs work at once.
- **Flicks.** How fast your thumb moves counts, not just where it
  ends up. Ordinary steering is unchanged. A quick flick of the stick
  gives a short burst, up to 80% above the normal top speed and with
  sharper response, in whatever direction the stick now points. The
  engine flame stretches while it lasts, and it fades out in about a
  third of a second. Thumb speed is measured over the last 60 ms, so a
  shaky thumb doesn't trigger it. Lifting your thumb and the keyboard
  never do.
- **Guns, for the aliens only.** Hold the fire button (right thumb),
  or Space, to keep firing. Shots fly straight ahead along the ship's
  line, so the gun sight (four ticks on the aliens' plane) is where they
  go. It turns yellow when an alien is in line. Rocks and walls are for
  dodging, not shooting: shots spark off them, and they give cover both
  ways.
- **Towers come apart where you hit them.** This is inspired by the
  original Star Wars arcade game. A shot cuts a tower off at the height
  it hits. Everything above the cut breaks off as one flat piece and
  tumbles away, and what's left is a broken stump with a glowing edge
  that fades. Hit near the tip and you trim it. Hit the foot and the
  whole tower topples. The stump is solid, but it's shorter, so you can
  fly over where the top used to be. To cut lower, aim lower: shots at
  the same height pass over the stump.
- **Aliens.** One at a time, a flat alien flies in and holds position
  a fixed distance ahead of you, weaving, so you can aim at it while
  the rocks keep coming. It takes four hits. Before every shot its eye
  fills orange and a ring closes in on it, then a slow orange shot
  comes at where you were, so moving dodges it. Ignore it and after
  about ten seconds it pulls back and leaves. While one is around,
  rocks come about 40% less often, so dodging and aiming at the same
  time stays fun. This is one fixed balance for the prototype. The
  real game would build up to it over time.
- **Flicks.** How fast your thumb moves counts, not just where it
  ends up. Ordinary steering is unchanged. A quick flick of the stick
  gives a short burst, up to 80% above the normal top speed and with
  sharper response, in whatever direction the stick now points. The
  engine flame stretches while it lasts, and it fades out in about a
  third of a second. Thumb speed is measured over the last 60 ms, so a
  shaky thumb doesn't trigger it. Lifting your thumb and the keyboard
  never do.
- **Guns.** Hold the fire button (right thumb), or Space, to keep
  firing. Shots fly straight ahead along the ship's line, so the gun
  sight (four ticks a little way ahead) is where they go. The sight
  turns yellow when a rock is in line. One hit blows a rock up. Walls
  and spires soak up shots, except through a wall's gap.
- **Arcade or flight-sim Y axis.** The button in the header (or `Y` on a
  keyboard) switches between them. In arcade mode, the default, up is
  up. In flight-sim mode the stick works like a yoke: push forward to
  dive, pull back to climb. Left and right never change, and your choice
  is saved on the device.
- **Three stretches, one clock:** *entry* (head-on's red planet swells
  to fill the view, with heat streaks and meteors), the *cloud layer*
  (cloud sheets you can't see through, and violet walls with a gap to
  fly through. The gap's outline is **green** if the ship is lined up
  with it, **amber** if it's close, and **red** if it isn't. The colour
  uses the same test as the collision, so green always means you'll get
  through. The next wall also shows a small copy of your ship, joined
  to it by a faint line, at the exact point you'd pass through if you
  held your position. It's the size of the ship's collision area, so if
  it fits in the gap, you fit), then a white-out as you break through the cloud base
  onto the *surface*. There the ground rises toward you, rock spires
  stand up out of it, and the pace keeps increasing until you crash.
  For now there's no landing.
- **A shield bar, not lives.** Different hits cost different amounts:
  rocks, spires and alien fire take 20%, and scraping a wall takes 10%.
  What a hit took shows briefly in white before it drains away, and the
  bar goes amber below half and red below a quarter. After a hit there's
  a short grace period. Distance flown is the score, and your best is
  saved locally.
- **Green glows.** A downed alien leaves a green glow where it was.
  It hangs there a moment, then drifts toward you, and flying into it
  restores 20%, up to full. You're usually lined up with the alien
  when you shoot it down, so staying put collects it. Swerve and it's
  gone. It also steers as it comes. If a wall will reach you before
  the glow does, the glow heads for that wall's gap, so being lined up
  with the hole also lines you up with the glow, and the wall doesn't
  take back what the glow gives. With no wall in the way it only drifts
  gently toward you. That's enough to forgive a near miss, but not
  enough to chase you down.
- Tests: `tests/test-descent.js`.

#### Left off the lawn, into the trees

**Walk left from anywhere on the lawn** and you end up in the trees.
The rule is one line — the left-hand edge of the world — and what keeps
it honest is that the house is already solid: anywhere its wall is
between you and the edge, you were stopped by brick several strides ago.
The one part of that side that is *not* the woods is the front door,
which stands in its own band and catches you when you walk into it,
exactly as it always did. A cut, like every other doorway in the
chapter, carrying the depth you were walking at.

(The lawn is a trapezoid, so its left-hand edge is not the screen's. At
the back of the garden the whole world is a couple of hundred pixels
wide and the edge is a third of the way across the picture; down by the
camera it is off the side of it. "Walk left until you cannot" is the
rule; where that leaves you on screen is the perspective's business.)

[`wood.html`](wood.html) exists for its **light**, and there is **no
moon in it**. Everything is lit from up and to the right — four gaps in
the canopy with a shaft under each, leaning left, every trunk bright
down one edge — and you never see what is doing it. Out on the lawn the
moon is the friendliest thing in the sky; in here you can only tell it
is there by what it does. The sky gets stars and nothing else.

The canopy and the shafts are drawn from **one list**: the canopy is a
dark mass with a notch bitten out of it at each gap and a shaft hanging
under the notch, so a beam with no gap over it is not a thing that can
happen. (An early draft had them leaning *into* the light, which is two
moons, and looks fine in a still.) Motes are invisible until one drifts
through a shaft, which is the whole reason the shafts read as air rather
than paint.

The rest is quiet: bare trunks you walk round, a fallen one soft with
rot, the old boundary stone where the garden ends and the wood does not
— and, every half-minute or so, a pair of eyes somewhere out past the
trunks that open, blink once, and are gone. Nothing comes of them and
nothing is meant to. A wood you can see all of is a park.

Walking **deeper in** is the one direction in the chapter that refuses.
It says so rather than silently stopping you: a wall you can see is
scenery, a wall you cannot is a bug.

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

The bin opens the same way, with **Look**: inside is last night's
feast, the night before a war — a pizza box with one slice still in
it, and a tub of ice cream that got no such mercy.

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

#### One house, three rooms

The front room is the middle one. There is no door at either end of it
and no hallway to walk down: it is an **open plan**, so the way through
is simply to keep walking. Off the left-hand end and you are in the
**kitchen** — fridge, a run of worktop with the sink under the window,
a cooker, the table with yesterday's paper still on it. Off the right
and you are at the **bed end** — wardrobe, chest of drawers with a
photograph on it, and a bed running away from you under the window,
with a star chart and the cutaway of a ship on the wall above the
drawers. Somebody wanted this long before it wanted him.

Crossing either line is a **cut**, not a sequence, the same rule as
crossing the house's front line out in the yard: a doorway earns an
animation, an open end of a room does not. And you come in where you
walked out — at the opposite end of the next room, **at the depth you
were walking at**, so a stroll along the back wall stays a stroll along
the back wall. The depth rides across in the URL, because unlike a
doorway an open edge has no landmark to work a landing spot out from.
If that depth would put you inside the worktop you are stepped forward
onto floor, which is the one direction along an edge that is always
open.

The corner button and Escape still mean *out* in all three — out of
the kitchen is the front room, out of the front room is the yard.

#### The cat

There is a cat, and it belongs to the **house** rather than to a room.
Which room it is in lives in the chapter's scrap of memory next to
whether the garage door is up, and it moves while you are not looking:
find it on the kitchen floor, walk out and back, and it may be asleep
at the foot of the bed. That is the whole of what it does, and all it
is trying to be — the thing that makes three rooms one house rather
than three pictures.

In whichever room it is in, it walks a ring of places worth being and
sits a while in each. It goes round the furniture the way you do, one
axis at a time, so it slides along the sofa rather than sticking to it.
Stand near it and the corner button says **Pet**; it stays put for a
few seconds afterwards, which is the most it is prepared to commit to.
Whatever it happens to be sitting in front of, the cat is what the room
talks about — being told about the bookshelf while a cat sits on your
feet is the wrong answer every time.

The **order of each room's ring is load-bearing**, not decoration: the
cat walks between neighbouring spots in a straight line, so two spots
on opposite sides of one sofa are two spots it slides along that sofa
between forever. The tests sit and watch it for half a minute in each
room and check that it actually arrives somewhere.

Because a roaming cat is the one thing in the house that cannot be
checked, every room takes **`?cat=`** — `?cat=kitchen` pins it there,
`?cat=away` pins it anywhere but here. Same bargain `?boss` and `?at=`
already made.

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

`head-on.html`, `yard.html`, `wood.html`, `house.html`, `kitchen.html`,
`bedroom.html` and `driveway.html` have a
browser test suite in
[`tests/`](tests/) — plain Node scripts driving a real Chromium through
Playwright. `./tests/run.sh` serves the repo and runs all of them.
