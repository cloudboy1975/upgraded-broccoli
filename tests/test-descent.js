// descent.html - the prototype of the flight down to the planet.
//
// What matters at this stage: the stick flies the ship the way it was
// asked to (up is up), the ship stays inside its box and above the
// ground, things in the way actually hurt and gaps actually save you,
// the run goes entry -> clouds -> surface on its own, and a crash can be
// flown again. Collisions are tested with obstacles placed by the debug
// hook so they are not at the mercy of the spawner; the spawner gets its
// own check that it produces things by itself.
const harness = require('./harness');

const D = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => D(page, () => window.__descentDebug.state());

// A quiet sky: nothing spawning, nothing in flight, ship centred.
async function quiet(page) {
  await D(page, () => {
    const d = window.__descentDebug;
    d.restart();
    d.setSpawning(false);
    d.setInvincible(false);
    d.clear();
    d.setShip(0, 0);
  });
}

// Holds a key until the ship has moved the way `pred` wants, or a
// generous limit passes. Not a fixed hold: the game caps each frame's
// step, so on a slow frame (just after load, say) game time runs behind
// the wall clock and a fixed 350ms hold can come up short.
async function holdUntil(page, key, pred, maxMs) {
  await page.keyboard.down(key);
  const end = Date.now() + (maxMs || 1500);
  let st;
  do {
    await page.waitForTimeout(40);
    st = await page.evaluate(() => window.__descentDebug.state());
  } while (!pred(st) && Date.now() < end);
  await page.keyboard.up(key);
  return st;
}

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

