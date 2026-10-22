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
- **A cleared wave waits for a pickup still in play** before a meteor
  stage or the boss takes the next slot. Both of those wipe the screen,
  which is right for your own bullets, for enemy fire and for debris —
  but a pickup you are flying to catch is yours, and having it vanish a
  stride from the ship reads as the game taking it back. Three things
  count: a strip on its way down, a pod on its way down, and **a pod you
  shot**, which becomes a chip flying at the ship that collects on
  contact. That third one is a pickup as much as the other two, and
  shooting a pod is one of the two intended ways to take one. Ordinary
  wave-to-wave needs none of this: the next formation flies in over the
  top and the drop keeps falling
- **Then down to their world** — with him dead the board clears, the
  engine lights, the stars stream past and the planet comes up solid
  ahead. The screen fades and the run carries on in the descent below,
  with your score. The lab's **Down to the planet after him** switch
  (on by default) turns this off and flies on toward the next world
  instead, as it used to.

#### Descent

[`descent.html`](descent.html) is what comes after the boss: flying down
to the planet, through its sky to the aliens' city.
[Try it](https://cloudboy1975.github.io/upgraded-broccoli/descent.html).
Killing the boss in Head-On leads straight into it
(`descent.html?from=head-on&score=N`). It opens out of the black Head-On
faded to, and its end screens show the Head-On score, with a **Start
over from Head-On** link. Opened on its own (from the index), it's the
descent by itself, for practice.

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
- **Spacing.** Walls come at irregular intervals, and now and then a
  second wall follows close behind with its gap within reach of the
  first. Towers stay at least 0.75s apart even late in a run. Only one
  in five is aimed at you, and those land near your line rather than
  right on it.
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
  about ten seconds it pulls back and leaves. About one time in three,
  two come at once: one of each colour, one on each side, with their
  shots out of step so they never arrive together. While one is around,
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
  The sun sets while you're down there. A flat banded disc, sliced
  across its lower half, sinks behind the horizon off to the right
  while the sky runs from red afternoon through a burning dusk to
  night. The stars come out, the ground darkens, and the grid lines
  pick up a faint violet glow. After that it stays night. The night sky
  is meant to feel like a dream: 140 stars in soft pale colours (blue,
  lavender, rose, warm white) with slow, deep twinkles and halos on the
  bright ones. About one in six now and then catches the light in a
  fine, faint four-point glint. A faint violet-to-rose haze runs diagonally across the sky,
  and every few seconds a shooting star streaks across the top. The
  speed streaks are quieter at night so they don't cut across all
  this. Star brightness, star size, sparkle, haze and shooting stars are dials in
  the lab's **Night sky** section. The sun
  starts 3s after you land and takes 45s to reach full night. Those
  timings, plus the sun's size and its left/right position, are dials
  in the settings lab, which also has **Dusk** and **Night** jump
  buttons.
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
  when you shoot it down, so staying put collects it. Swerve
  well away and it's gone. It also has **catch slop**: you only need
  to be in its general vicinity, not on it. It counts from about 85px
  further out than it's drawn, roughly a quarter of the flying area.
  A catch from out there shows as a quick green streak into the ship.
- **Nightfall and the guardian.** Once it's fully dark nothing new
  comes. The last rocks and towers fly past, any aliens leave, and for
  a few seconds it's just you and the stars. Then the guardian arrives
  in pieces: a violet square core first, then four triangles (red,
  yellow, cyan, pink), each flying in from its own side and docking on
  a face of the square to form a star. It stays in front of you,
  drifting nearer and further, side to side, and turning, but it never
  comes close enough to ram you. Every volley is announced: the firing
  tips glow first, and its shots come in the colour of the piece that
  fired them. A row of coloured bars under the shield shows each
  piece's health. Shoot a piece to nothing and it shatters into flat
  shards of its own colour, and the survivors
  regroup into a new form with its own movement and attack. A title
  card names each form:

  | What's left | Form | How it fights |
  |---|---|---|
  | core + 4 triangles | **The Star** | Slow spin. All four tips fire at you at once: move. |
  | 4 triangles, no core | **Pinwheel** | Spins fast. Its tips fire one after another. |
  | 3 triangles | **Triad** | Strafes wide. Fires a fan: one at you, one either side. |
  | 2 triangles (with or without the core) | **The Bird** | The triangles become flapping wings. It swoops in a figure-of-eight and fires a stream of three that tracks you. |
  | 1 triangle | **Dart** | Fast and jittery. Fires one shot where you are and one where you're heading. |
  | the core alone | **The Cube** | Spins hard. Alternates a ring of six shots around you (holding still is safe) with a pair straight at you. |

  **It turns edge-on.** Every few seconds the whole formation turns
  away like a card on a vertical axis. It narrows, darkens as if lit
  from the side, and holds as a thin shimmering hairline. Edge-on,
  shots glance off with a spark and the gun sight won't light, but it
  keeps firing at you. Then it turns back. So the fight has a rhythm:
  dodge while it's away, hit it while it faces you. Each form has its
  own timing. The Star faces you for 3s at a time; the later forms
  turn more often and stay away longer, so the fight gets harder as it
  goes on. A new form always starts facing you.

  When the last piece goes it's **Guardian down**, followed by the
  victory screen. The calm, the hits each piece takes, its shot speed,
  how often it fires and its size are all in the settings lab. So is
  **Pieces drop glows**, which is off by default: the fight is a test
  of the shield you bring into it. **Turns edge-on** (on by default)
  has its own **Faces you for** and **Edge-on for** dials. The
  **Boss** jump button takes you straight to it.
- **On to the city.** The guardian going down doesn't end the run.
  You fly on to the aliens' city, and nothing shoots at you on the
  way.
  - **The lake:** a short intro, about ten seconds. The grid
    smooths into a still lake that holds the night sky, and **THE
    LAKE** comes up. You get a few seconds of open water: a bright
    sheen along the horizon, the stars and haze mirrored across the
    whole surface, and soft ripples drifting past. Then the far shore
    shows and comes in toward you, and you're over land again, dotted
    with pools of the lake (each holding a few stars and ripples) and
    little alien houses (boxes, gabled houses, domes, diamonds in soft
    alien colours, each with a lit door). Most lie off to the sides
    and some are in your path. Only the houses are in the way; the
    pools are scenery. Meanwhile the skyline rises on the horizon
    round a tall central spire with a pulsing beacon.
  - **The city:** you're in among the buildings, threading them.
    Neon-edged towers with lit windows line the streets, and every so
    often something is in the way: a tower to go round, a pair to
    thread between, a sky-bridge to go over or under, or a gate to fly
    through. The pace drops to city speed for this.
  - **Shooting buildings:** they react but nothing breaks. A tower
    flashes, every window comes on and it shivers. Houses hop.
    Flying into one still hurts.
  - **The city centre:** the buildings open into a plaza, with
    towers still standing back on both sides, and a glowing landing
    pad comes up. The city closes in round it: towers down both sides
    and a tall wall of them beyond. The ship takes over and lines up
    over the pad. As the world slows to a stop it levels out into a
    hover, and the main engine winds down as three lift jets take
    over. Then it makes a classic vertical landing, letting down
    straight onto the pad with fire pointing at the ground. The fire
    splashes light across the pad and blows rings of dust outward,
    and it feathers off at the end. Then **LANDED**, the jets cut to
    a flicker, and an end screen.

  The streets get busier as you go: density builds from 1.5x at the
  start of the city to 1.75x two-thirds of the way in, then holds.
  The lab's **City** section sets the city speed (a cap: it only ever slows you to city pace, and does nothing before the city), how long the lake and
  the city last, and the density ramp (**Density at start**,
  **Density at peak**, and **Peaks this far in** as a % of the city). The **Lake**, **City** and
  **Landing** buttons jump straight there.
- **Performance monitor.** A line in the top-left corner, updated once
  a second: frames per second, the worst frame, JS memory (Chrome and
  Android report it, Safari doesn't), how many draw commands the frame
  took, and how many things are live. It turns red under 40 fps or past
  a 100 ms frame. The last minute is kept in localStorage, so a page
  the browser kills still leaves its log behind. The lab's
  **Diagnostics** section turns it off, and its **Monitor log** button
  shows the last samples.
- **Crash recorder.** If the game hits a code error, or the browser
  reloads the page in the middle of a run (a phone running short of
  memory does this), a red note says so and where in the run it
  happened: the phase, the boss or city stage, and the time. A reload
  shows the note on the next load. A reload or close you do yourself
  doesn't count. Tap the note to dismiss it.
- **Settings lab.** Press backquote (`` ` ``), or triple-tap the
  "Descent" tag at the top right on a phone. It has the same look as
  Head-On's sortie lab: a slider for each of the 49 settings, grouped
  as ship & stick, pace, shield & glows, rocks, walls, towers, aliens
  and guns. Changes take effect immediately and are saved in this
  browser. A value that differs from its default shows in orange, and
  **Reset to defaults** puts everything back. The run pauses while the
  lab is open. **Entry / Clouds / Surface** start a fresh run at that
  stretch, and **No damage** makes you invulnerable for the current run
  (it isn't saved).
- Tests: `tests/test-descent.js`.

#### Main Street

[`main-street.html`](main-street.html) is what comes after the landing:
out of the ship and down the aliens' main street on foot, a
Robotron-style twin-stick fight.
[Try it](https://cloudboy1975.github.io/upgraded-broccoli/main-street.html).
The descent's landed screen now has a **Step outside** button that
leads straight into it (`main-street.html?from=descent&score=N`,
carrying the Head-On score along). Opened on its own, it's the street by
itself, for practice.

- **The same view.** The camera stays exactly where the landing left
  it, behind and above the ship on the pad, with the same projection.
  The engines gutter out, you climb out of the hull (the yard's
  boarding, run backwards) and hop down onto the street. From there
  the camera only moves forward, and only when you walk past the middle
  of the picture. The street is a long arena that scrolls one way.
- **Twin sticks.** The left stick, the one that flew the ship, now walks
  you. Up is up the street. The fire button is replaced by a copy of the
  stick, tinted green. Push it in any direction and the gun fires
  rapidly that way, whichever way you're walking. Your arm points where
  you aim. On a keyboard, WASD walks and the arrow keys (or IJKL) fire.
- **Jump, Mario style.** For the right thumb (Space on a keyboard).
  A round **JUMP** button is drawn between the circles, but any touch
  between them jumps: around the left side of the aim circle (outside
  it) and up into the slop above the bar too. It's a big target for a
  thumb coming off the gun without looking. That space comes out of the
  sticks' slop; the circles themselves, and everything right of the aim
  circle's middle, stay the sticks'. The right thumb leaves
  the gun to jump while the left keeps steering. Hold it for a full
  jump (75 px, about a second in the air), or tap it for a short hop. It
  goes up fast and comes down faster, and a press just before you land
  still counts. In the air you keep your momentum and steer with less
  grip. While airborne you're above the burning ground and a fireball's
  splash (land in fire and it still kills), rubble doesn't slow you, and
  high enough you clear grunts and dashers (not a brute, at the default
  height). Your shadow stays on the road and shrinks as you rise, with a
  faint pale ring marking where you'll come down. **Height**, **Time in
  the air** and **Steering in the air** are lab sliders.
- **Live fences.** A fence of crackling electricity across the street,
  kerb to kerb: two dark posts with glowing tips, three jagged
  cyan-white bolts that redraw constantly, and a line of cyan light on
  the road. There's no way around, so jump it (32 px, well under the
  jump). They aren't laid out up the street to be seen from far off.
  One switches on a short way ahead of you (about 270 px) as you walk,
  at a moment you can't quite predict, and only one at a time: the
  next doesn't come until you're past it. The first comes at 50 m with
  a **LIVE FENCE — JUMP** banner. After that the gaps are random,
  0.6–1.4 times about 60 m, tightening to about 35 m with difficulty.
  Each one **powers up** over 0.7 s rather than appearing: the posts
  rise out of the kerbs and their tips light, one bright bolt shoots
  from post to post, the fence stutters on and off, then locks on with
  a zap. It can't hurt you until it's on. Aliens that walk into a live
  one are zapped, like Robotron's electrodes, with no points, so once
  you're over, it guards your back. Fire into the road ahead keeps
  clear of fences, and if a fence gets you, you come back a step short
  of it. **Live fences** in the lab sets the first distance, the
  spacing, the height, how far ahead they switch on and how long they
  take to power up.
- **Ground aliens don't shoot. Touching one kills.** *Grunts* (the
  descent's diamond aliens, on legs) march straight at you in steps.
  *Dashers* (lime arrowheads) are faster and weave. *Brutes* (violet
  squares) are slow, take 6 hits and get knocked back by each one. They
  come from up the street, out of doorways at the sides, and later from
  behind you. Anything that appears near you shows a ring on the ground
  first.
- **Down the walls.** Aliens also crawl head first down the fronts of
  the towers, mostly on the nearer ones and some far up the street,
  often two or three to a tower. The walls are already crawling when you
  step out. Up on a wall they can't touch you, and only the low ones are
  in range of your gun. Once they drop into the road they come for you
  like the rest. A new batch comes every 1.6 s at first and every 1.2 s
  at full difficulty, with up to 7 on the walls at first and 12 later.
- **Outrun them and they're gone.** An alien that falls back past the
  bottom of the picture is left behind.
- **A canyon.** The towers stand taller and shoulder to shoulder, with
  only the odd cross street, and the edges of the picture are darkened.
- **Fire from the buildings.** A window high up a tower ahead glows,
  then throws a slow ball of fire at where you're standing. It's
  flat, like everything here: a disc tumbling end over end as it falls,
  squashing to a sliver and opening out again. One face is hot
  yellow-white and the other deeper orange-red, with a soft glow around
  it and a faint trail of fading copies behind it, so it still reads as
  fire. A ring on
  the ground shows where it will land, but only for the last fifth of
  its fall by default, so you have to read where it's heading. The
  lab's **Landing spot shown** slider sets how much of the fall it's
  marked for, from never (0) to the whole way down (1). Step off the
  ring. Once it's low enough you can shoot it (50
  points). It also burns any aliens it lands on. Further down the street
  the windows throw in **volleys** of up to 2. The first is aimed at you
  and the rest land around you, a beat apart.
- **Fire into the road ahead.** From the start, towers further up the
  street throw bigger fireballs (1.7x) into the road between you and
  them. You watch them come down, and they're too big to shoot. What
  they leave is burning ground you have to walk around.
- **The street takes damage.** Where fire lands it breaks the road open
  into a crater shaped like a broken-out piece of glass: an irregular
  closed polygon with straight edges and uneven corners, laid flat on
  the road. Its outline is about the size of the area that kills. While
  it burns it's neon red: a dark red body, a crisp neon edge and a soft
  radiance around it, all pulsing together (every crater in step).
  Overlapping craters merge into one shape with a single outline, and
  behave as one: a new hit sets the whole merged cluster burning again,
  so it never shows part lit and part dark.
  **Glow pulse depth** and **Glow pulse every** in the lab tune the
  pulse. It burns for 9s. Walking into it kills you, and it burns aliens that walk into
  it too, with no points for those. Once burnt out, the crater stays as
  a cooled scar, dim deep red with a faint rim (not black), whose
  rubble slows you to about half speed. The glow eases into it over the
  last moments rather than switching off. A new life
  puts out any fire near where you fell.
- **Lives, not a shield.** You start with 3 every time (nothing carries
  over from the descent), and get an extra one every 10,000 points.
  When you die everything freezes, Robotron style. You come back where
  you fell, blinking, with the aliens close by cleared and the fire in
  the air put out. Lose the last life and it's **Overrun**, with the
  distance walked, the score and your best.
- **Harder the further you get, not the longer you play.** Difficulty
  is measured in metres down the street. It's menacing from the first
  step: fire from the buildings and into the road ahead, and crawling
  walls. It ramps to "hard but survivable" at 200 m and holds there.
  The ramp sets:
  - how often groups come (every 24 m walked at the start, every 19 m
    at full), how big they are (2 to 3), and how many can be up at
    once (4 to 9)
  - how fast they walk (34 to 47 px/s)
  - the climbers (one every 1.6 s down to 1.2 s; 7 to 12 on the walls)
  - the fire from the buildings (every 5 s down to 4.2 s, 1 to 2 in the
    air, volleys up to 2, taking 5 s down to 4.2 s to land)

  The kinds of alien arrive at fixed distances, whatever the ramp's
  length: side doors from 30 m, dashers from 70 m, brutes from 170 m.
  Attacks from behind are held back until 400 m, past this stretch.
  Standing still only brings the odd straggler, at the rate your
  distance has already set. A **BLOCK n** banner marks every 100 m.
- **Fits the visible screen.** The page measures the height you can
  actually see, instead of trusting CSS's `100dvh`, which some browsers
  and in-app web views overstate, cutting off the bottom of the
  controls. It re-measures whenever that changes (toolbars sliding,
  rotation) and refits the canvas each time. Phaser alone re-centres
  the canvas without resizing it, so after the screen shrank it hung
  over the controls. A pinch-zoom guard, the same as the other games',
  stops a stray zoom pushing the controls off the bottom.
- **Settings lab.** Backquote, or triple-tap the "Main Street" tag.
  Every ramp has a start and a full value, plus jumps to 25%, 50% and
  full difficulty, and **No death**. **Scroll point (depth)** sets how
  far up the street you can walk before the camera follows (1 is the
  ship's depth, 1.1 the default; higher gives you more room on screen
  and less warning of what's ahead; it goes down to 0.8). Where the
  aliens come from and which towers throw fire move with it. The camera
  never comes forward faster than a quick glide, so a scroll point
  below where you step out of the ship closes in smoothly rather than
  jumping.
- **Settings exporter.** In the lab, **Copy to clipboard** copies every
  setting by its lab name and code name, with your value and the
  default. Changed ones are marked and listed first, followed by one
  line of JSON with all of them, ready to paste into a chat and ask for
  new defaults. **Show all settings** shows the same text in a box (to
  select by hand if the clipboard is blocked). **Screen info** reports
  what the browser says about the screen and where things landed.
- Tests: `tests/test-street.js`.

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
