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
  check('the view is the landing\'s: the pad sits where the descent put it', Math.abs(pad.y - (C.CY + (C.GROUND_Y - C.CAM_Y))) < 1 && Math.abs(C.CAM_Y - 11.5) < 1e-9, { pad, C });

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

  // ---- The right stick fires, on its own ------------------------------
  await quietStreet(page);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1000);
  s = await state(page);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('KeyW');
  check('aiming left while walking forward: firing, aimed left', s.firing && s.aimX < -0.99 && Math.abs(s.aimD) < 0.01, s);
  check('...walking forward all the same', s.vd > 50, s.vd);
  check('...and the shots go left, not where you walk', s.bullets.length > 0 && s.bullets.every(b => b.vx < 0 && Math.abs(b.vd) < 1e-6), s.bullets);
  check('steady fire: several shots a second', s.shotsFired >= 5, s.shotsFired);
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
  check('standing still, it does not get harder', s.difficulty === dStart && dStart === 0, { dStart, now: s.difficulty });
  const easy = { every: s.groupEvery, max: s.maxAlive };
  await D(page, () => window.__streetDebug.jumpTo(window.__streetDebug.constants().tuning.RAMP_M / 2));
  s = await state(page);
  check('halfway down the street: half difficulty', Math.abs(s.difficulty - 0.5) < 0.01, s.difficulty);
  check('...groups come closer together and more at once', s.groupEvery < easy.every && s.maxAlive > easy.max, { easy, now: { every: s.groupEvery, max: s.maxAlive } });

  // No fire in the first stretch, however long you stand there.
  await D(page, () => { const d = window.__streetDebug; d.restart(); d.skipIntro(); d.setSpawning(true); d.setInvincible(true); });
  await page.waitForTimeout(3000);
  s = await state(page);
  check('no fire from the buildings at the start of the street', s.firesLaunched === 0 && s.fires.length === 0, s.firesLaunched);
  // ...but there is once you are past FIRE_START_M.
  await D(page, () => window.__streetDebug.jumpTo(window.__streetDebug.constants().tuning.RAMP_M * 0.9));
  s = await until(page, (st) => st.firesLaunched > 0, 6000);
  check('...and there is, well down it', s.firesLaunched > 0, s.firesLaunched);

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

  // ---- Volleys ---------------------------------------------------------------
  await D(page, () => { const d = window.__streetDebug; d.restart(); d.jumpTo(d.constants().tuning.RAMP_M); d.setSpawning(true); d.setInvincible(true); });
  s = await until(page, (st) => st.fires.length >= 3, 8000);
  check('well down the street, several balls of fire are in the air at once', s.fires.length >= 3, s.fires.length);

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
