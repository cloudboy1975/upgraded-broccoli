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
  check('boots flying, in the entry stretch, with a full shield',
    s.mode === 'flying' && s.phase === 'entry' && s.shield === C.SHIELD_MAX, s);

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
  await hold(page, 'ArrowRight', 500);
  await page.waitForTimeout(GLOW_MS);
  s = await state(page);
  check('swerve away and the glow is lost', s.pickups === 0 && s.shield === 50, s);

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

  // Integration: nobody spawns these by hand in a real run.
  await quiet(page);
  await D(page, () => { window.__descentDebug.setSpawning(true); window.__descentDebug.setInvincible(true); });
  await page.waitForTimeout((C.ENEMY_FIRST + 0.5) * 1000);
  s = await state(page);
  check('an alien arrives by itself', s.enemies.length === 1, s.enemies);
  await page.waitForTimeout((C.ENEMY_ARRIVE + 2.5) * 1000);
  s = await state(page);
  check('...and opens fire by itself', s.enemyFired > 0, s);
  check('only one alien at a time', s.enemies.length <= 1, s.enemies.length);
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

  check('no page errors', ctx.errors.length === 0, ctx.errors);
  const re = await D(page, () => window.__descentDebug.runtimeErrors);
  check('the descent never crashed (the code, not the ship)', re.count === 0, re);
}, { page: 'descent.html' });
