// main-street.html - on foot after the descent's landing.
//
// What matters at this stage: you come out of the ship and the left
// stick walks you; the right stick fires on its own, in its own
// direction; an alien touching you costs a life, fire from the
// buildings lands where it was thrown and kills there; the lives run
// out into a game over that can be walked again; and the difficulty
// follows how far down the street you have got, not the clock.
// Things are placed through the debug hook where the test is about a
// rule, and the spawner gets its own check that it fills the street by
// itself as you walk.
const harness = require('./harness');

const D = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => D(page, () => window.__streetDebug.state());

async function quietStreet(page) {
  await D(page, () => {
    const d = window.__streetDebug;
    d.restart();
    d.skipIntro();
    d.setSpawning(false);
    d.setInvincible(false);
    d.clear();
  });
}

// Waits on the game rather than the wall clock: a slow frame steps the
// game less than the time that passed.
async function until(page, pred, maxMs) {
  const end = Date.now() + (maxMs || 3000);
  let s;
  do {
    await page.waitForTimeout(40);
    s = await state(page);
  } while (!pred(s) && Date.now() < end);
  return s;
}

harness.run(async (page, check, ctx) => {
  await D(page, () => { try { localStorage.removeItem('street-tuning-v1'); localStorage.removeItem('street-best-v1'); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(200);
  const C = await D(page, () => window.__streetDebug.constants());
  const T = C.tuning;

  // ---- Out of the ship ----------------------------------------------
  let s = await state(page);
  check('boots in the intro, at the ship, with fresh lives', s.mode === 'intro' && s.lives === T.LIVES && s.score === 0, s);
  s = await until(page, (st) => st.mode === 'walking', 15000);
  check('...climbs out and is on foot', s.mode === 'walking' && s.emerge === 1 && s.elev === 0, s);
  check('...under a MAIN STREET banner', s.banner === 'MAIN STREET', s.banner);
  check('...standing beside the ship, not inside it', Math.abs(s.px) > 20, s.px);

  // The camera is where descent.html left it: its height puts the
  // ground at the same place on screen as the pad the ship came down on.
  const pad = await D(page, () => window.__streetDebug.projectGround(0, window.__streetDebug.constants().DEPTH_PX));
  check('the view is the landing\'s: the pad sits where the descent put it', Math.abs(pad.y - (C.CY + (C.GROUND_Y - C.CAM_Y) / pad.z)) < 1 && Math.abs(C.CAM_Y - 11.5) < 1e-9, { pad, C });

  // ---- The left stick walks ------------------------------------------
  await quietStreet(page);
  s = await state(page);
  let d0 = s.pd, x0 = s.px;
  await page.keyboard.down('KeyW');
  s = await until(page, (st) => st.pd > d0 + 60);
  await page.keyboard.up('KeyW');
  check('W walks up the street (away from the camera)', s.pd > d0 + 60, { d0, pd: s.pd });
  await page.keyboard.down('KeyA');
  s = await until(page, (st) => st.px < x0 - 40);
  await page.keyboard.up('KeyA');
  check('A walks left', s.px < x0 - 40, { x0, px: s.px });

  // The camera only comes forward.
  await page.keyboard.down('KeyW');
  s = await until(page, (st) => st.camD > 150, 4000);
  await page.keyboard.up('KeyW');
  check('walking on pushes the camera forward', s.camD > 150 && Math.abs(s.z - C.PLAYER_Z_PUSH) < 0.05, s);
  await page.waitForTimeout(400); // the step or two of momentum after letting go
  const camAfter = (await state(page)).camD;
  await page.keyboard.down('KeyS');
  s = await until(page, (st) => st.z <= C.PLAYER_Z_MIN + 0.01, 4000);
  await page.waitForTimeout(300);
  s = await state(page);
  await page.keyboard.up('KeyS');
  check('...and never back: walking back stops at the bottom of the picture', s.camD === camAfter && s.z >= C.PLAYER_Z_MIN - 1e-6, { camAfter, s });

  // The scroll point is a lab setting: moved deeper, the camera lets
  // you walk that much further up the street before it follows.
  await quietStreet(page);
  await D(page, () => window.__streetDebug.tune('PLAYER_Z_PUSH', 2.5));
  await page.keyboard.down('KeyW');
  s = await until(page, (st) => st.camD > 100, 6000);
  await page.keyboard.up('KeyW');
  check('a deeper scroll point: the camera follows from there', s.camD > 100 && Math.abs(s.z - 2.5) < 0.05, s);
  await D(page, (v) => window.__streetDebug.tune('PLAYER_Z_PUSH', v), T.PLAYER_Z_PUSH);

  // Below the depth you step out at, the camera glides up to you rather
  // than jumping.
  await D(page, () => window.__streetDebug.tune('PLAYER_Z_PUSH', 0.8));
  await quietStreet(page);
  s = await until(page, (st) => st.camD > 0, 3000);
  // The gap is 0.34 of a depth unit (82px); the glide closes it at most
  // 21px a frame, so whatever frame it is first seen on, it is short.
  check('a scroll point lower than where you step out: the camera glides there, no jump', s.camD > 0 && s.camD < 66, s.camD);
  s = await until(page, (st) => Math.abs(st.z - 0.8) < 0.01, 5000);
  check('...and settles at it', Math.abs(s.z - 0.8) < 0.01, s.z);
  await D(page, (v) => window.__streetDebug.tune('PLAYER_Z_PUSH', v), T.PLAYER_Z_PUSH);

  // ---- Jumping ---------------------------------------------------------------
  // Follows one jump through, sampling it: the peak, and how long in the air.
  async function oneJump(hold) {
    const t0 = (await state(page)).t;
    await D(page, (h) => window.__streetDebug.pressJump(h), hold);
    let peak = 0, st, up = null;
    const end = Date.now() + 8000;
    do {
      await page.waitForTimeout(20);
      st = await state(page);
      peak = Math.max(peak, st.elev);
      if (st.airborne && up === null) up = st.t;
    } while ((st.airborne || up === null) && Date.now() < end);
    await D(page, () => window.__streetDebug.releaseJumpButton());
    return { peak, air: st.t - (up == null ? t0 : up), landed: !st.airborne && st.elev === 0 };
  }
  await quietStreet(page);
  let j = await oneJump(true);
  check('held, a full jump: up to ' + T.JUMP_HEIGHT + 'px and down again in about ' + T.JUMP_TIME + 's',
    j.landed && Math.abs(j.peak - T.JUMP_HEIGHT) < 4 && Math.abs(j.air - T.JUMP_TIME) < 0.12, j);
  j = await oneJump(false);
  check('...tapped, a hop: well short of it', j.landed && j.peak < T.JUMP_HEIGHT * 0.6 && j.peak > 3, j);

  // Steering: from standing, the same push picks up less speed in the air.
  async function pushRight(air) {
    await quietStreet(page);
    if (air) { await D(page, () => window.__streetDebug.pressJump(true)); await until(page, (st) => st.airborne, 2000); }
    const t0 = (await state(page)).t;
    await page.keyboard.down('KeyD');
    const st = await until(page, (x) => x.t - t0 >= 0.12, 4000);
    await page.keyboard.up('KeyD');
    await D(page, () => window.__streetDebug.releaseJumpButton());
    return st.vx / (st.t - t0);
  }
  // At a clearly reduced grip, so the difference isn't lost in frame
  // timing (the default is close to the ground's).
  await D(page, () => window.__streetDebug.tune('AIR_CONTROL', 0.3));
  const groundAcc = await pushRight(false), airAcc = await pushRight(true);
  await D(page, (v) => window.__streetDebug.tune('AIR_CONTROL', v), T.AIR_CONTROL);
  check('in the air you can still steer, with less grip than on the ground', airAcc > 0 && airAcc < groundAcc * 0.8, { groundAcc, airAcc });

  // Over an alien, and over the burning ground.
  await quietStreet(page);
  await D(page, () => window.__streetDebug.pressJump(true));
  s = await until(page, (st) => st.elev > 35, 3000);
  await D(page, (p) => { const d = window.__streetDebug; d.spawnEnemy('grunt', p.x, p.d); d.addCrater(p.x + 70, p.d, 8, 30); }, { x: s.px, d: s.pd });
  await page.waitForTimeout(100);
  s = await state(page);
  check('high in a jump, a grunt underneath can\'t touch you', s.mode === 'walking' && s.airborne, s);
  await D(page, () => window.__streetDebug.clear());
  await D(page, (p) => window.__streetDebug.addCrater(p.x, p.d, 8, 30), { x: s.px, d: s.pd });
  await page.waitForTimeout(60);
  s = await state(page);
  check('...nor the burning ground', s.mode === 'walking', s);
  s = await until(page, (st) => st.mode === 'dying' || (!st.airborne && st.mode === 'walking' && st.elev === 0 && st.lives < T.LIVES), 4000);
  check('...but land in it and it does', s.mode === 'dying' && s.lastDeath === 'burn', s);
  await D(page, () => window.__streetDebug.releaseJumpButton());

  // The real button, and Space.
  await quietStreet(page);
  // Where a thumb lands: the rings' boxes, in page coordinates.
  const ring = async (sel) => page.locator(sel).boundingBox();
  const mr = await ring('.move-pad .stick-ring'), ar = await ring('.aim-pad .stick-ring');
  const acx = ar.x + ar.width / 2, acy = ar.y + ar.height / 2, aR = ar.width / 2;
  async function touchAt(x, y) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 1, y - 30);
    const st = await until(page, (q) => q.airborne || q.input.ax !== 0 || q.input.ay !== 0 || q.input.mx !== 0 || q.input.my !== 0, 3000);
    await page.mouse.up();
    await until(page, (q) => !q.airborne, 4000);
    return st;
  }
  const spots = {
    'between the circles': [(mr.x + mr.width + ar.x) / 2, acy],
    'just right of the walking circle': [mr.x + mr.width + 8, acy],
    'up in the slop above the bar': [(mr.x + mr.width + ar.x) / 2, ar.y - 30],
    'round the top-left of the aim circle': [acx - aR * 0.8, acy - aR * 0.85],
    'round the bottom-left of the aim circle': [acx - aR * 0.8, acy + aR * 0.85]
  };
  for (const name of Object.keys(spots)) {
    await quietStreet(page);
    const st = await touchAt(spots[name][0], spots[name][1]);
    check('a touch ' + name + ' jumps, and works neither stick', st.airborne && st.input.ax === 0 && st.input.ay === 0 && st.input.mx === 0 && st.input.my === 0, { name, input: st.input, airborne: st.airborne });
  }
  await quietStreet(page);
  let st2 = await touchAt(acx - aR * 0.5, acy);
  check('inside the aim circle, even on its left side, it aims', !st2.airborne && st2.input.ay < 0, st2.input);
  await quietStreet(page);
  st2 = await touchAt(mr.x + mr.width * 0.7, acy);
  check('on the walking circle it walks', !st2.airborne && st2.input.my < 0, st2.input);
  await quietStreet(page);
  await page.keyboard.press('Space');
  s = await until(page, (st) => st.airborne, 3000);
  check('Space jumps', s.airborne && s.jumps === 1, s.jumps);
  await until(page, (st) => !st.airborne, 4000);

  // ---- Live fences -----------------------------------------------------------
  // None waiting up the street: one switches on just ahead of you once
  // you are past the first distance, and powers up before it is live.
  {
    await D(page, () => { const d = window.__streetDebug; d.restart(); d.jumpTo(d.constants().tuning.FENCE_FIRST_M - 6); d.setSpawning(false); d.setInvincible(true); });
    let st = await state(page);
    check('no fence laid out ahead before ' + T.FENCE_FIRST_M + ' m', st.fences.length === 0, st.fences);
    await page.keyboard.down('KeyW');
    st = await until(page, (q) => q.fences.length > 0, 10000);
    await page.keyboard.up('KeyW');
    const ahead = st.fences[0] - st.pd;
    check('...then one switches on a short way ahead of you, past ' + T.FENCE_FIRST_M + ' m',
      st.fences.length === 1 && st.bestM >= T.FENCE_FIRST_M && ahead > T.FENCE_AHEAD - 80 && ahead < T.FENCE_AHEAD + 60,
      { ahead, m: st.bestM });
    check('...powering up, not yet live', st.fenceLive[0] === false, st.fenceLive);
    check('...with a warning the first time', st.banner === 'LIVE FENCE \u2014 JUMP', st.banner);
    st = await until(page, (q) => q.fenceLive[0], 5000);
    check('...and live a moment later', st.fenceLive[0] === true, st.fenceLive);
    // One at a time: no second one while it is still ahead.
    st = await state(page);
    check('...one at a time: no other until you are past it', st.fences.length === 1, st.fences.length);
  }
  // Powering up, it can't hurt you; once live it does.
  await quietStreet(page);
  s = await state(page);
  await D(page, (d) => window.__streetDebug.addFence(d, true), s.pd);
  await page.waitForTimeout(150);
  s = await state(page);
  check('a fence still powering up doesn\'t hurt, even right on you', s.mode === 'walking' && s.fenceLive[0] === false, s);
  s = await until(page, (q) => q.mode === 'dying', 6000);
  check('...live, it does', s.lastDeath === 'shock', s.lastDeath);
  // Walk into one: it kills.
  await quietStreet(page);
  s = await state(page);
  await D(page, (d) => window.__streetDebug.addFence(d), s.pd + 60);
  await page.keyboard.down('KeyW');
  s = await until(page, (st) => st.mode === 'dying', 5000);
  await page.keyboard.up('KeyW');
  check('walking into a live fence kills', s.lastDeath === 'shock', s.lastDeath);
  s = await until(page, (st) => st.mode === 'walking', 4000);
  check('...and you come back a step short of it, not in it', s.fences.length === 1 && s.fences[0] - s.pd > C.PLAYER_R + 2, { pd: s.pd, fence: s.fences[0] });
  // Jump it: over, and on.
  await quietStreet(page);
  s = await state(page);
  const fenceD = s.pd + 90;
  await D(page, (d) => window.__streetDebug.addFence(d), fenceD);
  await page.keyboard.down('KeyW');
  await D(page, () => window.__streetDebug.pressJump(true));
  s = await until(page, (st) => st.pd > fenceD + 40 || st.mode !== 'walking', 6000);
  await page.keyboard.up('KeyW');
  await D(page, () => window.__streetDebug.releaseJumpButton());
  check('jump it and you are over', s.mode === 'walking' && s.pd > fenceD + 40, { pd: s.pd, fenceD, mode: s.mode, death: s.lastDeath });
  // An alien walking into it is zapped.
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => { const d = window.__streetDebug; d.addFence(p.d + 60); d.spawnEnemy('grunt', p.x, p.d + 110); }, { x: s.px, d: s.pd });
  s = await until(page, (st) => st.zapped > 0 || st.mode !== 'walking', 6000);
  check('an alien walking into a fence is zapped (no points), and you are safe behind it', s.zapped === 1 && s.score === 0 && s.mode === 'walking', s);

  // ---- Energy grenade -------------------------------------------------------
  // A grunt shot down can drop one (certain, for the test); walk over it.
  await D(page, () => window.__streetDebug.tune('GRENADE_DROP', 1));
  await quietStreet(page);
  s = await state(page);
  check('no grenade to start with, and no icon', s.grenades === 0 && !s.grenadeShown, s);
  await D(page, (p) => window.__streetDebug.spawnEnemy('grunt', p.x, p.d + 200), { x: s.px, d: s.pd });
  await page.keyboard.down('ArrowUp');
  s = await until(page, (st) => st.kills > 0, 4000);
  await page.keyboard.up('ArrowUp');
  check('a grunt shot down drops an energy grenade', s.drops === 1, s.drops);
  await page.keyboard.down('KeyW');
  s = await until(page, (st) => st.grenades > 0, 5000);
  await page.keyboard.up('KeyW');
  check('...walk over it and it\'s yours, with the icon showing', s.grenades === 1 && s.drops === 0 && s.grenadeShown && s.banner === 'ENERGY GRENADE', s);
  await D(page, (v) => window.__streetDebug.tune('GRENADE_DROP', v), T.GRENADE_DROP);
  await D(page, () => window.__streetDebug.tune('GRENADE_DROP', 0));
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.spawnEnemy('grunt', p.x, p.d + 200), { x: s.px, d: s.pd });
  await page.keyboard.down('ArrowUp');
  s = await until(page, (st) => st.kills > 0, 4000);
  await page.keyboard.up('ArrowUp');
  check('...and with no chance set, none drops', s.drops === 0, s.drops);
  await D(page, (v) => window.__streetDebug.tune('GRENADE_DROP', v), T.GRENADE_DROP);

  // Set it off: everything the pulse reaches goes.
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => {
    const d = window.__streetDebug;
    d.giveGrenade(1);
    d.spawnEnemy('grunt', p.x + 60, p.d + 80);           // close
    d.spawnEnemy('brute', p.x - 80, p.d + 1200);         // far up the street
    d.spawnClimber('grunt', 210, p.d + 600, 150);        // high on a wall
    d.launchFire({ x: -230, y: -150, d: p.d + 900, flight: 8, charge: 0, target: { x: p.x, d: p.d } });
    d.addCrater(p.x + 100, p.d + 400, 8, 30);
    d.addFence(p.d + 700);
  }, { x: s.px, d: s.pd });
  await page.waitForTimeout(100);
  const gb = await page.locator('#grenadeBtn').boundingBox();
  const cb = await page.locator('canvas').boundingBox();
  check('the grenade icon sits on the picture, bottom centre', gb && gb.y + gb.height <= cb.y + cb.height && gb.y > cb.y + cb.height * 0.7 && Math.abs(gb.x + gb.width / 2 - (cb.x + cb.width / 2)) < 2, { gb, cb });
  await page.locator('#grenadeBtn').dispatchEvent('pointerdown');
  s = await state(page);
  check('tapping the icon sets it off', s.grenades === 0 && s.pulse !== null && s.grenadesUsed === 1, s);
  s = await until(page, (st) => st.pulse === null, 10000);
  check('...the pulse sweeps the street: every alien gone, near, far and on the walls, for points',
    s.enemies.length === 0 && s.pulseKills === 3 && s.score > 0, { enemies: s.enemies.length, pulseKills: s.pulseKills, score: s.score });
  check('...the fire in the air gone, the burning ground out', s.fires.length === 0 && s.craters.every(c => c.burn === 0), { fires: s.fires.length, craters: s.craters });
  check('...and the fence brought down', s.fences.length === 0, s.fences);
  check('...and the icon gone with the last grenade', !s.grenadeShown, s.grenadeShown);
  check('without a grenade, nothing to set off', !(await D(page, () => window.__streetDebug.detonate())));

  // ---- The right stick fires, on its own ------------------------------
  await quietStreet(page);
  const fireT0 = (await state(page)).t;
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowLeft');
  // A second of GAME time: on a slow machine that is more than a second
  // of wall clock, and the rate is the game's, not the clock's.
  s = await until(page, (st) => st.t - fireT0 >= 1, 8000);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('KeyW');
  check('aiming left while walking forward: firing, aimed left', s.firing && s.aimX < -0.99 && Math.abs(s.aimD) < 0.01, s);
  check('...walking forward all the same', s.vd > 50, s.vd);
  check('...and the shots go left, not where you walk', s.bullets.length > 0 && s.bullets.every(b => b.vx < 0 && Math.abs(b.vd) < 1e-6), s.bullets);
  check('steady fire: a shot every ' + T.FIRE_INTERVAL + 's while aimed', s.shotsFired >= Math.floor((s.t - fireT0) / T.FIRE_INTERVAL) - 1, { shots: s.shotsFired, gameSeconds: s.t - fireT0 });
  await page.waitForTimeout(300);
  s = await state(page);
  check('letting go stops the gun', !s.firing, s.firing);

  // A grunt in the line of fire goes down and scores.
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.spawnEnemy('grunt', p.x, p.d + 260), { x: s.px, d: s.pd });
  await D(page, () => { const st = window.__streetDebug; st.timeScale = 1; });
  await page.keyboard.down('ArrowUp');
  s = await until(page, (st) => st.kills > 0, 3000);
  await page.keyboard.up('ArrowUp');
  check('shooting a grunt kills it, for 100', s.kills === 1 && s.score === 100 && s.enemies.length === 0, s);

  // A brute takes its hits.
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.spawnEnemy('brute', p.x, p.d + 330), { x: s.px, d: s.pd });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(150);
  s = await state(page);
  check('a brute survives its first shots', s.enemies.length === 1 || s.kills === 0, s.enemies);
  s = await until(page, (st) => st.kills > 0, 4000);
  await page.keyboard.up('ArrowUp');
  check('...and goes down after ' + T.BRUTE_HP + ' hits, for 500', s.kills === 1 && s.score === 500, s);

  // ---- Contact kills ---------------------------------------------------
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => {
    const d = window.__streetDebug;
    d.spawnEnemy('grunt', p.x + 4, p.d);
    d.spawnEnemy('grunt', p.x + 120, p.d + 30);   // near enough to be cleared on the new life
    d.spawnEnemy('grunt', p.x + 20, p.d + 900);   // far enough to stay
  }, { x: s.px, d: s.pd });
  s = await until(page, (st) => st.mode === 'dying', 1000);
  check('touching an alien costs a life', s.mode === 'dying' && s.lives === T.LIVES - 1 && s.lastDeath === 'contact', s);
  s = await until(page, (st) => st.mode === 'walking', 3000);
  check('...then a fresh life where you fell, blinking', s.mode === 'walking' && s.invuln > 0, s);
  check('...with the aliens close by cleared, the far one left', s.enemies.length === 1 && s.enemies[0].d > s.pd + 500, s.enemies);
  await D(page, (p) => window.__streetDebug.spawnEnemy('grunt', p.x, p.d), { x: s.px, d: s.pd });
  await page.waitForTimeout(200);
  s = await state(page);
  check('...and while it blinks, contact is harmless', s.mode === 'walking' && s.lives === T.LIVES - 1, s);

  // ---- Out of lives ------------------------------------------------------
  await quietStreet(page);
  await D(page, () => window.__streetDebug.setLives(1));
  s = await state(page);
  await D(page, (p) => window.__streetDebug.spawnEnemy('dasher', p.x, p.d), { x: s.px, d: s.pd });
  s = await until(page, (st) => st.overlay, 4000);
  check('the last life gone: game over, with the end screen', s.mode === 'over' && s.lives === 0 && s.overlay, s);
  check('...naming the distance walked', /m down Main Street/.test(await page.textContent('#overLine')));
  await page.click('#againBtn');
  await page.waitForTimeout(100);
  s = await state(page);
  check('...and Walk it again starts over, lives back', s.mode === 'intro' && s.lives === T.LIVES && !s.overlay && s.score === 0, s);

  // ---- Fire from the buildings -------------------------------------------
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.launchFire({ x: -230, y: -100, d: p.d + 500, flight: 0.8, charge: 0.1, target: { x: p.x, d: p.d } }), { x: s.px, d: s.pd });
  s = await until(page, (st) => st.fires.length && st.fires[0].stage === 'fly', 1000);
  check('fire charges, then flies at its target', s.fires.length === 1 && s.fires[0].stage === 'fly', s.fires);
  check('...from on high', s.fires[0].y < 0, s.fires[0]);
  s = await until(page, (st) => st.mode === 'dying', 2000);
  check('fire landing on you costs a life', s.mode === 'dying' && s.lastDeath === 'fire', s);

  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.launchFire({ x: 230, y: -100, d: p.d + 400, flight: 0.6, charge: 0.05, target: { x: p.x + 120, d: p.d + 40 } }), { x: s.px, d: s.pd });
  s = await until(page, (st) => st.splashes > 0, 2000);
  check('fire landing away from you is only a splash', s.splashes === 1 && s.mode === 'walking' && s.lives === T.LIVES, s);
  const fireKilledGrunt = await (async () => {
    await quietStreet(page);
    const st = await state(page);
    await D(page, (p) => {
      const d = window.__streetDebug;
      d.spawnEnemy('brute', p.x + 140, p.d + 200);
      d.launchFire({ x: 230, y: -100, d: p.d + 400, flight: 0.3, charge: 0.02, target: { x: p.x + 140, d: p.d + 200 } });
    }, { x: st.px, d: st.pd });
    const after = await until(page, (x) => x.splashes > 0, 2000);
    return after.enemies.length === 0 && after.score === 0;
  })();
  check('...and it burns aliens caught in it (no points for those)', fireKilledGrunt);

  // ---- Difficulty follows distance, not the clock -------------------------
  await quietStreet(page);
  s = await state(page);
  const dStart = s.difficulty;
  await page.waitForTimeout(2500);
  s = await state(page);
  check('standing still, it does not get harder', s.difficulty === dStart && dStart < 0.01, { dStart, now: s.difficulty });
  const easy = { every: s.groupEvery, max: s.maxAlive };
  await D(page, () => window.__streetDebug.jumpTo(window.__streetDebug.constants().tuning.RAMP_M / 2));
  s = await state(page);
  check('halfway down the street: half difficulty', Math.abs(s.difficulty - 0.5) < 0.01, s.difficulty);
  check('...groups come closer together and more at once', s.groupEvery < easy.every && s.maxAlive > easy.max, { easy, now: { every: s.groupEvery, max: s.maxAlive } });

  // Fire from the very first step, by default...
  await D(page, () => { const d = window.__streetDebug; d.restart(); d.skipIntro(); d.setSpawning(true); d.setInvincible(true); });
  s = await until(page, (st) => st.firesLaunched > 0, 8000);
  check('fire from the buildings from the very start of the street (default ' + T.FIRE_START_M + ' m)', T.FIRE_START_M === 0 && s.firesLaunched > 0, s.firesLaunched);
  // ...and FIRE_START_M holds it back when set.
  await D(page, () => { const d = window.__streetDebug; d.tune('FIRE_START_M', 60); d.restart(); d.skipIntro(); d.setSpawning(true); d.setInvincible(true); });
  await page.waitForTimeout(2500);
  s = await state(page);
  check('...unless "Starts at" holds it back', s.firesLaunched - s.firesAhead === 0, { launched: s.firesLaunched, ahead: s.firesAhead });
  await D(page, (v) => window.__streetDebug.tune('FIRE_START_M', v), T.FIRE_START_M);

  // The ramp: full difficulty at RAMP_M, with the kinds arriving at
  // fixed distances - attacks from behind not until past this stretch.
  const sharesAt = async (m) => { await D(page, (m) => window.__streetDebug.jumpTo(m), m); return D(page, () => window.__streetDebug.shares()); };
  let sh = await sharesAt(20);
  check('at 20 m: grunts only, straight up the street', sh.side === 0 && sh.dasher === 0 && sh.brute === 0 && sh.behind === 0, sh);
  sh = await sharesAt(100);
  check('at 100 m: doorways and dashers, no brutes yet', sh.side > 0 && sh.dasher > 0 && sh.brute === 0, sh);
  sh = await sharesAt(T.RAMP_M);
  s = await state(page);
  check('at ' + T.RAMP_M + ' m: full difficulty, brutes in, nothing from behind', s.difficulty === 1 && sh.brute > 0 && sh.behind === 0, { sh, d: s.difficulty });

  // ---- Integration: walking brings them --------------------------------
  await D(page, () => { const d = window.__streetDebug; d.restart(); d.skipIntro(); d.setSpawning(true); d.setInvincible(true); });
  await page.keyboard.down('KeyW');
  s = await until(page, (st) => st.enemies.length + st.portals > 0, 5000);
  await page.keyboard.up('KeyW');
  check('walking down the street brings aliens by itself', s.enemies.length + s.portals > 0, s);
  check('...the first ones only grunts', s.enemies.every(e => e.type === 'grunt'), s.enemies);

  // ---- Extra lives -----------------------------------------------------
  await quietStreet(page);
  s = await state(page);
  await D(page, (n) => window.__streetDebug.addScore(n), C.EXTRA_LIFE_EVERY);
  s = await state(page);
  check('an extra life every ' + C.EXTRA_LIFE_EVERY + ' points', s.lives === T.LIVES + 1 && s.banner === 'EXTRA LIFE', s);

  // ---- How much the landing spot is telegraphed ---------------------------
  // Marked only for the last FIRE_WARNING of the fall (a lab setting).
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.launchFire({ x: -230, y: -100, d: p.d + 500, flight: 2.5, charge: 0.05, target: { x: p.x + 100, d: p.d } }), { x: s.px, d: s.pd });
  s = await until(page, (st) => st.fires.length && st.fires[0].stage === 'fly' && st.fires[0].u > 0.3, 4000);
  check('early in the fall, the landing spot is not marked (default ' + T.FIRE_WARNING + ')',
    s.fires[0].u < 1 - T.FIRE_WARNING && s.fires[0].marked === 0, s.fires[0]);
  s = await until(page, (st) => !st.fires.length || st.fires[0].u > 1 - T.FIRE_WARNING / 2, 6000);
  check('...near the end it is', s.fires.length === 0 || s.fires[0].marked > 0, s.fires[0]);
  await D(page, () => window.__streetDebug.tune('FIRE_WARNING', 1));
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.launchFire({ x: -230, y: -100, d: p.d + 500, flight: 2.5, charge: 0.05, target: { x: p.x + 100, d: p.d } }), { x: s.px, d: s.pd });
  s = await until(page, (st) => st.fires.length && st.fires[0].stage === 'fly' && st.fires[0].u > 0.1, 4000);
  check('set to 1, it is marked from the start of the fall', s.fires[0].marked > 0, s.fires[0]);
  await D(page, (v) => window.__streetDebug.tune('FIRE_WARNING', v), T.FIRE_WARNING);

  // ---- The street takes damage -----------------------------------------
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.launchFire({ x: 230, y: -100, d: p.d + 400, flight: 0.4, charge: 0.05, target: { x: p.x + 110, d: p.d } }), { x: s.px, d: s.pd });
  s = await until(page, (st) => st.splashes > 0, 2000);
  check('fire leaves a burning crater where it lands', s.craters.length === 1 && s.craters[0].burn > 0 &&
    Math.abs(s.craters[0].x - (s.px + 110)) < 1, s.craters);
  const crater = s.craters[0];
  // Walk into it.
  await page.keyboard.down('KeyD');
  s = await until(page, (st) => st.mode === 'dying', 3000);
  await page.keyboard.up('KeyD');
  check('walking into a burning crater kills', s.mode === 'dying' && s.lastDeath === 'burn', s);
  s = await until(page, (st) => st.mode === 'walking', 3000);
  check('...and a new life puts out the fire round about', s.craters.every(c => c.burn === 0), s.craters);
  check('...leaving the hole as rubble', s.craters.length === 1 && s.craters[0].x === crater.x, s.craters);

  // Aliens burn in it too.
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => {
    const d = window.__streetDebug;
    d.addCrater(p.x, p.d + 100, 8, 30);
    d.spawnEnemy('grunt', p.x, p.d + 170);   // walks straight at you, through the fire
  }, { x: s.px, d: s.pd });
  s = await until(page, (st) => st.enemies.length === 0, 4000);
  check('an alien walking through a burning crater burns (no points)', s.enemies.length === 0 && s.score === 0 && s.mode === 'walking', s);

  // Burnt out, it slows you down.
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.addCrater(p.x, p.d, 0, 400), { x: s.px, d: s.pd });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  s = await state(page);
  await page.keyboard.up('KeyW');
  check('rubble slows you down', s.vd > 10 && s.vd <= T.WALK_SPEED * T.CRATER_SLOW + 1, { vd: s.vd, cap: T.WALK_SPEED * T.CRATER_SLOW });
  check('...but doesn\'t hurt', s.mode === 'walking', s.mode);

  // Overlapping craters are one shape: a new hit sets the whole merged
  // cluster burning, never part lit and part dark.
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => {
    const d = window.__streetDebug;
    d.addCrater(p.x + 60, p.d + 300, 0, 30);    // cooled
    d.addCrater(p.x + 110, p.d + 310, 0, 30);   // cooled, touching that one
    d.addCrater(p.x - 120, p.d + 300, 0, 30);   // cooled, well apart
    d.addCrater(p.x + 20, p.d + 290, 5, 30);    // a fresh hit touching the first
  }, { x: s.px, d: s.pd });
  s = await state(page);
  const cl = s.craters.map(c => Math.round(c.burn));
  check('a hit sets the whole merged cluster burning - through the chain - and nothing apart from it',
    cl.length === 4 && cl[0] === 5 && cl[1] === 5 && cl[2] === 0 && cl[3] === 5, cl);

  // ---- Down the walls -------------------------------------------------------
  await quietStreet(page);
  s = await state(page);
  // Placed right over you, so the only thing keeping it off you is how
  // high it is - not the width of the pavement.
  await D(page, (p) => window.__streetDebug.spawnClimber('grunt', p.x, p.d, 80), { x: s.px, d: s.pd });
  s = await state(page);
  check('a climber starts up on a wall', s.enemies.length === 1 && s.enemies[0].climb > 50, s.enemies);
  await page.waitForTimeout(300);
  s = await state(page);
  check('...up there it can\'t reach you', s.mode === 'walking' && s.enemies[0].climb > 0, s);
  s = await until(page, (st) => st.enemies.length && st.enemies[0].climb === 0, 5000);
  check('...it comes down to the street', s.enemies.length === 1 && s.enemies[0].climb === 0, s.enemies);
  s = await until(page, (st) => st.mode === 'dying', 3000);
  check('...and then it can', s.lastDeath === 'contact', s);

  // The spawner puts them on the walls by itself, from the start.
  await D(page, () => { const d = window.__streetDebug; d.restart(); d.skipIntro(); d.setSpawning(true); d.setInvincible(true); d.clear(); });
  s = await until(page, (st) => st.enemies.some(e => e.climb > 0), 8000);
  check('climbers appear on the walls by themselves', s.enemies.some(e => e.climb > 0), s.enemies);

  // ---- Fire into the road ahead ------------------------------------------
  await quietStreet(page);
  s = await state(page);
  const aheadT = { x: s.px, d: s.pd + 260 };
  check('a tower up the street can throw into the road ahead', await D(page, (t) => window.__streetDebug.launchAhead(t), aheadT));
  s = await state(page);
  check('...a big one', s.fires.length === 1 && s.fires[0].ahead && s.fires[0].size === T.AHEAD_SIZE, s.fires);
  // Fire straight at it all the way down: it can't be stopped.
  await page.keyboard.down('ArrowUp');
  s = await until(page, (st) => st.splashes > 0, 25000);
  await page.keyboard.up('ArrowUp');
  check('...too big to shoot down', s.firesShot === 0 && s.splashes === 1, { shot: s.firesShot, splashes: s.splashes });
  check('...it lands ahead of you and leaves a big burning crater to walk round',
    s.craters.length === 1 && s.craters[0].d > s.pd + 150 && s.craters[0].burn > 0 &&
    Math.abs(s.craters[0].r - T.FIRE_SPLASH * T.AHEAD_SIZE * 0.85) < 0.01, { craters: s.craters, pd: s.pd });

  await D(page, () => { const d = window.__streetDebug; d.restart(); d.jumpTo(d.constants().tuning.AHEAD_START_M + 40); d.setSpawning(true); d.setInvincible(true); });
  s = await until(page, (st) => st.firesAhead > 0, 10000);
  check('the spawner throws fire into the road ahead by itself', s.firesAhead > 0, s.firesAhead);

  // ---- Left behind -----------------------------------------------------
  await quietStreet(page);
  s = await state(page);
  await D(page, (p) => window.__streetDebug.spawnEnemy('grunt', 120, p.d - 20), { d: s.camD + 0.6 * C.DEPTH_PX + 20 });
  await page.keyboard.down('KeyW');
  s = await until(page, (st) => st.camD > 200 && st.enemies.length === 0, 6000);
  await page.keyboard.up('KeyW');
  check('an alien you outrun is left behind, not held at the bottom of the picture', s.enemies.length === 0 && s.camD > 200, s);

  // ---- Crawling walls from the first step ------------------------------
  await D(page, () => { const d = window.__streetDebug; d.restart(); d.setSpawning(true); });
  s = await until(page, (st) => st.mode === 'walking', 15000);
  check('stepping out, the walls are already crawling', s.enemies.filter(e => e.climb > 0).length >= 3, s.enemies);

  // ---- Volleys ---------------------------------------------------------------
  await D(page, () => { const d = window.__streetDebug; d.restart(); d.jumpTo(d.constants().tuning.RAMP_M); d.setSpawning(true); d.setInvincible(true); });
  s = await until(page, (st) => st.fires.length >= 3, 8000);
  check('well down the street, several balls of fire are in the air at once', s.fires.length >= 3, s.fires.length);

  // ---- Fitting the screen ------------------------------------------------
  // The page is sized to the visible height, measured; the controls end
  // exactly at the bottom of the screen at any size, and follow a resize.
  for (const [w, h] of [[390, 844], [375, 553], [844, 390], [390, 664]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const fit = await D(page, () => {
      const bar = document.querySelector('.control-bar').getBoundingClientRect();
      return { barBottom: Math.round(bar.bottom), inner: innerHeight, fitted: window.__streetDebug.fittedHeight(),
        canvasBottom: Math.round(document.querySelector('canvas').getBoundingClientRect().bottom), barTop: Math.round(bar.top),
        hudTop: Math.round(document.querySelector('.hud-bar').getBoundingClientRect().top),
        canvasTop: Math.round(document.querySelector('canvas').getBoundingClientRect().top),
        rootTop: Math.round(document.getElementById('gameRoot').getBoundingClientRect().top) };
    });
    check('at ' + w + 'x' + h + ' the controls end at the bottom of the screen, the picture above them',
      fit.fitted === h && fit.barBottom === h && fit.canvasBottom <= fit.barTop + 1, fit);
    check('...and nothing is cut off at the top: the header at the top of the screen, the picture below it',
      fit.hudTop === 0 && fit.canvasTop >= fit.rootTop - 1, fit);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // The lab's way in on a phone - three taps on the tag - with real
  // touches. The tag takes its own taps (so iOS never reads them as a
  // double-tap zoom, which pushed the header off the top of the screen).
  {
    const ctx2 = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const tp = await ctx2.newPage();
    await tp.goto(ctx.url('main-street.html'));
    await tp.waitForTimeout(500);
    const tag = await tp.locator('#labTap').boundingBox();
    for (let i = 0; i < 3; i++) { await tp.touchscreen.tap(tag.x + tag.width / 2, tag.y + tag.height / 2); await tp.waitForTimeout(80); }
    await tp.waitForTimeout(200);
    const r = await tp.evaluate(() => ({ lab: window.__streetDebug.lab.isOpen(), scale: window.visualViewport ? window.visualViewport.scale : 1 }));
    check('three taps on the tag open the lab, and the page is not zoomed', r.lab && Math.abs(r.scale - 1) < 0.01, r);
    await ctx2.close();
  }

  // ---- The ambush on arrival ------------------------------------------
  // Stepping out: fire thrown from all round, the walls crawling, and a
  // grenade waiting a few steps ahead that doesn't run out. Picked up,
  // it says how to use it; set off, it clears the lot.
  {
    await D(page, () => { const d = window.__streetDebug; d.restart(); d.setSpawning(true); d.setInvincible(true); });
    let st = await until(page, (x) => x.mode === 'walking', 15000);
    const climbing = st.enemies.filter((e) => e.climb > 0).length;
    check('stepping out: fire already thrown from all round', st.fires.length >= T.OPEN_FIRES - 2, st.fires.length);
    check('...the walls crawling', climbing >= T.OPEN_CLIMBERS - 2, climbing);
    const g = st.dropList.find((o) => o.keep);
    check('...and a grenade waiting a few steps ahead', !!g && g.d > st.pd + 40 && g.d < st.pd + 250, { drops: st.dropList, pd: st.pd });
    st = await until(page, (x) => x.banner === 'GRAB THE ENERGY GRENADE', 8000);
    check('...with a banner saying to grab it, once the street\'s title has gone', st.banner === 'GRAB THE ENERGY GRENADE', st.banner);
    await D(page, (o) => { window.__streetDebug.timeScale = 2; }, null);
    st = await until(page, (x) => x.t > 12, 20000);
    await D(page, () => { window.__streetDebug.timeScale = 1; });
    check('...it waits for you: it doesn\'t run out', st.dropList.some((o) => o.keep), st.dropList);
    await D(page, (o) => window.__streetDebug.setPlayer(o.x, o.d), st.dropList.find((o) => o.keep));
    st = await until(page, (x) => x.grenades > 0, 3000);
    check('...picked up, it says how to use it', st.grenades === 1 && st.banner === 'ENERGY GRENADE' && /set it off/.test(st.bannerSub), st);
    await D(page, () => { const d = window.__streetDebug; d.setSpawning(false); d.launchFire(); d.detonate(); });
    st = await until(page, (x) => !x.pulse, 8000);
    check('...set off, it clears the fire and the walls', st.fires.length === 0 && st.enemies.length === 0, { fires: st.fires.length, enemies: st.enemies.length });
  }

  // ---- The end of the street ----------------------------------------
  // The checkpoint: reached, it is kept, and a game over after it can
  // carry on from there with fresh lives and the score you had there.
  {
    await quietStreet(page);
    await D(page, (m) => window.__streetDebug.jumpTo(m), T.CHECKPOINT_M - 1);
    await D(page, () => { const d = window.__streetDebug; d.setSpawning(false); d.clear(); d.setScore(1234); });
    let st = await state(page);
    await D(page, (pd) => window.__streetDebug.setPlayer(0, pd), st.pd + 60);
    st = await until(page, (x) => x.checkpoint, 4000);
    check('passing ' + T.CHECKPOINT_M + ' m makes a checkpoint, with the score then', st.checkpoint && st.checkpoint.score === 1234 && st.banner === 'CHECKPOINT', st.checkpoint);
    await D(page, () => { const d = window.__streetDebug; d.setLives(1); const s = d.state(); d.spawnEnemy('grunt', s.px, s.pd); });
    st = await until(page, (x) => x.overlay, 6000);
    check('...a game over after it offers to carry on from it', st.mode === 'over' && st.overlay && st.checkpointOffered, st);
    await page.locator('#checkpointBtn').dispatchEvent('click');
    st = await state(page);
    check('...which puts you back at the checkpoint, fresh lives, the score you had there',
      st.mode === 'walking' && Math.abs(st.bestM - T.CHECKPOINT_M) < 1 && st.lives === T.LIVES && st.score === 1234 && st.continues === 1 && !st.overlay, st);
    await quietStreet(page);
    await D(page, () => { const d = window.__streetDebug; d.setLives(1); const s = d.state(); d.spawnEnemy('grunt', s.px, s.pd); });
    st = await until(page, (x) => x.overlay, 6000);
    check('...and a game over before it does not', st.mode === 'over' && !st.checkpointOffered, st);
  }

  // The run: past RUN_START_M the street falls in behind you, a front
  // crumbling up it, slab by slab, at about CRUMBLE_SPEED on average -
  // ragged, not a straight line; it takes the aliens behind it, and
  // you if it reaches you - then, back on your feet, it is pushed back.
  {
    await quietStreet(page);
    await D(page, (m) => window.__streetDebug.jumpTo(m), T.RUN_START_M - 1);
    await D(page, () => { const d = window.__streetDebug; d.setSpawning(false); d.clear(); });
    let st = await state(page);
    check('no collapse before the run', st.collapseD === null, st.collapseD);
    await D(page, (pd) => window.__streetDebug.setPlayer(0, pd), st.pd + 60);
    st = await until(page, (x) => x.collapseD !== null, 4000);
    check('...past ' + T.RUN_START_M + ' m the street starts to crumble, just under the bottom of the picture, under a banner', st.collapseD !== null && st.collapseD < st.pd - 150 && st.collapseD < st.camD + 0.7 * 240 && /CRUMBLING/.test(st.banner), st);
    await D(page, () => window.__streetDebug.setInvincible(true));
    // Standing still: from where it keeps up to, it creeps in at its own pace.
    const c0 = await D(page, () => { const d = window.__streetDebug, s = d.state(), at = s.camD + 0.7 * 240; d.setCollapse(at); d.timeScale = 4; return { d: at, t: s.t }; });
    st = await until(page, (x) => x.t > c0.t + 6, 15000);
    await D(page, () => { window.__streetDebug.timeScale = 1; });
    const rate = (st.collapseD - c0.d) / (st.t - c0.t);
    check('...creeping up the street at about ' + T.CRUMBLE_SPEED + ' px/s, well under walking pace', Math.abs(rate - T.CRUMBLE_SPEED) < T.CRUMBLE_SPEED * 0.35 && rate < T.WALK_SPEED / 2, rate);
    const edges = await D(page, () => { const d = window.__streetDebug; return [-150, -110, -70, -30, 10, 50, 90, 130].map((x) => d.edgeAt(x)); });
    // Walking away from it: it is never left out of sight - it keeps up
    // with the bottom of the picture.
    await D(page, () => { const d = window.__streetDebug, s = d.state(); d.setCollapse(s.camD - 300); d.setPlayer(0, s.pd + 500); });
    st = await until(page, (x) => x.collapseD > x.camD + 0.5 * 240 && x.camD > c0.d, 8000);
    check('...and walk away from it and it keeps up, crumbling along the bottom of the picture',
      st.collapseD > st.camD + 0.5 * 240 && st.collapseD < st.pd, { edge: st.collapseD, camD: st.camD, pd: st.pd });
    check('...a ragged edge, slab by slab, not a straight line', new Set(edges).size > 1 && edges.every((e) => Math.abs(e - edges[0]) % 40 < 1e-6 || Math.abs(Math.abs(e - edges[0]) % 40 - 40) < 1e-6), edges);
    await D(page, () => { const d = window.__streetDebug, s = d.state(); d.spawnEnemy('grunt', 100, s.collapseD + 5); });
    await D(page, () => { const d = window.__streetDebug, s = d.state(); d.setCollapse(s.collapseD + 30); });
    st = await until(page, (x) => x.enemies.length === 0, 3000);
    check('...an alien it reaches goes down with it', st.enemies.length === 0, st.enemies);
    await D(page, () => { const d = window.__streetDebug; d.setInvincible(false); const s = d.state(); d.setCollapse(s.pd - 5); });
    st = await until(page, (x) => x.mode !== 'walking', 3000);
    check('...and it takes you if it reaches you', st.mode === 'dying' && st.lastDeath === 'collapse', st);
    st = await until(page, (x) => x.mode === 'walking', 6000);
    check('...pushed back off you when you are back on your feet', st.mode === 'walking' && st.collapseD <= st.pd - 120, st);
  }

  // The plaza: the camera stops, the spire's wall bounds it, and the
  // guardian assembles in front of the door while aliens keep coming.
  // Your shots hit its lowest piece; edge-on they glance off; its shots
  // kill; with it down the door opens, and walking in wins.
  {
    await quietStreet(page);
    await D(page, (m) => window.__streetDebug.jumpTo(m), T.STREET_END_M);
    let st = await until(page, (x) => x.finale, 3000);
    check('at ' + T.STREET_END_M + ' m the plaza: the guardian comes, under a banner', st.finale && !st.finale.open && st.boss && st.boss.mode === 'assembling' && st.banner === 'THE GUARDIAN', st);
    await D(page, () => { const d = window.__streetDebug; d.setInvincible(true); const s = d.state(); d.setPlayer(0, s.wallD + 500); });
    await page.waitForTimeout(300);
    st = await state(page);
    check('...the camera stops there, and you can\'t walk into it', Math.abs(st.camD - st.lockD) < 1e-6 && st.pd < st.bossD - 30 && st.bossD < st.wallD, st);
    await D(page, () => window.__streetDebug.setSpawning(true));
    st = await until(page, (x) => x.enemies.length + x.portals > 2, 6000);
    check('...and they keep coming for you there', st.enemies.length + st.portals > 2, st.enemies.length);
    check('...but no fence switches on in the plaza', st.fenceLive.every((l) => !l), st.fences);
    const kinds = await D(page, () => { const d = window.__streetDebug; d.clear(); const a = d.pickKinds(1000); d.spawnEnemy('brute', 0, d.state().pd + 150); const b = d.pickKinds(300); d.clear(); return { a, b }; });
    check('...brutes are rare there, and never two at once', (kinds.a.brute || 0) < 1000 * T.PLAZA_BRUTES * 2 && !kinds.b.brute, kinds);
    await D(page, () => { const d = window.__streetDebug; d.setSpawning(false); d.clear(); d.bossReady(); });
    const lowest = await D(page, () => window.__streetDebug.bossHitAt(0));
    check('...a low shot up the middle meets the lowest piece first', lowest === 'bottom', lowest);
    await D(page, () => { const d = window.__streetDebug, s = d.state(); d.setPlayer(0, s.bossD - 180); d.setBossVolley(99); });
    await page.keyboard.down('ArrowUp');
    st = await until(page, (x) => x.boss && x.boss.hits > 0, 10000);
    await page.keyboard.up('ArrowUp');
    const hp = {}; (st.boss ? st.boss.pieces : []).forEach((p) => { hp[p.id] = p.hp; });
    check('...shooting it wears the piece down', st.boss && st.boss.hits > 0 && hp.bottom < T.BOSS_TRI_HP && hp.core === T.BOSS_CORE_HP && hp.top === T.BOSS_TRI_HP, st.boss);
    await D(page, () => window.__streetDebug.damageBoss('bottom', 99));
    st = await state(page);
    check('...a piece shot to nothing and the rest regroup into a new form', st.boss.form === 'triad' && st.banner === 'TRIAD', st.boss);
    await D(page, () => { const d = window.__streetDebug; d.setInvincible(false); d.state(); d.setBossVolley(0.05); });
    st = await until(page, (x) => x.mode !== 'walking', 8000);
    check('...its shots cross the plaza and kill', st.lastDeath === 'guardian' && st.bossShotsFired > 0, st);
    st = await until(page, (x) => x.mode === 'walking', 6000);
    await D(page, () => { const d = window.__streetDebug; d.setInvincible(true); d.killBoss(); });
    st = await state(page);
    check('...with it down the door opens', !st.boss && st.finale.open && st.banner === 'GUARDIAN DOWN', st);
    await D(page, () => { const d = window.__streetDebug; d.setPlayer(0, d.state().wallD); });
    st = await until(page, (x) => x.overlay, 6000);
    check('...and walking in wins: the results', st.mode === 'won' && st.overlay && st.overTitle === 'The spire' && st.bonus > 0 && !st.checkpointOffered, st);
  }
  {
    const lab = await D(page, () => ({
      jumps: Array.from(document.querySelectorAll('[data-jump-to]')).map(b => b.getAttribute('data-jump-to')),
      rows: ['RUN_START_M', 'STREET_END_M', 'CRUMBLE_SPEED', 'CHECKPOINT_M', 'BOSS_TRI_HP', 'BOSS_SHOT_TIME'].every(k => window.__streetDebug.settingsReport().indexOf('(' + k + ')') >= 0)
    }));
    check('the lab jumps to the checkpoint, the run and the door, and has the finale and guardian settings', lab.jumps.join() === 'checkpoint,run,door' && lab.rows, lab);
    await page.locator('[data-jump-to="door"]').dispatchEvent('click');
    const st = await until(page, (x) => x.finale, 3000);
    check('..."The door" goes straight to the plaza', !!st.finale, st.mode);
    await quietStreet(page);
  }

  // The settings exporter: every setting, changed ones first, and a line
  // of JSON that round-trips.
  {
    await D(page, () => window.__streetDebug.tune('WALK_SPEED', 200));
    const rep = await D(page, () => window.__streetDebug.settingsReport());
    const json = JSON.parse(rep.split('JSON: ')[1]);
    const lines = rep.split('\n');
    check('the settings report marks a changed setting first, with its default', /^\* .*\(WALK_SPEED\): 200 px\/s\s+\[default /.test(lines[2]), lines.slice(0, 4));
    check('...lists every setting', Object.keys(T).every(k => rep.indexOf('(' + k + ')') >= 0), Object.keys(T).filter(k => rep.indexOf('(' + k + ')') < 0));
    check('...and ends with all of them as JSON', json.WALK_SPEED === 200 && Object.keys(json).length === Object.keys(T).length, Object.keys(json).length);
    await D(page, (v) => window.__streetDebug.tune('WALK_SPEED', v), T.WALK_SPEED);
  }

  // ---- On from the descent ---------------------------------------------
  await page.goto(ctx.url('descent.html?from=head-on&score=4321'));
  await page.waitForTimeout(400);
  await D(page, () => { const d = window.__descentDebug; d.setInvincible(true); d.startCity('landing'); });
  await page.waitForFunction(() => window.__descentDebug.state().overlay, null, { timeout: 20000 }).catch(() => {});
  const out = await D(page, () => {
    const b = document.getElementById('outBtn');
    return { shown: getComputedStyle(b).display !== 'none', href: b.getAttribute('href') };
  });
  check('the descent\'s landing offers the way out', out.shown && out.href === 'main-street.html?from=descent&score=4321', out);
  await page.click('#outBtn');
  await page.waitForFunction(() => !!window.__streetDebug, null, { timeout: 5000 }).catch(() => {});
  const run = await D(page, () => window.__streetDebug && window.__streetDebug.run());
  check('...into Main Street, with the Head-On score carried along', run && run.fromDescent && run.score === 4321, run);

  const re = await D(page, () => window.__streetDebug ? window.__streetDebug.runtimeErrors.count : -1);
  check('no runtime errors', re === 0, re);
  check('no page errors', ctx.errors.length === 0, ctx.errors);
}, { page: 'main-street.html' });