harness.run(async (page, check, ctx) => {
  const C = await D(page, () => window.__descentDebug.constants());
  let s = await state(page);
  check('boots flying, in the entry stretch, with a full shield',
    s.mode === 'flying' && s.phase === 'entry' && s.shield === C.SHIELD_MAX, s);

  // ---- Integration: the spawner fills the sky by itself -------------
  await page.waitForTimeout(3000);
  s = await state(page);
  check('obstacles appear without any help', s.obstacles.some(o => o.kind === 'rock'), s.obstacles);
  check('distance accumulates while flying', s.distance > 50, s.distance);

  // ---- Steering ------------------------------------------------------
  await quiet(page);
  s = await holdUntil(page, 'ArrowRight', st => st.shipX > 20);
  check('right on the keys moves the ship right', s.shipX > 20, s.shipX);

  await quiet(page);
  s = await holdUntil(page, 'ArrowUp', st => st.shipY < -20);
  check('up moves the ship UP the screen (no inversion)', s.shipY < -20, s.shipY);

  await quiet(page);
  await hold(page, 'ArrowLeft', 2000);
  s = await state(page);
  check('the ship stops at the left edge of its box', Math.abs(s.shipX + C.X_LIMIT) < 0.01, s.shipX);

  await quiet(page);
  await hold(page, 'ArrowUp', 2000);
  s = await state(page);
  check('the ship stops at the top of its box', Math.abs(s.shipY - C.Y_TOP) < 0.01, s.shipY);

  // The touch stick: drag up and right from wherever the thumb lands.
  await quiet(page);
  const box = await page.locator('#stickZone').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy - 30, { steps: 4 });
  await page.waitForTimeout(400);
  s = await state(page);
  await page.mouse.up();
  check('the stick drives the ship up and right', s.shipX > 15 && s.shipY < -15, { x: s.shipX, y: s.shipY });
  check('the stick reads as an analog vector', s.input.x > 0.3 && s.input.y < -0.3, s.input);
  await page.waitForTimeout(100);
  s = await state(page);
  check('letting go of the stick centres it', s.input.x === 0 && s.input.y === 0, s.input);

  // ---- Wide controls: the whole half is the control -----------------
  // A thumb that lands off the drawn circle still steers or fires.
  const fbox = await page.locator('#fireBtn').boundingBox();
  check('the two halves meet with no dead strip between them',
    Math.abs((box.x + box.width) - fbox.x) < 1 && Math.abs(fbox.x + fbox.width - 390) < 1, { box, fbox });

  async function dragFrom(x, y) {
    await quiet(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y, { steps: 4 });
    await page.waitForTimeout(300);
    const st = await state(page);
    await page.mouse.up();
    return st;
  }
  const spots = {
    'by the middle seam': [box.x + box.width - 50, cy],
    'top corner of the bar': [box.x + 8, box.y + 6],
    'bottom corner of the bar': [box.x + box.width - 50, box.y + box.height - 6],
    'just above the bar (hit slop)': [box.x + box.width / 2, box.y - 30]
  };
  for (const name of Object.keys(spots)) {
    s = await dragFrom(spots[name][0], spots[name][1]);
    check('steering works from ' + name, s.shipX > 10 && s.shotsFired === 0, { x: s.shipX, fired: s.shotsFired });
  }

  async function pressAt(x, y) {
    await quiet(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const st = await state(page);
    await page.mouse.up();
    return st;
  }
  const fireSpots = {
    'just right of the seam': [fbox.x + 6, fbox.y + fbox.height / 2],
    'the far corner': [fbox.x + fbox.width - 6, fbox.y + 6],
    'just above the bar (hit slop)': [fbox.x + 40, fbox.y - 30]
  };
  for (const name of Object.keys(fireSpots)) {
    s = await pressAt(fireSpots[name][0], fireSpots[name][1]);
    check('firing works from ' + name, s.shotsFired >= 1 && s.input.x === 0, { fired: s.shotsFired, input: s.input });
  }

  // Both thumbs at once: steer with one while holding fire with the other.
  await quiet(page);
  s = await D(page, ([sx, sy, fx, fy]) => {
    const fire = document.getElementById('fireBtn'), stick = document.getElementById('stickZone');
    const ev = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 11
    }));
    ev(stick, 'pointerdown', 11, sx, sy);
    ev(fire, 'pointerdown', 12, fx, fy);
    ev(stick, 'pointermove', 11, sx + 40, sy);
    return new Promise(res => setTimeout(() => {
      const st = window.__descentDebug.state();
      ev(stick, 'pointerup', 11, sx + 40, sy);
      ev(fire, 'pointerup', 12, fx, fy);
      res(st);
    }, 350));
  }, [cx, cy, fbox.x + fbox.width / 2, fbox.y + fbox.height / 2]);
  check('steering and firing at the same time, one thumb each', s.shipX > 10 && s.shotsFired >= 2, { x: s.shipX, fired: s.shotsFired });

  // ---- Flicks: thumb speed becomes ship speed -----------------------
  // Samples the ship while something happens, reporting the peaks.
  async function peaksDuring(ms) {
    let boost = 0, vx = 0;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const st = await state(page);
      boost = Math.max(boost, st.boost);
      vx = Math.max(vx, Math.abs(st.vx));
      await page.waitForTimeout(25);
    }
    return { boost, vx };
  }

  // Ordinary steering: ease the stick over to full right in half a second.
  await quiet(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  let slow = { boost: 0, vx: 0 };
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(cx + i * 2.5, cy);
    const st = await state(page);
    slow.boost = Math.max(slow.boost, st.boost);
    await page.waitForTimeout(20);
  }
  const slowTail = await peaksDuring(700);
  slow = { boost: Math.max(slow.boost, slowTail.boost), vx: slowTail.vx };
  await page.mouse.up();
  const afterLift = await state(page);
  check('slow steering gets no boost', slow.boost === 0, slow);
  check('slow steering keeps the normal top speed', slow.vx <= C.SHIP_MAX_SPEED + 0.5, slow);
  check('lifting the thumb is not a flick', afterLift.boost === 0, afterLift.boost);

  // A flick: thumb rests a moment, then snaps to full right.
  await quiet(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.move(cx + 50, cy);
  const fast = await peaksDuring(400);
  check('a flick after a rest boosts the ship', fast.boost > 0.8, fast);
  check('a flick goes faster than the normal top speed', fast.vx > C.SHIP_MAX_SPEED * 1.3, fast);
  await page.waitForTimeout(1200);
  s = await state(page);
  await page.mouse.up();
  check('the boost fades, back to normal top speed while held',
    s.boost === 0 && Math.abs(Math.abs(s.vx) - C.SHIP_MAX_SPEED) < 5 || (s.boost === 0 && Math.abs(s.shipX) === C.X_LIMIT), s);

  // Flicks from anywhere on the wider stick area, not just its middle.
  // Each: thumb lands, rests, then snaps 50px in the given direction.
  async function flickFrom(x, y, dx, dy) {
    await quiet(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(x + dx, y + dy);
    const pk = await peaksDuring(350);
    const st = await state(page);
    await page.mouse.up();
    return Object.assign(pk, { fired: st.shotsFired, x: st.shipX, y: st.shipY });
  }
  const flickSpots = {
    // Rightward from the seam: the thumb ends up over the FIRE half. It
    // must stay a steering flick - the stick holds on to its own touch -
    // and must not fire.
    'the middle seam, across into the fire half': [box.x + box.width - 20, cy, 50, 0],
    'the hit slop, flicking up over the picture': [box.x + box.width / 2, box.y - 30, 0, -50],
    'the top corner, flicking up and right': [box.x + 30, box.y + 10, 35, -35]
  };
  for (const name of Object.keys(flickSpots)) {
    const f = await flickFrom(...flickSpots[name]);
    check('a flick boosts from ' + name, f.boost > 0.8, f);
    check('...and steers the way it was flicked, without firing (' + name + ')',
      f.fired === 0 && (flickSpots[name][2] > 0 ? f.x > 10 : true) && (flickSpots[name][3] < 0 ? f.y < -10 : true), f);
  }

  // Slow steering that starts in the slop or at the seam is still not a flick.
  await quiet(page);
  await page.mouse.move(box.x + box.width / 2, box.y - 30);
  await page.mouse.down();
  let slowSlop = 0;
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + box.width / 2 + i * 2.5, box.y - 30);
    slowSlop = Math.max(slowSlop, (await state(page)).boost);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  check('slow steering from the hit slop gets no boost', slowSlop === 0, slowSlop);

  // A trembling thumb is not a flick.
  await quiet(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) await page.mouse.move(cx + (i % 2 ? 2 : -2), cy);
  s = await state(page);
  await page.mouse.up();
  check('small jitter gets no boost', s.boost === 0, s.boost);

  // Keys snap from 0 to 1 every press; that must not count as a flick.
  await quiet(page);
  await page.keyboard.down('ArrowRight');
  const kbPeak = await peaksDuring(500);
  await page.keyboard.up('ArrowRight');
  check('keyboard steering gets no boost', kbPeak.boost === 0 && kbPeak.vx <= C.SHIP_MAX_SPEED + 0.5, kbPeak);

  // ---- The Y-axis toggle: arcade <-> flight sim ---------------------
  s = await state(page);
  check('arcade is the default', s.invertY === false &&
    /arcade/i.test(await page.textContent('#axisBtn')), s.invertY);

  await page.click('#axisBtn');
  s = await state(page);
  check('the toggle switches to flight sim', s.invertY === true &&
    /flight/i.test(await page.textContent('#axisBtn')), s.invertY);
  check('the toggle does not keep focus (Space must still mean fly again)',
    await page.evaluate(() => document.activeElement !== document.getElementById('axisBtn')));

  await quiet(page);
  s = await holdUntil(page, 'ArrowUp', st => st.shipY > 20);
  check('flight sim: up dives', s.shipY > 20, s.shipY);

  await quiet(page);
  s = await holdUntil(page, 'ArrowDown', st => st.shipY < -20);
  check('flight sim: down climbs', s.shipY < -20, s.shipY);

  await quiet(page);
  s = await holdUntil(page, 'ArrowRight', st => st.shipX > 20);
  check('flight sim: left/right are unchanged', s.shipX > 20, s.shipX);

  await quiet(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 30, { steps: 4 });
  await page.waitForTimeout(400);
  s = await state(page);
  await page.mouse.up();
  check('flight sim: pushing the stick up dives too', s.shipY > 15, s.shipY);

  await page.reload();
  await page.waitForTimeout(600);
  s = await state(page);
  check('the choice survives a reload', s.invertY === true, s.invertY);

  await page.keyboard.press('KeyY');
  s = await state(page);
  check('Y on the keyboard toggles it back to arcade', s.invertY === false, s.invertY);
  await quiet(page);
  s = await holdUntil(page, 'ArrowUp', st => st.shipY < -20);
  check('arcade again: up climbs', s.shipY < -20, s.shipY);

  // ---- Collisions ----------------------------------------------------
  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('rock', { x: 0, y: 0, r: 25, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a rock you fly into costs a rock\'s worth of shield', s.shield === C.SHIELD_MAX - C.DAMAGE.rock, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('rock', { x: 120, y: -100, r: 20, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a rock you are clear of does not', s.shield === C.SHIELD_MAX && s.hits === 0, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 0, gy: 0, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a wall with its gap on you is flown through', s.shield === C.SHIELD_MAX && s.hits === 0, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 100, gy: -90, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a wall with its gap elsewhere costs a wall\'s worth', s.shield === C.SHIELD_MAX - C.DAMAGE.wall, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('cloud', { z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('clouds are weather, not obstacles', s.hits === 0, s);

  // ---- Wall gaps show whether you are lined up ----------------------
  // Just outside the clear zone: amber, and still a hit. Derived from the
  // gap size so retuning the gaps does not silently turn it green.
  const CLOSE_GX = C.GAP_W / 2 - C.SHIP_HIT_RADIUS * 0.5 + C.SHIP_HIT_RADIUS;
  const wallAlign = async () => (await state(page)).obstacles.find(o => o.kind === 'wall').align;
  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 0, gy: 0, z: 10 }));
  check('gap on the ship reads as lined up (green)', await wallAlign() === 'clear');

  await quiet(page);
  await D(page, (gx) => window.__descentDebug.spawn('wall', { gx: gx, gy: 0, z: 10 }), CLOSE_GX);
  check('gap just off the ship reads as close (amber)', await wallAlign() === 'close');

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 130, gy: -100, z: 10 }));
  check('gap well away reads as off (red)', await wallAlign() === 'off');

  // Steering changes it: fly toward the gap and watch it turn green.
  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 110, gy: 0, z: 13 }));
  const alignBefore = await wallAlign();
  await hold(page, 'ArrowRight', 600);
  const alignAfter = await wallAlign();
  check('steering into the gap turns it from red to green', alignBefore === 'off' && alignAfter === 'clear', { alignBefore, alignAfter });

  // ---- The marker: where you would pass through the next wall -------
  await quiet(page);
  check('no wall ahead, no marker', await D(page, () => window.__descentDebug.nextWallMarker()) === null);

  await D(page, () => window.__descentDebug.spawn('wall', { gx: 0, gy: 0, z: 4 }));
  let m = await D(page, () => window.__descentDebug.nextWallMarker());
  check('lined up, the marker sits inside the gap on screen',
    m.align === 'clear' && m.x > m.gapLeft && m.x < m.gapRight && m.y > m.gapTop && m.y < m.gapBottom, m);
  check('the marker is not where the ship is drawn (the camera parallax it corrects for)',
    m.shipScreenY - m.y > 20, m);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 120, gy: -100, z: 4 }));
  m = await D(page, () => window.__descentDebug.nextWallMarker());
  check('off, the marker sits outside the gap', m.align === 'off' && (m.x < m.gapLeft || m.y > m.gapBottom), m);

  await quiet(page);
  await D(page, () => {
    window.__descentDebug.spawn('wall', { gx: 0, gy: 0, z: 9 });
    window.__descentDebug.spawn('wall', { gx: 0, gy: 0, z: 3 });
  });
  m = await D(page, () => window.__descentDebug.nextWallMarker());
  check('the marker is on the NEAREST wall ahead', Math.abs(m.z - 3) < 0.3, m.z);

  // Amber is a warning, not a pass: crossing a wall while close still hurts.
  await quiet(page);
  await D(page, (gx) => window.__descentDebug.spawn('wall', { gx: gx, gy: 0, z: 1.6 }), CLOSE_GX);
  await page.waitForTimeout(600);
  s = await state(page);
  check('crossing a wall while only close still costs shield', s.shield === C.SHIELD_MAX - C.DAMAGE.wall, s);

  // ---- Guns ----------------------------------------------------------
  check('a wall scrape costs less than a rock or alien fire',
    C.DAMAGE.wall < C.DAMAGE.rock && C.DAMAGE.wall < C.DAMAGE.shot, C.DAMAGE);

  await quiet(page);
  await D(page, () => window.__descentDebug.setInvincible(true));
  await hold(page, 'Space', 500);
  s = await state(page);
  check('holding Space keeps firing', s.shotsFired >= 3, s.shotsFired);
  await page.waitForTimeout(200);
  const firedAfterRelease = (await state(page)).shotsFired;
  await page.waitForTimeout(300);
  check('letting go stops the guns', (await state(page)).shotsFired === firedAfterRelease);

  // Rocks are for dodging: shots spark off them and they keep coming.
  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('rock', { x: 0, y: 0, r: 22, z: 9 }));
  check('a rock on the line does not light the sight', (await state(page)).inSights === false);
  await hold(page, 'Space', 400);
  await page.waitForTimeout(300);
  s = await state(page);
  check('rocks cannot be shot down', s.shotsFired > 0 && s.obstacles.some(o => o.kind === 'rock'), s);
  await page.waitForTimeout(1800);
  s = await state(page);
  check('...so a rock you shot at still hits you', s.shield === C.SHIELD_MAX - C.DAMAGE.rock, s);

  // ---- Aliens --------------------------------------------------------
  // One holding station dead ahead, still and not firing, to aim at.
  // Scenery placed BETWEEN you and it has to sit nearer than its station.
  const COVER_Z = 1 + (C.ENEMY_Z - 1) * 0.75;
  // How long its shot takes to reach you, plus slack.
  const SHOT_MS = ((C.ENEMY_Z - 1) / C.ENEMY_SHOT_SPEED + 0.5) * 1000;
  const sitter = (x, y, extra) => D(page, ([x, y, extra, ez]) => window.__descentDebug.spawn('enemy', Object.assign({
    ax: x, ay: y, weave: false, mode: 'holding', z: ez, prevZ: ez, fireTimer: 99
  }, extra || {})), [x, y, extra, C.ENEMY_Z]);
  const enemy0 = async () => (await state(page)).enemies[0];

  await quiet(page);
  await sitter(0, 0);
  check('an alien on the line lights the sight', (await state(page)).inSights === true);
  await hold(page, 'Space', 60);
  await page.waitForTimeout(350);
  let e = await enemy0();
  check('one shot is one hit, and it takes more than one', e && e.hp === C.ENEMY_HP - 1, e);
  await hold(page, 'Space', 1200);
  await page.waitForTimeout(350);
  s = await state(page);
  check('keep firing and it goes down', s.enemiesDowned === 1 && s.enemies.length === 0, s);

  await quiet(page);
  await sitter(120, -100);
  check('an alien off the line does not light the sight', (await state(page)).inSights === false);
  await hold(page, 'Space', 500);
  await page.waitForTimeout(350);
  e = await enemy0();
  check('shots fly straight: an alien off the line is untouched', e && e.hp === C.ENEMY_HP, e);

  // Cover: scenery between you and it soaks up your shots.
  await quiet(page);
  await D(page, () => window.__descentDebug.setInvincible(true));
  await sitter(0, 0);
  await D(page, (z) => window.__descentDebug.spawn('rock', { x: 0, y: 0, r: 30, z: z }), COVER_Z);
  await hold(page, 'Space', 250);
  await page.waitForTimeout(350);
  e = await enemy0();
  check('a rock in the way shields the alien', e && e.hp === C.ENEMY_HP, e);

  await quiet(page);
  await D(page, () => window.__descentDebug.setInvincible(true));
  await sitter(0, 0);
  await D(page, (z) => window.__descentDebug.spawn('wall', { gx: 120, gy: -100, z: z }), COVER_Z);
  await hold(page, 'Space', 250);
  await page.waitForTimeout(350);
  e = await enemy0();
  check('a wall in the way shields the alien', e && e.hp === C.ENEMY_HP, e);

  await quiet(page);
  await sitter(0, 0);
  await D(page, (z) => window.__descentDebug.spawn('wall', { gx: 0, gy: 0, z: z }), COVER_Z);
  await hold(page, 'Space', 250);
  await page.waitForTimeout(350);
  e = await enemy0();
  check('...but shots go through the gap', e && e.hp < C.ENEMY_HP, e);

  // Its fire: charged up visibly, aimed at where you are, dodgeable.
  await quiet(page);
  await D(page, () => window.__descentDebug.setInvincible(true));
  await sitter(0, 0, { fireTimer: 0.8 });
  let sawCharge = false, chargedBeforeShot = false;
  for (let i = 0; i < 40; i++) {
    s = await state(page);
    if (s.enemies[0] && s.enemies[0].charge > 0) sawCharge = true;
    if (s.enemyFired > 0) { chargedBeforeShot = sawCharge; break; }
    await page.waitForTimeout(30);
  }
  check('it fires on its own', s.enemyFired === 1, s.enemyFired);
  check('every shot is telegraphed by a visible charge first', chargedBeforeShot);
  await page.waitForTimeout(SHOT_MS);
  check('its own shot is aimed at you: holding still, it lands', (await state(page)).hits === 1);

  await quiet(page);
  await D(page, (z) => window.__descentDebug.spawn('shot', { z0: z }), C.ENEMY_Z);
  await page.waitForTimeout(SHOT_MS);
  s = await state(page);
  check('hold still and its shot hits you', s.shield === C.SHIELD_MAX - C.DAMAGE.shot, s);

  await quiet(page);
  await D(page, (z) => window.__descentDebug.spawn('shot', { z0: z }), C.ENEMY_Z);
  await hold(page, 'ArrowRight', 400);
  await page.waitForTimeout(SHOT_MS);
  s = await state(page);
  check('move and it misses', s.shield === C.SHIELD_MAX && s.hits === 0, s);

  await quiet(page);
  await D(page, (ez) => {
    const d = window.__descentDebug;
    d.setInvincible(true);
    d.spawn('wall', { gx: 120, gy: -100, z: ez + 1 });
    d.spawn('shot', { z0: ez });
  }, C.ENEMY_Z);
  await page.waitForTimeout(SHOT_MS);
  check('a wall shields you from its fire too', (await state(page)).shotsBlocked === 1);

  await quiet(page);
  await D(page, (ez) => {
    const d = window.__descentDebug;
    d.setInvincible(true);
    d.spawn('wall', { gx: 0, gy: 0, z: ez + 1 });
    d.spawn('shot', { z0: ez });
  }, C.ENEMY_Z);
  await page.waitForTimeout(SHOT_MS);
  check('...unless it comes through the gap', (await state(page)).shotsBlocked === 0);

  await quiet(page);
  await sitter(0, 0, { stay: 0.3 });
  await page.waitForTimeout(500);
  check('ignored, it pulls back', (await enemy0()) && (await enemy0()).mode === 'leaving');
  await page.waitForTimeout(1500);
  s = await state(page);
  check('...and goes, with no harm done', s.enemies.length === 0 && s.enemiesDowned === 0 && s.shield === C.SHIELD_MAX, s);

  // ---- The green glow a downed alien leaves --------------------------
  // How long a glow takes to reach you from the alien's station, plus slack.
  const GLOW_MS = (C.GLOW_HANG + (C.ENEMY_Z - 1) / C.GLOW_SPEED + 0.5) * 1000;
  await quiet(page);
  await D(page, () => window.__descentDebug.setShield(50));
  await sitter(0, 0, { hp: 1 });
  await hold(page, 'Space', 60);
  await page.waitForTimeout(250);
  s = await state(page);
  check('a downed alien leaves a green glow', s.enemiesDowned === 1 && s.obstacles.some(o => o.kind === 'glow'), s.obstacles);
  await page.waitForTimeout(700);
  check('...and it is on screen long enough to see coming',
    (await state(page)).obstacles.some(o => o.kind === 'glow'));
  await page.waitForTimeout(GLOW_MS);
  s = await state(page);
  check('stay on its line and the glow tops the shield up',
    s.pickups === 1 && s.shield === 50 + C.GLOW_HEAL && !s.obstacles.some(o => o.kind === 'glow'), s);

  await quiet(page);
  await D(page, () => window.__descentDebug.setShield(50));
  await sitter(0, 0, { hp: 1 });
  await hold(page, 'Space', 60);
  // A real swerve - right across to the edge, not a nudge: with catch
  // slop, being anywhere near it still counts.
  await hold(page, 'ArrowRight', 1000);
  await page.waitForTimeout(GLOW_MS);
  s = await state(page);
  check('swerve well away and the glow is lost', s.pickups === 0 && s.shield === 50, s);

  await quiet(page);
  await sitter(0, 0, { hp: 1 });
  await hold(page, 'Space', 60);
  await page.waitForTimeout(GLOW_MS);
  s = await state(page);
  check('a glow never takes the shield past full', s.pickups === 1 && s.shield === C.SHIELD_MAX, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.setShield(50));
  await sitter(0, 0, { hp: 1 });
  await hold(page, 'Space', 60);
  // A rock right on the line, just ahead of the glow: hit, then the glow lands mid-grace.
  await D(page, () => window.__descentDebug.spawn('rock', { x: 0, y: 0, r: 20, z: 1.3 }));
  await page.waitForTimeout(GLOW_MS);
  s = await state(page);
  check('a glow still counts during the grace after a hit',
    s.pickups === 1 && s.shield === 50 - C.DAMAGE.rock + C.GLOW_HEAL, s);

  // ---- Catch slop: near the glow is enough ---------------------------
  // The glow comes straight in (it does not steer); what changed is how
  // close counts. Offsets are measured from the edge of the old reach.
  const oldReach = C.GLOW_RADIUS + C.SHIP_HIT_RADIUS;
  const glowPast = async (offset) => {
    await quiet(page);
    await D(page, () => window.__descentDebug.setShield(50));
    await D(page, ([x, z]) => window.__descentDebug.spawn('glow', { x: x, y: 0, z: z }), [offset, C.ENEMY_Z]);
    await page.waitForTimeout(GLOW_MS);
    return state(page);
  };
  s = await glowPast(oldReach + C.GLOW_CATCH_SLOP * 0.7);
  check('a glow that passes beside you, not through you, is still caught', s.pickups === 1 && s.shield === 50 + C.GLOW_HEAL, s);
  s = await glowPast(oldReach + C.GLOW_CATCH_SLOP + 15);
  check('...but the slop has an edge: one further off is missed', s.pickups === 0 && s.shield === 50, s);

  // ---- Towers: shot where you hit them --------------------------------
  // On the settled surface, a tower straight ahead with its tip at -60.
  const towerAt = async (shipY, extra) => {
    await quiet(page);
    await D(page, ([t, shipY, extra]) => {
      const d = window.__descentDebug;
      d.skipTo(t);
      d.setShip(0, shipY);
      d.spawn('spire', Object.assign({ x: 0, w: 50, top: -60, z: 5 }, extra || {}));
    }, [C.SURFACE_START + C.GROUND_SETTLE_TIME + 1, shipY, extra]);
  };
  const tower = async () => (await state(page)).obstacles.find(o => o.kind === 'spire');

  await towerAt(-40);
  await hold(page, 'Space', 60);
  await page.waitForTimeout(200);
  s = await state(page);
  let tw = s.obstacles.find(o => o.kind === 'spire');
  check('a shot near the tip blows the top off, cut at the hit',
    tw && Math.abs(tw.top - (-40 + C.SPIRE_BLAST)) < 0.01 && tw.top0 === -60, tw);
  check('...and the top goes tumbling off as a piece', s.chunks === 1 && s.spireHits === 1, s);
  await page.waitForTimeout((C.CHUNK_LIFE + 0.3) * 1000);
  check('...which is gone soon after', (await state(page)).chunks === 0);

  // The cut is real: the ship flies over the stump where the top was.
  await towerAt(-40, { z: 1.5 });
  await page.waitForTimeout(500);
  s = await state(page);
  check('an uncut tower at that height hits you', s.shield < C.SHIELD_MAX, s);

  await towerAt(-40, { z: 2.5 });
  await hold(page, 'Space', 60);
  await page.waitForTimeout(700);
  s = await state(page);
  check('...but once its top is shot off you fly over the stump', s.spireHits === 1 && s.shield === C.SHIELD_MAX, s);

  // Shots that pass over the stump do nothing more: to chip it lower you
  // have to aim lower.
  await towerAt(-40);
  await hold(page, 'Space', 400);
  await page.waitForTimeout(200);
  tw = await tower();
  check('more shots at the same height pass over the stump', (await state(page)).spireHits === 1 && Math.abs(tw.top - (-40 + C.SPIRE_BLAST)) < 0.01, tw);

  await towerAt(-100);
  await hold(page, 'Space', 300);
  await page.waitForTimeout(200);
  s = await state(page);
  check('shots over the tip miss the tower', s.spireHits === 0 && (await tower()).top === -60, s);

  // Hit at the foot and the whole thing comes down.
  await towerAt(C.GROUND_Y - C.GROUND_CLEARANCE);
  await hold(page, 'Space', 60);
  await page.waitForTimeout(200);
  s = await state(page);
  check('a shot at the foot brings the whole tower down',
    s.spiresDowned === 1 && !s.obstacles.some(o => o.kind === 'spire') && s.chunks === 1, s);

  // ---- Variety: walls irregular, aliens sometimes in pairs, towers calmer
  const sample = (what, n, arg) => D(page, ([w, n, a]) => window.__descentDebug.sample(w, n, a), [what, n, arg]);

  const wallGaps = await sample('wall', 400, 'surface');
  const wMin = Math.min(...wallGaps), wMax = Math.max(...wallGaps);
  check('walls come irregularly: spacing varies about three-fold, not +-20%', wMax / wMin > 2.6, { wMin, wMax });

  const near = await sample('nearGap', 200);
  check('a quick follow-up wall puts its gap within reach of the first',
    near.every(g => Math.abs(g.gx) <= C.WALL_DOUBLE_REACH_X + 0.01 && Math.abs(g.gy) <= C.WALL_DOUBLE_REACH_Y + 0.01), near.slice(0, 3));

  const waves = await sample('wave', 1000);
  const pairs = waves.filter(n => n === 2).length;
  check('aliens come in pairs now and then - a minority of waves', pairs > 150 && pairs < 450, pairs);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawnWave(2));
  await page.waitForTimeout(1600);
  s = await state(page);
  const [a, b] = s.enemies;
  check('a pair is two aliens of different colours', s.enemies.length === 2 && a.color !== b.color, s.enemies);
  check('...one on each side', a && b && Math.sign(a.x) !== Math.sign(b.x), s.enemies.map(e => e.x));
  check('...firing out of step', a && b && Math.abs(a.fireTimer - b.fireTimer) > C.ENEMY_FIRE_INTERVAL * 0.3, s.enemies.map(e => e.fireTimer));
  await D(page, () => window.__descentDebug.clear());

  const lateSpires = await sample('spire', 400, 0.3);
  check('towers keep a minimum spacing even late in a run', Math.min(...lateSpires) >= C.SPIRE_MIN_GAP, Math.min(...lateSpires));

  // Integration: nobody spawns these by hand in a real run.
  await quiet(page);
  await D(page, () => { window.__descentDebug.setSpawning(true); window.__descentDebug.setInvincible(true); });
  await page.waitForTimeout((C.ENEMY_FIRST + 0.5) * 1000);
  s = await state(page);
  check('an alien arrives by itself (or a pair)', s.enemies.length >= 1 && s.enemies.length <= 2, s.enemies);
  await page.waitForTimeout((C.ENEMY_ARRIVE + 2.5) * 1000);
  s = await state(page);
  check('...and opens fire by itself', s.enemyFired > 0, s);
  check('never more than two aliens at a time', s.enemies.length <= 2, s.enemies.length);
  await D(page, () => window.__descentDebug.setSpawning(false));

  // The touch fire button.
  await quiet(page);
  const fb = await page.locator('#fireBtn').boundingBox();
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  s = await state(page);
  await page.mouse.up();
  check('holding the fire button fires', s.fireHeld && s.shotsFired >= 2, s);
  await page.waitForTimeout(50);
  check('releasing it stops', (await state(page)).fireHeld === false);

  // ---- The stretches -------------------------------------------------
  await quiet(page);
  await D(page, (t) => window.__descentDebug.skipTo(t), C.CLOUDS_START + 1);
  await page.waitForTimeout(100);
  s = await state(page);
  check('the cloud layer follows entry', s.phase === 'clouds', s.phase);

  await D(page, (t) => window.__descentDebug.skipTo(t), C.SURFACE_START + 0.2);
  await page.waitForTimeout(100);
  s = await state(page);
  const groundEarly = s.groundY;
  check('the surface follows the clouds', s.phase === 'surface', s.phase);

  await D(page, (t) => window.__descentDebug.skipTo(t), C.SURFACE_START + C.GROUND_SETTLE_TIME + 1);
  await page.waitForTimeout(100);
  s = await state(page);
  check('the ground comes up to meet you and settles',
    groundEarly > s.groundY && Math.abs(s.groundY - C.GROUND_Y) < 0.01, { groundEarly, now: s.groundY });

  // Settled, the ground - not the ship's own box - is the floor.
  check('the settled ground sits above the box floor (else the next check is vacuous)',
    C.GROUND_Y - C.GROUND_CLEARANCE < C.Y_BOTTOM, C);
  await hold(page, 'ArrowDown', 1500);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(100);
  s = await state(page);
  await page.keyboard.up('ArrowDown');
  check('the ship cannot fly into the ground',
    Math.abs(s.shipY - (C.GROUND_Y - C.GROUND_CLEARANCE)) < 0.01, s);
  check('pinned at the floor, the ship stores no speed into it', s.vy === 0, s.vy);
  await page.waitForTimeout(150);
  await hold(page, 'ArrowUp', 150);
  const after = await state(page);
  check('pulling up off the floor responds at once', after.shipY < s.shipY - 10, { before: s.shipY, after: after.shipY });

  // On the ground, the spawner brings spires and walls by itself.
  await D(page, () => { window.__descentDebug.setSpawning(true); window.__descentDebug.setInvincible(true); });
  const kinds = new Set();
  for (let i = 0; i < 20; i++) {
    (await state(page)).obstacles.forEach(o => kinds.add(o.kind));
    await page.waitForTimeout(400);
  }
  check('the surface spawns spires and walls', kinds.has('spire') && kinds.has('wall'), [...kinds]);
  s = await state(page);
  check('it keeps going: no end to the surface stretch', s.mode === 'flying' && s.phase === 'surface', s);

  // ---- Crash and fly again ------------------------------------------
  // Flown into walls with Space held the whole way down, the way a
  // player still on the trigger crashes - walls, because shots would
  // clear rocks out of the way.
  await quiet(page);
  await page.keyboard.down('Space');
  for (let i = 0; i < Math.ceil(C.SHIELD_MAX / C.DAMAGE.wall) && (await state(page)).mode === 'flying'; i++) {
    await D(page, () => window.__descentDebug.spawn('wall', { gx: 120, gy: -100, z: 1.3 }));
    await page.waitForTimeout(1800); // past the grace period after each hit
  }
  s = await state(page);
  check('running out of shields crashes the ship', s.mode === 'crashed' && s.shield <= 0, s);
  check('the crash screen comes up', s.overlay === true, s);
  const distAtCrash = s.distance;
  await page.waitForTimeout(400);
  s = await state(page);
  check('the clock stops on a crash', s.distance === distAtCrash, { distAtCrash, now: s.distance });

  await page.keyboard.down('Space');            // still held: this one arrives as a key repeat
  await page.waitForTimeout(150);
  check('a held Space (key repeat) does not restart', (await state(page)).mode === 'crashed');
  await page.keyboard.up('Space');

  await page.click('#againBtn');
  await page.waitForTimeout(200);
  s = await state(page);
  check('Fly again starts a fresh run',
    s.mode === 'flying' && s.shield === C.SHIELD_MAX && s.t < 1 && !s.overlay, s);

  // ---- Sunset: the surface runs from afternoon to night ---------------
  const skyAt = (t) => D(page, (t) => window.__descentDebug.sky(t), t);
  const sunStart = C.SURFACE_START + C.SUNSET_DELAY;
  const day = await skyAt(sunStart - 0.5), dusk = await skyAt(sunStart + C.SUNSET_TIME / 2),
        night = await skyAt(sunStart + C.SUNSET_TIME), later = await skyAt(sunStart + C.SUNSET_TIME * 3),
        clouds = await skyAt(C.CLOUDS_START + 5);
  check('the sun is up when you land: no stars yet', day.p === 0 && day.stars === 0 && day.sunDrop === 0, day);
  check('mid-sunset the sun is part way down and the sky has changed',
    dusk.p > 0.4 && dusk.p < 0.6 && dusk.sunDrop > 0.3 && dusk.sunDrop < 1 && dusk.top !== day.top, dusk);
  check('by night the sun is gone and the stars are out', night.p === 1 && night.sunDrop === 1 && night.stars === 1, night);
  check('...and it stays night', later.p === 1 && later.top === night.top, later);
  check('the sunset is the surface\'s alone: nothing changes in the clouds', clouds.p === 0, clouds);
  check('night is darker than afternoon', (night.top & 0xff) + ((night.top >> 8) & 0xff) + (night.top >> 16) <
    (day.top & 0xff) + ((day.top >> 8) & 0xff) + (day.top >> 16), { day: day.top, night: night.top });

  // Real time moves it, not just the clock hook.
  await quiet(page);
  await D(page, (t) => window.__descentDebug.skipTo(t), sunStart);
  await page.waitForTimeout(1500);
  check('flying on brings the dusk', (await D(page, () => window.__descentDebug.sky())).p > 0);

  // ---- The night sky -----------------------------------------------------
  const stars = () => D(page, () => window.__descentDebug.stars());
  const st0 = await stars();
  check('a full night sky: plenty of stars, in several colours, some that sparkle',
    st0.count >= 120 && st0.colors >= 4 && st0.sparkling > 10 && st0.sparkling < st0.count / 3, st0);

  // Shooting stars: only in full dark, and only with the switch on.
  // Fast-forwarded, so several would-be chances go by.
  const shootingIn = async (t) => {
    await quiet(page);
    await D(page, (t) => { const d = window.__descentDebug; d.setInvincible(true); d.skipTo(t); d.timeScale = 4; }, t);
    await page.waitForTimeout(4500);
    await D(page, () => { window.__descentDebug.timeScale = 1; });
    return (await stars()).shootingSeen;
  };
  const nightSky = C.SURFACE_START + C.SUNSET_DELAY + C.SUNSET_TIME + 0.1;
  check('shooting stars cross the night sky', (await shootingIn(nightSky)) > 0);
  check('...but never in daylight', (await shootingIn(C.SURFACE_START)) === 0);
  await D(page, () => window.__descentDebug.lab.setOpen(true));
  await page.uncheck('#lab input[data-key="SHOOTING_STARS"]');
  await D(page, () => window.__descentDebug.lab.setOpen(false));
  check('...and not at all with the lab switch off', (await shootingIn(nightSky)) === 0);
  await D(page, () => window.__descentDebug.lab.setOpen(true));
  await page.check('#lab input[data-key="SHOOTING_STARS"]');
  await D(page, () => window.__descentDebug.lab.setOpen(false));

  // ---- Nightfall and the guardian ---------------------------------------
  const boss = () => D(page, () => window.__descentDebug.boss());
  const nightT = C.SURFACE_START + C.SUNSET_DELAY + C.SUNSET_TIME;

  // The obstacles fall away at nightfall: real spawner, real clock.
  await quiet(page);
  await D(page, (t) => {
    const d = window.__descentDebug;
    d.setInvincible(true);
    d.skipTo(t);
    d.spawnWave(2);
    d.setSpawning(true);
  }, nightT - 0.2);
  await page.waitForTimeout(600);
  let bs = await boss();
  check('at nightfall the calm begins', bs.stage === 'calm', bs);
  check('...and any aliens about give up and leave', (await state(page)).enemies.every(e => e.mode === 'leaving'));
  await page.waitForTimeout(1500);
  s = await state(page);
  check('nothing new comes in the calm', !s.obstacles.some(o => o.kind !== 'cloud' && o.kind !== 'glow' && o.z > C.Z_SPAWN - 1.5), s.obstacles);

  // Then it comes, in pieces, and assembles.
  await D(page, () => window.__descentDebug.startBoss(0));
  await page.waitForTimeout(200);
  bs = await boss();
  check('the guardian arrives: a square and four triangles', bs.stage === 'boss' && bs.pieces.length === 5 &&
    bs.pieces.filter(p => p.kind === 'square').length === 1 && bs.pieces.filter(p => p.kind === 'tri').length === 4, bs.pieces);
  check('...each a different colour', new Set(bs.pieces.map(p => p.color)).size === 5);
  check('...flying in rather than appearing whole', bs.mode === 'assembling' && bs.pieces.some(p => !p.docked), bs);
  await page.waitForFunction(() => window.__descentDebug.boss().mode === 'fight', null, { timeout: 20000 }).catch(() => {});
  bs = await boss();
  check('...and docks into a star', bs.mode === 'fight' && bs.form === 'star' && bs.pieces.every(p => p.docked), bs);

  // It moves: side to side, nearer and further, turning - never close enough to ram.
  // Sampled in fast-forward, so a whole nearer-and-further cycle (about
  // 14s for the Star) goes by - the closest point is what matters.
  const zs = [], xs = [], rots = [];
  await D(page, () => { window.__descentDebug.timeScale = 4; });
  for (let i = 0; i < 40; i++) {
    const b = await boss();
    zs.push(b.z); xs.push(b.x); rots.push(b.rot);
    await page.waitForTimeout(100);
  }
  await D(page, () => { window.__descentDebug.timeScale = 1; });
  check('it drifts nearer and further', Math.max(...zs) - Math.min(...zs) > 0.15, { min: Math.min(...zs), max: Math.max(...zs) });
  check('...side to side', Math.max(...xs) - Math.min(...xs) > 15);
  check('...and turns', Math.abs(rots[rots.length - 1] - rots[0]) > 0.3);
  check('...but never comes close enough to ram you', Math.min(...zs) >= C.BOSS_Z_MIN - 0.01, Math.min(...zs));

  // It fires, and says so first.
  await D(page, () => window.__descentDebug.setBossVolley(0.7));
  let sawBossCharge = false, shotsBefore = (await boss()).shots, firedAt = null;
  for (let i = 0; i < 40; i++) {
    const b = await boss();
    if (b.charge > 0) sawBossCharge = true;
    if (b.shots > shotsBefore) { firedAt = i; break; }
    await page.waitForTimeout(30);
  }
  check('it fires at you', firedAt !== null);
  check('...every volley glows first', sawBossCharge);
  const hitsBefore = (await state(page)).hits;
  await page.waitForTimeout((C.BOSS_SHOT_TIME + 0.4) * 1000);
  check('...the Star\'s volley converges on you: hold still and it lands', (await state(page)).hits > hitsBefore);

  // Your guns hurt it.
  bs = await boss();
  const totalHp = (b) => b.pieces.reduce((n, p) => n + (p.alive ? p.hp : 0), 0);
  const before = totalHp(bs);
  for (let i = 0; i < 6; i++) {
    const b = await boss();
    await D(page, () => window.__descentDebug.setBossFlip('face')); // facing you: see the edge-on tests below
    await D(page, ([x, y]) => window.__descentDebug.setShip(x, y), [b.x, Math.min(b.y, 100)]);
    await hold(page, 'Space', 120);
  }
  await page.waitForTimeout(300);
  check('shots on it wear it down', totalHp(await boss()) < before, { before, now: totalHp(await boss()) });

  // It turns edge-on: in time it narrows to a line and comes back.
  // Fast-forwarded so a whole face-turn-edge-turn cycle goes by.
  await D(page, () => { window.__descentDebug.setBossFlip('face'); window.__descentDebug.setBossVolley(99); window.__descentDebug.timeScale = 4; });
  let minCos = 1, sawFaceAgain = false, wentEdge = false;
  for (let i = 0; i < 50; i++) {
    const b = await boss();
    minCos = Math.min(minCos, Math.abs(b.flipCos));
    if (Math.abs(b.flipCos) < 0.1) wentEdge = true;
    if (wentEdge && b.flip === 'face') { sawFaceAgain = true; break; }
    await page.waitForTimeout(100);
  }
  await D(page, () => { window.__descentDebug.timeScale = 1; });
  check('it turns edge-on now and then', wentEdge, minCos);
  check('...and turns back to face you', sawFaceAgain);

  // Edge-on, shots glance off; face-on, they land.
  const fireAtBoss = async (phase) => {
    await D(page, (ph) => window.__descentDebug.setBossFlip(ph), phase);
    const b0 = await boss();
    await D(page, ([x, y]) => window.__descentDebug.setShip(x, y), [b0.x, Math.min(b0.y, 100)]);
    const lit = (await state(page)).inSights;
    const hp0 = totalHp(b0), gl0 = b0.glances;
    await D(page, (ph) => window.__descentDebug.setBossFlip(ph), phase);
    await hold(page, 'Space', 150);
    await D(page, (ph) => window.__descentDebug.setBossFlip(ph), phase);
    await page.waitForTimeout(250);
    const b1 = await boss();
    return { lit, lost: hp0 - totalHp(b1), glanced: b1.glances - gl0 };
  };
  let r = await fireAtBoss('edge');
  check('edge-on, shots glance off it', r.lost === 0 && r.glanced > 0, r);
  check('...and the sight does not light', r.lit === false, r);
  r = await fireAtBoss('face');
  check('face-on, shots land', r.lost > 0, r);
  check('...and the sight lights', r.lit === true, r);
  await D(page, () => window.__descentDebug.setBossVolley(1.5));

  // Losing pieces: each time, the rest regroup into a new form.
  await D(page, () => window.__descentDebug.hitBoss('top', 99));
  bs = await boss();
  s = await state(page);
  check('glows from the guardian are off by default', C.BOSS_GLOWS === 0, C.BOSS_GLOWS);
  check('a piece shot to nothing is gone - and leaves no glow',
    !bs.pieces.find(p => p.id === 'top').alive && !s.obstacles.some(o => o.kind === 'glow'), bs.pieces);
  check('...the rest regroup', bs.mode === 'reforming' && bs.form === 'triad' && bs.banner === 'TRIAD', bs);
  // Wait on the game's clock, not the wall's: headless runs slow.
  await page.waitForFunction(() => window.__descentDebug.boss().mode === 'fight', null, { timeout: 20000 }).catch(() => {});
  check('...and fight on in the new form', (await boss()).mode === 'fight');
  check('...starting face-on', (await boss()).flip === 'face');

  // Switched on in the lab, the next piece down does leave one.
  await D(page, () => window.__descentDebug.lab.setOpen(true));
  await page.check('#lab input[data-key="BOSS_GLOWS"]');
  await D(page, () => window.__descentDebug.lab.setOpen(false));
  await D(page, () => window.__descentDebug.hitBoss('left', 99));
  check('...with the lab\'s switch on, a piece down leaves a glow', (await state(page)).obstacles.some(o => o.kind === 'glow'));
  await D(page, () => window.__descentDebug.lab.setOpen(true));
  await page.uncheck('#lab input[data-key="BOSS_GLOWS"]');
  await D(page, () => window.__descentDebug.lab.setOpen(false));
  await page.waitForTimeout((C.BOSS_REFORM_TIME + 0.3) * 1000);
  bs = await boss();
  check('two triangles left make a bird', bs.form === 'bird', bs.form);
  const wingTips = [];
  for (let i = 0; i < 8; i++) {
    const b = await boss();
    wingTips.push(b.pieces.filter(p => p.alive && p.kind === 'tri').map(p => p.tipY - b.y));
    await page.waitForTimeout(50);
  }
  const wing0 = wingTips.map(w => w[0]);
  check('...whose wings flap', Math.max(...wing0) - Math.min(...wing0) > 10, wing0);

  await D(page, () => window.__descentDebug.hitBoss('core', 99));
  check('the bird flies on without its body', (await boss()).form === 'bird');
  await D(page, () => window.__descentDebug.hitBoss('right', 99));
  check('one triangle left is a dart', (await boss()).form === 'dart');

  await D(page, () => window.__descentDebug.hitBoss('bottom', 99));
  bs = await boss();
  s = await state(page);
  let ct = await D(page, () => window.__descentDebug.city());
  check('the last piece down: guardian down', bs.stage === 'won' && bs.mode === null && ct.banner === 'GUARDIAN DOWN', { bs, ct });
  check('...and its shots in flight die with it', s.enemyShots === 0, s.enemyShots);
  check('...and the run flies on, to the city - no end screen yet',
    s.mode === 'flying' && ct.stage === 'lake' && s.overlay === false, { mode: s.mode, ct });

  // ---- The city ----------------------------------------------------------
  const city = () => D(page, () => window.__descentDebug.city());
  // The lake: the grid smooths into water and the pace eases to city speed.
  const lake0 = (await city()).terrain.lake;
  await page.waitForTimeout(1500);
  ct = await city();
  check('the grid smooths into a lake', ct.terrain.lake > lake0 && ct.terrain.city === 0, { lake0, now: ct.terrain });
  check('...open water first: no land yet', !(await state(page)).obstacles.some(o => o.kind === 'pond' || o.kind === 'house'));
  check('the lake is a short intro: the streets by about ten seconds', C.LAKE_TIME <= 12, C.LAKE_TIME);

  // Then the far shore comes in: land again, with pools of the lake and
  // houses on it, all by themselves - and nothing shoots.
  await D(page, (t) => window.__descentDebug.setCityT(t), C.LAKE_TIME * 0.5);
  await page.waitForFunction(() => window.__descentDebug.state().obstacles.filter(o => o.kind === 'house').length >= 2, null, { timeout: 15000 }).catch(() => {});
  s = await state(page);
  ct = await city();
  check('then land: pools of the lake on it, and houses', s.obstacles.some(o => o.kind === 'pond') && s.obstacles.filter(o => o.kind === 'house').length >= 2, s.obstacles.map(o => o.kind));
  check('...beyond a far shore that comes in toward you', ct.terrain.shore === null ? ct.terrain.lake === 0 : ct.terrain.shore < 14, ct.terrain);
  check('...you have slowed to city pace', Math.abs(ct.speed - C.CITY_SPEED) < 0.01, ct);
  check('...and nothing shoots at you', s.enemies.length === 0 && s.enemyShots === 0, s);

  // On through the stages, in order.
  const advance = async () => { await D(page, () => window.__descentDebug.setCityT(9999)); await page.waitForTimeout(250); return city(); };
  ct = await advance();
  check('then into the city', ct.stage === 'city' && ct.banner === 'THE CITY', ct);
  check('...the streets start at density 1.5', Math.abs(ct.density - 1.5) < 0.03, ct.density);
  await page.waitForTimeout(4000);
  s = await state(page);
  check('the city brings towers and something in the way, by itself',
    s.obstacles.filter(o => o.kind === 'building').length >= 4 &&
    s.obstacles.some(o => o.kind === 'bridge' || o.style === 'gate' || o.kind === 'building'), s.obstacles.map(o => o.kind));
  check('...and still nothing shoots', s.enemies.length === 0 && s.enemyShots === 0);
  // Density builds from 1.5 to 1.75, peaking two-thirds of the way in.
  const densAt = async (f) => { await D(page, (t) => window.__descentDebug.setCityT(t), C.CITY_TIME * f); return (await city()).density; };
  const dHalf = await densAt(0.335), dPeak = await densAt(0.67), dLate = await densAt(0.95);
  check('the streets get busier: halfway up the ramp a third of the way in', Math.abs(dHalf - 1.625) < 0.02, dHalf);
  check('...at the peak, 1.75, two-thirds in, and holding there', Math.abs(dPeak - 1.75) < 0.01 && Math.abs(dLate - 1.75) < 0.001, { dPeak, dLate });
  ct = await advance();
  check('the city centre: an open plaza', ct.stage === 'plaza' && ct.banner === 'CITY CENTER', ct);
  ct = await advance();
  check('...then the landing', ct.stage === 'landing', ct.stage);
  s = await state(page);
  check('...with the city closed in round the pad: towers either side and beyond',
    s.obstacles.filter(o => o.kind === 'building' && o.x < -150).length >= 4 &&
    s.obstacles.filter(o => o.kind === 'building' && o.x > 150).length >= 4 &&
    s.obstacles.filter(o => o.kind === 'building' && Math.abs(o.x) < 150).length >= 2 &&
    !s.obstacles.some(o => o.pattern), s.obstacles.filter(o => o.kind === 'building').map(o => Math.round(o.x)));

  // A classic vertical landing: it comes to a hover over the pad, then
  // lets down straight onto it on fire pointing at the ground.
  await page.waitForFunction(() => window.__descentDebug.city().stage === 'touchdown', null, { timeout: 30000 });
  s = await state(page);
  ct = await city();
  check('the world stops and the ship hovers high over the pad', ct.speed === 0 && s.shipY < C.CITY_TOUCHDOWN_Y - 80 && Math.abs(s.shipX) < 5, { y: s.shipY, ct });
  check('...on its lift jets, main engine wound down', ct.hover === 1 && ct.lift > 0.5, ct);
  await page.waitForFunction((y0) => window.__descentDebug.state().shipY > y0 + 40, s.shipY, { timeout: 20000 });
  ct = await city();
  check('...then lets down straight onto it, still on the jets', ct.stage === 'touchdown' && Math.abs((await state(page)).shipX) < 5 && ct.lift > 0.5, ct);

  // The ship lands itself: steering is ignored, it lines up and sets down.
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__descentDebug.city().stage === 'landed', null, { timeout: 30000 });
  await page.keyboard.up('ArrowLeft');
  s = await state(page);
  ct = await city();
  check('the ship lands itself on the pad, whatever the stick says',
    Math.abs(s.shipX) < 3 && Math.abs(s.shipY - C.CITY_TOUCHDOWN_Y) < 3 && ct.speed === 0 && ct.banner === 'LANDED', { x: s.shipX, y: s.shipY, ct });
  check('...the pad is under it', s.obstacles.some(o => o.kind === 'pad'));
  await page.waitForTimeout(2200);
  check('...then the end screen: the city', (await state(page)).overlay === true && /city/i.test(await page.textContent('#overlayTitle')));
  await page.click('#againBtn');
  await page.waitForTimeout(150);
  bs = await boss();
  s = await state(page);
  ct = await city();
  check('Fly again starts a fresh run: no guardian, no city', s.mode === 'flying' && bs.stage === null && ct.stage === null && s.t < 1, { s, bs, ct });

  // In the city: buildings react to your shots and never break.
  const cityAt = async (pattern) => {
    await quiet(page);
    await D(page, ([t, k]) => {
      const d = window.__descentDebug;
      d.skipTo(t); d.startCity('city'); d.setSpawning(false); d.clear(); d.setInvincible(false);
      d.cityPattern(k, 3.5);
    }, [nightT, pattern]);
    return (await state(page)).obstacles.filter(o => ['building', 'bridge', 'wall'].includes(o.kind));
  };
  let objs = await cityAt('tower');
  await D(page, (x) => window.__descentDebug.setShip(x, 60), objs[0].x);
  const reacts0 = (await city()).reacts;
  await hold(page, 'Space', 250);
  await page.waitForTimeout(150);
  s = await state(page);
  check('a tower you shoot reacts', (await city()).reacts > reacts0 && s.obstacles.some(o => o.kind === 'building' && o.react > 0), s.obstacles);
  check('...and stays standing', s.obstacles.filter(o => o.kind === 'building').length === objs.length);
  await page.waitForTimeout(1500);
  check('...but fly into it and it hurts', (await state(page)).shield < C.SHIELD_MAX);

  objs = await cityAt('bridge');
  const br = objs.find(o => o.kind === 'bridge');
  await D(page, (y) => window.__descentDebug.setShip(0, y), br.y);
  await page.waitForTimeout(1500);
  check('a sky-bridge across your height hits you', (await state(page)).shield < C.SHIELD_MAX);
  objs = await cityAt('bridge');
  const br2 = objs.find(o => o.kind === 'bridge');
  await D(page, (y) => window.__descentDebug.setShip(0, y < 0 ? y + 70 : y - 70), br2.y);
  await page.waitForTimeout(1500);
  check('...go over or under it and it does not', (await state(page)).shield === C.SHIELD_MAX);
  await D(page, () => window.__descentDebug.restart());

  // With the lab switch off it never turns.
  await quiet(page);
  await D(page, () => window.__descentDebug.lab.setOpen(true));
  await page.uncheck('#lab input[data-key="BOSS_FLIP"]');
  await D(page, () => window.__descentDebug.lab.setOpen(false));
  await D(page, (t) => { const d = window.__descentDebug; d.setInvincible(true); d.skipTo(t); d.startBoss(0); }, nightT);
  await page.waitForFunction(() => window.__descentDebug.boss().mode === 'fight', null, { timeout: 30000 });
  await D(page, () => { window.__descentDebug.timeScale = 4; });
  let offMin = 1;
  for (let i = 0; i < 30; i++) { offMin = Math.min(offMin, Math.abs((await boss()).flipCos)); await page.waitForTimeout(100); }
  await D(page, () => { window.__descentDebug.timeScale = 1; });
  check('with "Turns edge-on" off, it always faces you', offMin === 1, offMin);
  await D(page, () => window.__descentDebug.lab.setOpen(true));
  await page.check('#lab input[data-key="BOSS_FLIP"]');
  await D(page, () => window.__descentDebug.lab.setOpen(false));

  // Other forms: losing the core first makes a pinwheel; the core alone is a cube.
  await quiet(page);
  await D(page, (t) => { const d = window.__descentDebug; d.setInvincible(true); d.skipTo(t); d.startBoss(0); }, nightT);
  await page.waitForTimeout((C.BOSS_ARRIVE_STAGGER * 4 + C.BOSS_DOCK_TIME + 0.4) * 1000);
  await D(page, () => window.__descentDebug.hitBoss('core', 99));
  check('four triangles without the core: a pinwheel', (await boss()).form === 'pinwheel');
  await quiet(page);
  await D(page, (t) => { const d = window.__descentDebug; d.setInvincible(true); d.skipTo(t); d.startBoss(0); }, nightT);
  await page.waitForTimeout((C.BOSS_ARRIVE_STAGGER * 4 + C.BOSS_DOCK_TIME + 0.4) * 1000);
  await D(page, () => ['top', 'right', 'bottom', 'left'].forEach(id => window.__descentDebug.hitBoss(id, 99)));
  check('the core on its own: a cube', (await boss()).form === 'cube');
  await D(page, () => window.__descentDebug.restart());

  // ---- Settings lab ----------------------------------------------------
  const lab = (fn, arg) => D(page, fn, arg);
  const labOpen = () => lab(() => window.__descentDebug.lab.isOpen());
  // Moves one slider the way a hand does: set it, fire 'input'.
  const setSlider = (key, v) => lab(([k, v]) => {
    const el = document.querySelector('#lab input[data-key="' + k + '"]');
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el ? true : false;
  }, [key, v]);

  await quiet(page);
  check('the lab starts closed', (await labOpen()) === false);

  // Every knob in the table has a slider - none quietly missing.
  const tuned = await lab(() => window.__descentDebug.lab.tuning());
  const wanted = [];
  Object.keys(tuned).forEach(k => {
    if (typeof tuned[k] === 'number') wanted.push(k);
    else Object.keys(tuned[k]).forEach(f => wanted.push(k + '.' + f));
  });
  const have = await lab(() => Array.from(document.querySelectorAll('#lab input[data-key]')).map(i => i.dataset.key));
  check('every tunable has a slider (or a switch)', wanted.every(k => have.includes(k)) && have.length === wanted.length,
    { missing: wanted.filter(k => !have.includes(k)), extra: have.filter(k => !wanted.includes(k)) });

  await page.keyboard.press('Backquote');
  check('backquote opens it', (await labOpen()) === true);
  const t0 = (await state(page)).t;
  await page.waitForTimeout(400);
  check('the run is paused while it is open', (await state(page)).t === t0);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(100);
  await page.keyboard.up('ArrowRight');
  check('keys do not steer the ship behind the lab', (await state(page)).input.x === 0);
  await page.keyboard.press('Escape');
  check('escape closes it', (await labOpen()) === false);
  await page.waitForTimeout(200);
  check('...and the run picks up again', (await state(page)).t > t0);

  // The phone way in: triple-tap the Descent tag.
  const tag = await page.locator('#labTap').boundingBox();
  for (let i = 0; i < 3; i++) await page.mouse.click(tag.x + tag.width / 2, tag.y + tag.height / 2);
  check('triple-tapping the Descent tag opens it', (await labOpen()) === true);
  await page.click('#labCloseBtn');
  check('Close closes it', (await labOpen()) === false);

  // A slider changes the live game, not just a number.
  await lab(() => window.__descentDebug.lab.setOpen(true));
  await setSlider('SHIP_MAX_SPEED', 400);
  await setSlider('DAMAGE.rock', 35);
  check('a slider writes the live value',
    (await lab(() => window.__descentDebug.lab.tuning())).SHIP_MAX_SPEED === 400);
  check('...and marks itself changed from the default',
    await lab(() => document.querySelector('#lab input[data-key="SHIP_MAX_SPEED"]').closest('.lab-row').classList.contains('changed')));
  await lab(() => window.__descentDebug.lab.setOpen(false));
  await quiet(page);
  // Measured before it reaches the edge, where its speed drops to zero.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  s = await state(page);
  await page.keyboard.up('ArrowRight');
  check('...the ship really flies at the new top speed', s.vx > 300, s.vx);
  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('rock', { x: 0, y: 0, r: 25, z: 1.6 }));
  await page.waitForTimeout(600);
  check('...and a per-kind table (rock damage) is live too', (await state(page)).shield === C.SHIELD_MAX - 35);

  await page.reload();
  await page.waitForTimeout(700);
  const reloaded = await lab(() => window.__descentDebug.lab.tuning());
  check('settings survive a reload', reloaded.SHIP_MAX_SPEED === 400 && reloaded.DAMAGE.rock === 35, reloaded);

  // Jump straight to a stretch.
  await lab(() => window.__descentDebug.lab.setOpen(true));
  await page.click('[data-jump="surface"]');
  await page.waitForTimeout(150);
  s = await state(page);
  check('the Surface button starts a run at the surface, lab closed', s.phase === 'surface' && (await labOpen()) === false, s.phase);

  await lab(() => window.__descentDebug.lab.setOpen(true));
  await page.click('[data-jump="boss"]');
  await page.waitForFunction(() => window.__descentDebug.boss().stage === 'boss', null, { timeout: 15000 }).catch(() => {});
  check('the Boss button goes straight to the guardian', (await D(page, () => window.__descentDebug.boss())).stage === 'boss');

  await lab(() => window.__descentDebug.lab.setOpen(true));
  await page.click('[data-jump="night"]');
  await page.waitForTimeout(150);
  check('the Night button starts a run at nightfall', (await D(page, () => window.__descentDebug.sky())).p === 1);

  await lab(() => window.__descentDebug.lab.setOpen(true));
  await page.check('#labNoDamage');
  await lab(() => window.__descentDebug.lab.setOpen(false));
  await D(page, () => window.__descentDebug.spawn('rock', { x: window.__descentDebug.state().shipX, y: window.__descentDebug.state().shipY, r: 25, z: 1.6 }));
  await page.waitForTimeout(600);
  check('No damage means no damage', (await state(page)).shield === C.SHIELD_MAX);

  // The city's dials only touch the city: cranked right up, the run
  // before it goes exactly as fast as ever, and nothing city-ish starts.
  await lab(() => window.__descentDebug.lab.setOpen(true));
  for (const [k, v] of [['CITY_SPEED', 9], ['CITY_DENSITY_MIN', 3], ['CITY_DENSITY_MAX', 3], ['LAKE_TIME', 30], ['CITY_TIME', 90]]) await setSlider(k, v);
  await lab(() => window.__descentDebug.lab.setOpen(false));
  const early = [];
  for (const t of [3, 30, 60, 90]) {
    await D(page, (t) => { window.__descentDebug.restart(); window.__descentDebug.skipTo(t); }, t);
    await page.waitForTimeout(150);
    early.push(await D(page, () => {
      const T = window.__descentDebug.lab.tuning(), s = window.__descentDebug.state(), c = window.__descentDebug.city();
      return { t: s.t, speed: c.speed, want: Math.min(T.SPEED_MAX, T.SPEED_START + T.SPEED_RAMP * s.t), stage: c.stage, density: c.density };
    }));
  }
  check('the city dials leave the run before the city alone: same speed, no city',
    early.every(e => Math.abs(e.speed - e.want) < 1e-9 && e.stage === null && e.density === 1), early);

  await lab(() => window.__descentDebug.lab.setOpen(true));
  await page.click('#labResetBtn');
  const reset = await lab(() => window.__descentDebug.lab.tuning());
  const defs = await lab(() => window.__descentDebug.lab.defaults());
  check('Reset puts every knob back', JSON.stringify(reset) === JSON.stringify(defs), { reset, defs });
  check('...and clears the changed marks', await lab(() => !document.querySelector('#lab .lab-row.changed')));
  await page.click('#labCloseBtn');

  check('no page errors', ctx.errors.length === 0, ctx.errors);
  const re = await D(page, () => window.__descentDebug.runtimeErrors);
  check('the descent never crashed (the code, not the ship)', re.count === 0, re);

  // ---- Performance monitor ----------------------------------------------
  const mon = await D(page, () => ({ on: document.getElementById('perfMon').classList.contains('visible'),
    text: document.getElementById('perfMon').textContent, log: window.__descentDebug.perf().log }));
  check('a performance monitor shows in the corner by default', mon.on && /\d+fps/.test(mon.text) && /draw/.test(mon.text), mon.text);
  check('...and logs a sample a second, kept for after a crash',
    mon.log.length >= 3 && mon.log.every(x => typeof x.fps === 'number' && typeof x.draw === 'number' && typeof x.worst === 'number'), mon.log.slice(-3));
  check('...in localStorage, where a page reload cannot wipe it',
    await D(page, () => JSON.parse(localStorage.getItem('descent-monitor-log') || '[]').length >= 3));
  await lab(() => window.__descentDebug.lab.setOpen(true));
  await page.uncheck('#lab input[data-key="PERF_MONITOR"]');
  await lab(() => window.__descentDebug.lab.setOpen(false));
  await page.waitForTimeout(1500);
  check('...and the lab can hide it', await D(page, () => !document.getElementById('perfMon').classList.contains('visible')));
  await lab(() => window.__descentDebug.lab.setOpen(true));
  await page.check('#lab input[data-key="PERF_MONITOR"]');
  await page.click('#labMonLogBtn');
  const logNote = await D(page, () => document.getElementById('diagNote').textContent);
  check('the lab\'s Monitor log button shows the last samples', /Monitor log/.test(logNote) && /fps, worst frame/.test(logNote), logNote);
  await page.click('#diagNote');
  await lab(() => window.__descentDebug.lab.setOpen(false));

  // ---- Crash recorder ----------------------------------------------------
  check('no problem note when nothing went wrong', await D(page, () => !document.getElementById('diagNote').classList.contains('visible')));
  // A reload you ask for is a clean leave: no note.
  await page.reload();
  await page.waitForFunction(() => window.__descentDebug && window.__descentDebug.state().t > 1.5, null, { timeout: 15000 });
  check('a reload you asked for leaves no note', await D(page, () => !document.getElementById('diagNote').classList.contains('visible')));
  // The browser killing the page mid-run gets no clean leave: simulate
  // that by putting the heartbeat back after the clean-up wipes it.
  await D(page, () => {
    window.__descentDebug.startCity('lake');
    window.addEventListener('pagehide', () => localStorage.setItem('descent-heartbeat',
      JSON.stringify({ mode: 'flying', where: 'surface, city lake +3.0s (t 99.0s, flying)', at: Date.now(),
        sample: { fps: 12, worst: 450, heap: 300, draw: 17000, obs: 20, where: 'surface, city lake', t: 99 } })));
  });
  await page.reload();
  await page.waitForTimeout(800);
  let note = await D(page, () => ({ on: document.getElementById('diagNote').classList.contains('visible'), text: document.getElementById('diagNote').textContent, last: window.__descentDebug.lastProblem() }));
  check('a page that died mid-run says so on the next load, and where', note.on && /reloaded/i.test(note.text) && /city lake/.test(note.text), note);
  check('...with what the monitor saw in its last second', /12 fps/.test(note.text) && /worst frame 450 ms/.test(note.text) && /heap 300 MB/.test(note.text), note.text);
  check('...and keeps a record of it', note.last && note.last.kind === 'reload' && /city lake/.test(note.last.where), note.last);
  await page.click('#diagNote');
  check('...tap the note away', await D(page, () => !document.getElementById('diagNote').classList.contains('visible')));
  // A code error says what it was and where.
  await D(page, () => window.dispatchEvent(new ErrorEvent('error', { error: new Error('test boom'), message: 'test boom' })));
  note = await D(page, () => ({ on: document.getElementById('diagNote').classList.contains('visible'), text: document.getElementById('diagNote').textContent, last: window.__descentDebug.lastProblem() }));
  check('an error is shown on screen with where it happened', note.on && /test boom/.test(note.text) && /t \d/.test(note.text), note);
  check('...and recorded', note.last && note.last.kind === 'error' && note.last.message === 'test boom', note.last);

  // ---- On from head-on.html ----------------------------------------------
  // Killing the boss there dives at the planet and lands here, mid-run,
  // with the score; this page picks up out of the black it faded to.
  const base = page.url().split('?')[0];
  check('on its own, the descent is not part of a Head-On run',
    (await D(page, () => window.__descentDebug.run())).fromHeadOn === false);
  await page.goto(base + '?from=head-on&score=12345');
  await page.waitForFunction(() => window.__descentDebug && window.__descentDebug.state().t > 0.5, null, { timeout: 15000 });
  const arrived = await D(page, () => ({ run: window.__descentDebug.run(), phase: window.__descentDebug.state().phase,
    black: document.getElementById('arrivalFade').classList.contains('visible') }));
  check('from Head-On: the run carries on, with its score', arrived.run.fromHeadOn && arrived.run.score === 12345, arrived);
  check('...opening on the planet, out of the black Head-On faded to', arrived.phase === 'entry' && !arrived.black, arrived);
  await D(page, () => window.__descentDebug.setInvincible(false));
  await D(page, () => { for (let i = 0; i < 3; i++) window.__descentDebug.spawn('wall', { z: 1.6 + i * 0.1, gx: -150, gy: -110 }); });
  await page.waitForFunction(() => document.getElementById('crashOverlay').classList.contains('visible'), null, { timeout: 20000 }).catch(() => {});
  const end = await D(page, () => ({ line: document.getElementById('crashLine').textContent,
    link: document.getElementById('fromTopLink').getAttribute('href') }));
  check('...the end screen shows the Head-On score', /Head-On score 12,345/.test(end.line), end);
  check('...and offers the whole run again from the top', end.link === 'head-on.html', end);
}, { page: 'descent.html' });
