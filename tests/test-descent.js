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

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

harness.run(async (page, check, ctx) => {
  const C = await D(page, () => window.__descentDebug.constants());
  let s = await state(page);
  check('boots flying, in the entry stretch, with full shields',
    s.mode === 'flying' && s.phase === 'entry' && s.shields === C.SHIELDS, s);

  // ---- Integration: the spawner fills the sky by itself -------------
  await page.waitForTimeout(3000);
  s = await state(page);
  check('obstacles appear without any help', s.obstacles.some(o => o.kind === 'rock'), s.obstacles);
  check('distance accumulates while flying', s.distance > 50, s.distance);

  // ---- Steering ------------------------------------------------------
  await quiet(page);
  await hold(page, 'ArrowRight', 350);
  s = await state(page);
  check('right on the keys moves the ship right', s.shipX > 20, s.shipX);

  await quiet(page);
  await hold(page, 'ArrowUp', 350);
  s = await state(page);
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
  await hold(page, 'ArrowUp', 350);
  s = await state(page);
  check('flight sim: up dives', s.shipY > 20, s.shipY);

  await quiet(page);
  await hold(page, 'ArrowDown', 350);
  s = await state(page);
  check('flight sim: down climbs', s.shipY < -20, s.shipY);

  await quiet(page);
  await hold(page, 'ArrowRight', 350);
  s = await state(page);
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
  await hold(page, 'ArrowUp', 350);
  s = await state(page);
  check('arcade again: up climbs', s.shipY < -20, s.shipY);

  // ---- Collisions ----------------------------------------------------
  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('rock', { x: 0, y: 0, r: 25, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a rock you fly into costs a shield', s.shields === C.SHIELDS - 1, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('rock', { x: 120, y: -100, r: 20, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a rock you are clear of does not', s.shields === C.SHIELDS && s.hits === 0, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 0, gy: 0, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a wall with its gap on you is flown through', s.shields === C.SHIELDS && s.hits === 0, s);

  await quiet(page);
  await D(page, () => window.__descentDebug.spawn('wall', { gx: 100, gy: -90, z: 1.6 }));
  await page.waitForTimeout(600);
  s = await state(page);
  check('a wall with its gap elsewhere costs a shield', s.shields === C.SHIELDS - 1, s);

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
  check('crossing a wall while only close still costs a shield', s.shields === C.SHIELDS - 1, s);

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
  await quiet(page);
  for (let i = 0; i < C.SHIELDS; i++) {
    await D(page, () => window.__descentDebug.spawn('rock', { x: 0, y: 0, r: 30, z: 1.3 }));
    await page.waitForTimeout(1800); // past the grace period after each hit
  }
  s = await state(page);
  check('running out of shields crashes the ship', s.mode === 'crashed' && s.shields === 0, s);
  check('the crash screen comes up', s.overlay === true, s);
  const distAtCrash = s.distance;
  await page.waitForTimeout(400);
  s = await state(page);
  check('the clock stops on a crash', s.distance === distAtCrash, { distAtCrash, now: s.distance });

  await page.click('#againBtn');
  await page.waitForTimeout(200);
  s = await state(page);
  check('Fly again starts a fresh run',
    s.mode === 'flying' && s.shields === C.SHIELDS && s.t < 1 && !s.overlay, s);

  check('no page errors', ctx.errors.length === 0, ctx.errors);
  const re = await D(page, () => window.__descentDebug.runtimeErrors);
  check('the descent never crashed (the code, not the ship)', re.count === 0, re);
}, { page: 'descent.html' });
