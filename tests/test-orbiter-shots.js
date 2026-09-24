// Orbiter shots: the banked dots double as guns, fired by the ordinary
// fire button. See the ORBITER_* constants block in head-on.html.
//
// The mechanic is defined by what it REFUSES to do as much as what it
// does - one shot in flight per dot, no dot consumed by firing, no effect
// on anything outside its own colour family - so most of this file is
// those limits rather than "does a shot come out".
const harness = require('./harness');

const SETTLE = `
  const scene = window.__headOnDebug.scene, state = scene.state;
  scene.resetGame();
  window.__headOnDebug.skipFormationEntry();
  state.diveTimer = 9999;
`;

// Flies whatever is in the air until the sky is clear.
const FLY = `
  for (let i = 0; i < 900 && state.orbiters.length; i++) scene.updateOrbiters(0.016);
`;

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;

  check('no page errors on load', errors.length === 0, errors);

  // TUNING is seeded at load from plain `var` constants, so a key whose
  // constant sits lower in the file arrives undefined through hoisting -
  // and defaults() called later looks fine, which is what makes it easy
  // to miss. This commit adds five such keys.
  const seeded = await page.evaluate(() => {
    const live = window.__headOnTuning.tuning;
    return Object.keys(live).filter(k => {
      const v = live[k];
      return v === undefined || (typeof v === 'number' && isNaN(v));
    });
  });
  check('every live tuning value is seeded (no hoisting holes)', seeded.length === 0, seeded);

  // --- firing --------------------------------------------------------------
  const fired = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 3);
    scene.updatePowerupDots(0.25);
    const dotsBefore = state.powerup.dots.length;
    scene.launchOrbiters();
    const first = state.orbiters.length;
    scene.launchOrbiters();          // the gate: nothing more should come out
    const second = state.orbiters.length;
    ({ dotsBefore, dotsAfter: state.powerup.dots.length, first, second,
       colors: state.orbiters.map(o => o.colorKey) });
  `);
  check('one shot comes out per loaded dot', fired.first === 3, fired);
  check('a second tap adds nothing while they are all in flight', fired.second === 3, fired);
  // The whole economy rests on this: firing is free, so the cost of the
  // brick cannon becomes "it disarms you".
  check('firing does not consume the dot', fired.dotsAfter === fired.dotsBefore, fired);
  check('a shot carries its dot\'s colour', fired.colors.every(c => c === 'green'), fired);

  const partial = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 3);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    // Kill one shot off; only the gun that freed up should reload.
    scene.destroyOrbiter(0);
    scene.launchOrbiters();
    ({ total: state.orbiters.length });
  `);
  check('only the gun whose shot ended fires again', partial.total === 3, partial);

  // --- the colour gate -----------------------------------------------------
  const gate = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    const counts = c => state.formation.filter(f => f.alive && f.colorKey === c).length;
    const before = { green: counts('green'), blue: counts('blue'), red: counts('red') };
    // Fire repeatedly until the greens run out or we give up.
    for (let round = 0; round < 40; round++) {
      scene.launchOrbiters();
      for (let i = 0; i < 400 && state.orbiters.length; i++) scene.updateOrbiters(0.016);
      if (counts('green') === 0) break;
    }
    ({ before, after: { green: counts('green'), blue: counts('blue'), red: counts('red') } });
  `);
  check('a green gun clears the greens', gate.after.green < gate.before.green, gate);
  check('and never touches another colour',
    gate.after.blue === gate.before.blue && gate.after.red === gate.before.red, gate);

  const spent = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    const before = state.formation.filter(f => f.alive && f.colorKey === 'green').length;
    ${FLY}
    ({ before, after: state.formation.filter(f => f.alive && f.colorKey === 'green').length,
       left: state.orbiters.length });
  `);
  // One target then spent is what keeps the rate cap honest - a shot that
  // ploughed through a colour column would make it meaningless.
  check('a shot takes at most one enemy', spent.before - spent.after <= 1, spent);
  check('and is gone afterwards', spent.left === 0, spent);

  // Directly, on the frame it connects - "gone afterwards" above is also
  // satisfied by a shot that expired, so it cannot tell a spent shot from
  // a shot that ploughed on and timed out.
  const spentNow = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    const target = state.formation.filter(f => f.alive && f.colorKey === 'green')[0];
    const o = state.orbiters[0];
    o.x = target.x; o.y = target.y;
    scene.updateOrbiters(0.016);
    ({ killed: !target.alive, left: state.orbiters.length });
  `);
  check('a shot is spent on the very frame it kills',
    spentNow.killed && spentNow.left === 0, spentNow);

  // Steering is colour-gated too, not just damage. A shot that chased the
  // nearest enemy of ANY colour would spend its flight following things it
  // cannot hurt - and the damage tests above would never notice.
  const steer = await page.evaluate(SETTLE + `
    // One green far left, one blue nearer right, nothing else alive.
    const green = state.formation.filter(f => f.colorKey === 'green')[0];
    const blue = state.formation.filter(f => f.colorKey === 'blue')[0];
    state.formation.forEach(f => {
      if (f !== green && f !== blue && f.alive) { f.sprite.destroy(); f.alive = false; }
    });
    green.x = 40;  green.y = 120;
    blue.x = 250;  blue.y = 200;
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    const o = state.orbiters[0];
    o.x = 180; o.y = 320; o.heading = -Math.PI / 2; // dead ahead, between the two
    for (let i = 0; i < 40; i++) scene.updateOrbiters(0.016);
    const left = state.orbiters[0];
    ({ drifted: left ? +(left.x - 180).toFixed(1) : null });
  `);
  check('a shot steers toward its own colour, not the nearest enemy',
    steer.drifted !== null && steer.drifted < 0, steer);

  const shards = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('red', 1);
    scene.updatePowerupDots(0.25);
    state.brickShards.push({
      x: state.ship.x, y: 300, vx: 0, vy: 0, phase: 'attack', age: 0, colorKey: 'red',
      sprite: scene.add.sprite(state.ship.x, 300, 'brickShardTex_red')
    });
    const o = state.orbiters;
    scene.launchOrbiters();
    o[0].x = state.ship.x; o[0].y = 300; // put it on the shard
    const hit = scene.orbiterVsEnemies(o[0]);
    ({ hit, shardsLeft: state.brickShards.length });
  `);
  check('a shot kills a matching brick shard too - a colour family is the whole colour',
    shards.hit === true && shards.shardsLeft === 0, shards);

  // --- aiming by rhythm ----------------------------------------------------
  // The launch heading comes from where the dot IS on its orbit, so the
  // spread is chosen by when you tapped. If this collapses, the weapon has
  // quietly become a straight-up gun.
  const aim = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 1);
    const sweep = [];
    for (let i = 0; i < 16; i++) {
      scene.updatePowerupDots((Math.PI * 2 / 16) / 3);
      scene.launchOrbiters();
      if (state.orbiters.length) {
        sweep.push(+(state.orbiters[0].heading * 180 / Math.PI + 90).toFixed(1));
        scene.clearOrbiters();
      }
    }
    ({ sweep, min: Math.min(...sweep), max: Math.max(...sweep) });
  `);
  check('orbit position aims the shot across a wide arc',
    aim.max - aim.min > 80, aim);
  check('and it never launches downward, wherever the dot is',
    aim.sweep.every(a => Math.abs(a) < 90), aim);

  const fan = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 3);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    const h = state.orbiters.map(o => +(o.heading * 180 / Math.PI + 90).toFixed(1));
    ({ h, spread: Math.max(...h) - Math.min(...h) });
  `);
  check('three dots fire as a fan, not a stack', fan.spread > 40, fan);

  // Homing has to stay weak enough that the launch angle survives it. At
  // 0.7+ a shot straightens onto its target almost at once and the fan
  // above stops meaning anything.
  const ballistic = await page.evaluate(SETTLE + `
    const T = window.__headOnTuning.tuning;
    T.orbiterTurnRate = 0;
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.7);
    scene.launchOrbiters();
    const h0 = state.orbiters[0].heading;
    for (let i = 0; i < 30; i++) scene.updateOrbiters(0.016);
    const drift = state.orbiters.length ? Math.abs(state.orbiters[0].heading - h0) : -1;
    T.orbiterTurnRate = window.__headOnTuning.defaults().orbiterTurnRate;
    scene.clearOrbiters();
    ({ drift: +drift.toFixed(4) });
  `);
  check('homing at 0 leaves a shot on the heading it launched with',
    ballistic.drift === 0, ballistic);

  // The property that actually matters, asserted directly rather than via
  // a magic range on the constant: at the SHIPPED homing strength, which
  // enemy dies still depends on when you fired. Hit rate alone does not
  // show this - a shot can be nearly unmissable and still pick its target
  // from where it launched.
  const picks = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    const hit = [];
    for (let phase = 0; phase < 12; phase++) {
      scene.resetGame();
      window.__headOnDebug.skipFormationEntry();
      state.diveTimer = 9999;
      window.__headOnDebug.giveOrbs('green', 1);
      scene.updatePowerupDots((2.094 / 12) * phase + 0.001);
      scene.launchOrbiters();
      const before = state.formation.filter(f => f.alive && f.colorKey === 'green').map(g => g.col);
      for (let i = 0; i < 900 && state.orbiters.length; i++) scene.updateOrbiters(0.016);
      const after = state.formation.filter(f => f.alive && f.colorKey === 'green').map(g => g.col);
      const killed = before.filter(c => after.indexOf(c) === -1);
      hit.push(killed.length ? killed[0] : -1);
    }
    ({ hit, distinct: new Set(hit.filter(c => c >= 0)).size });
  `);
  check('at the shipped homing strength, when you fire still picks the target',
    picks.distinct >= 2, picks);

  // --- the reload gauge ----------------------------------------------------
  const gauge = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 2);
    scene.updatePowerupDots(0.25);
    const loaded = state.powerup.dots.map(d => d.sprite.alpha);
    scene.launchOrbiters();
    scene.updatePowerupDots(0.016);
    const reloading = state.powerup.dots.map(d => d.sprite.alpha);
    scene.clearOrbiters();
    scene.updatePowerupDots(0.016);
    ({ loaded, reloading, restored: state.powerup.dots.map(d => d.sprite.alpha) });
  `);
  check('a loaded dot is solid', gauge.loaded.every(a => a === 1), gauge);
  check('a dot dims while its shot is out - the ring is the reload gauge',
    gauge.reloading.every(a => a < 0.5), gauge);
  check('and comes back when the shot is gone', gauge.restored.every(a => a === 1), gauge);

  // --- orphaning -----------------------------------------------------------
  // A dot can die three ways while its shot is still flying. None of them
  // should reach into the shot, and none should crash.
  const orphan = await page.evaluate(SETTLE + `
    const out = {};
    // 1. spent on the brick cannon
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    scene.spendBankedOrb('green');
    out.cannon = { dots: state.powerup.dots.length, shots: state.orbiters.length };
    scene.clearOrbiters();

    // 2. spent blocking a hazard
    window.__headOnDebug.giveOrbs('blue', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    scene.consumeShieldDot(0);
    out.shield = { dots: state.powerup.dots.length, shots: state.orbiters.length };
    scene.clearOrbiters();

    // 3. wiped by a death
    window.__headOnDebug.giveOrbs('red', 2);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    scene.clearPowerup();
    out.death = { dots: state.powerup.dots.length, shots: state.orbiters.length };

    // ...and an orphan still flies and still resolves.
    let steps = 0;
    for (let i = 0; i < 900 && state.orbiters.length; i++) { scene.updateOrbiters(0.016); steps++; }
    out.orphanResolved = state.orbiters.length === 0 && steps > 0;
    out;
  `);
  check('a shot outlives its dot being spent on the cannon',
    orphan.cannon.dots === 0 && orphan.cannon.shots === 1, orphan.cannon);
  check('a shot outlives its dot blocking a hazard',
    orphan.shield.dots === 0 && orphan.shield.shots === 1, orphan.shield);
  check('shots outlive the death that wipes the bank',
    orphan.death.dots === 0 && orphan.death.shots === 2, orphan.death);
  check('an orphaned shot still flies out and cleans itself up', orphan.orphanResolved, orphan);

  // A fresh dot must not inherit a dead dot's gun - ids are per dot, not
  // per colour, or re-banking green while a green shot flies would arrive
  // pre-jammed.
  const rebank = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    scene.spendBankedOrb('green');       // shot still in flight, dot gone
    window.__headOnDebug.giveOrbs('green', 1); // a brand new green
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    ({ shots: state.orbiters.length });
  `);
  check('a newly banked dot is loaded, even with an orphan of its colour still up',
    rebank.shots === 2, rebank);

  // --- lifetime and cleanup ------------------------------------------------
  const expiry = await page.evaluate(SETTLE + `
    state.formation.forEach(f => { if (f.alive) { f.sprite.destroy(); f.alive = false; } });
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    let t = 0;
    for (let i = 0; i < 2000 && state.orbiters.length; i++) { scene.updateOrbiters(0.016); t += 0.016; }
    ({ t: +t.toFixed(2), left: state.orbiters.length, lifetime: window.__headOnTuning.tuning.orbiterLifetime });
  `);
  check('a shot with nothing to hit leaves rather than lingering forever',
    expiry.left === 0 && expiry.t <= expiry.lifetime + 0.1, expiry);

  // --- the off switches ----------------------------------------------------
  const off = await page.evaluate(SETTLE + `
    const T = window.__headOnTuning.tuning;
    T.orbiterEnabled = false;
    window.__headOnDebug.giveOrbs('green', 2);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    const none = state.orbiters.length;
    T.orbiterEnabled = true;
    ({ none });
  `);
  check('turning them off in the lab stops them firing', off.none === 0, off);

  const inStage = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 2);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    const before = state.orbiters.length;
    window.__headOnDebug.forceChallenge();
    const cleared = state.orbiters.length;
    scene.launchOrbiters();
    const duringStage = state.orbiters.length;
    ({ before, cleared, duringStage });
  `);
  check('entering a meteor stage clears shots in flight',
    inStage.before > 0 && inStage.cleared === 0, inStage);
  check('and nothing fires during one - no meteor has a colour to match',
    inStage.duringStage === 0, inStage);

  // --- the missile button --------------------------------------------------
  // A DOM control anchored to the bottom-right of the BOARD PANEL, not to
  // the game canvas. Scale.FIT letterboxes the canvas inside the panel,
  // leaving ~100px of panel below the game on a tall phone - and --board
  // and the canvas background are the same #1e293b, so that band reads as
  // the bottom of the game screen. Anchoring to the panel puts the button
  // as low and as near the fire pad as the game screen goes, with no
  // letterbox arithmetic and nothing to recompute on resize.
  const btn = await page.evaluate(SETTLE + `
    const el = () => document.getElementById('missileBtn');
    const out = {};
    out.exists = !!el();
    out.noExtraRow = !document.getElementById('missileBar');

    scene.clearPowerup();
    scene.syncMissileButton();
    out.emptyArmed = el().classList.contains('armed');
    // The board must not change size when the button comes and goes -
    // that was the whole reason this is absolutely positioned.
    const cb = scene.game.canvas.getBoundingClientRect();
    out.boardBefore = { w: Math.round(cb.width), h: Math.round(cb.height), top: Math.round(cb.top) };

    window.__headOnDebug.giveOrbs('green', 1);
    window.__headOnDebug.giveOrbs('blue', 1);
    window.__headOnDebug.giveOrbs('red', 1);
    scene.updatePowerupDots(0.25);
    scene.syncMissileButton();
    const ca = scene.game.canvas.getBoundingClientRect();
    out.boardAfter = { w: Math.round(ca.width), h: Math.round(ca.height), top: Math.round(ca.top) };
    out.armed = el().classList.contains('armed');

    const b = el().getBoundingClientRect();
    const wrap = document.getElementById('canvasWrap').getBoundingClientRect();
    const canvasRect = scene.game.canvas.getBoundingClientRect();
    const canvasTop = canvasRect.top, canvasH = canvasRect.height;
    const fire = document.getElementById('zoneMid').getBoundingClientRect();
    out.insideBoard = b.right <= wrap.right + 1 && b.bottom <= wrap.bottom + 1 && b.top >= wrap.top;
    out.gapToBoardBottom = Math.round(wrap.bottom - b.bottom);
    // The button must take NO layout space. Scale.FIT + CENTER_BOTH
    // centres the canvas in the panel, so equal letterbox above and below
    // is the signature of nothing else competing for that space. A button
    // in the normal flow lands in nearly the same PLACE on a tall screen
    // - it just shoves the play area up out of centre on the way, which
    // position alone cannot see.
    out.letterboxTop = Math.round(canvasTop - wrap.top);
    out.letterboxBottom = Math.round(wrap.bottom - (canvasTop + canvasH));
    out.travel = Math.round(Math.hypot(
      (b.left + b.width / 2) - (fire.left + fire.width / 2),
      (b.top + b.height / 2) - (fire.top + fire.height / 2)));
    out.horizontal = Math.round(Math.abs((b.left + b.width / 2) - (fire.left + fire.width / 2)));
    out;
  `);
  check('the button exists and adds no row to the page', btn.exists && btn.noExtraRow, btn);
  check('it is hidden with nothing banked', btn.emptyArmed === false, btn);
  check('and appears when the power is banked', btn.armed === true, btn);
  // The bug this guards: an earlier version took a row in the layout, so
  // banking or spending an orb resized the board mid-dodge.
  check('arming it neither resizes nor shifts the play area',
    btn.boardBefore.w === btn.boardAfter.w && btn.boardBefore.h === btn.boardAfter.h &&
    btn.boardBefore.top === btn.boardAfter.top, btn);
  check('it takes no layout space - the play area stays centred in the board',
    Math.abs(btn.letterboxTop - btn.letterboxBottom) <= 2, btn);
  check('it sits inside the board panel, near its bottom edge',
    btn.insideBoard && btn.gapToBoardBottom >= 0 && btn.gapToBoardBottom <= 24, btn);
  // The reason it is in that corner at all: thumb travel from the fire pad.
  check('and lines up just above the fire pad, so the thumb barely travels',
    btn.horizontal <= 24 && btn.travel <= 120, btn);

  const pips = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 1);
    window.__headOnDebug.giveOrbs('blue', 1);
    window.__headOnDebug.giveOrbs('red', 1);
    scene.updatePowerupDots(0.25);
    scene.syncMissileButton();
    const layout = scene.missilePipLayout();
    const dom = () => ({
      total: document.querySelectorAll('.missile-pip').length,
      loaded: document.querySelectorAll('.missile-pip.loaded').length,
      spent: document.querySelectorAll('.missile-pip.spent').length
    });
    const before = dom();
    scene.launchOrbiters();
    scene.syncMissileButton();
    const firing = dom();
    scene.clearOrbiters();
    scene.syncMissileButton();
    const after = dom();
    ({ colors: layout.map(p => p.colorKey), before, firing, after });
  `);
  check('one pip per banked dot, in the bank\'s colours',
    pips.colors.join(',') === 'green,blue,red' && pips.before.total === 3, pips);
  check('pips read as loaded before firing', pips.before.loaded === 3, pips);
  check('they empty out as their shots go up', pips.firing.spent === 3, pips);
  check('and refill when the shots are done', pips.after.loaded === 3, pips);

  // Tapped for real, by the browser, at the button's actual place.
  const tapBefore = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('red', 2);
    scene.updatePowerupDots(0.25);
    scene.syncMissileButton();
    ({ bullets: state.bullets.length });
  `);
  await page.locator('#missileBtn').click();
  await page.waitForTimeout(120);
  const tapped = await page.evaluate(() => {
    const state = window.__headOnDebug.scene.state;
    return { shots: state.orbiters.length, bullets: state.bullets.length };
  });
  check('a real tap on it launches the volley', tapped.shots === 2, { tapped, tapBefore });
  // The point of a separate trigger: you can pick the moment without also
  // spraying the main gun.
  check('and fires no ordinary bullet', tapped.bullets === tapBefore.bullets, { tapped, tapBefore });

  // A hidden button must not fire even when there IS something loaded -
  // game over with a full bank is the case that separates "the button is
  // guarded" from "there was nothing to shoot anyway". launchOrbiters()
  // does not check the phase itself.
  const guarded = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('green', 2);
    scene.updatePowerupDots(0.25);
    state.phase = 'gameover';
    scene.syncMissileButton();
    const el = document.getElementById('missileBtn');
    const hidden = !el.classList.contains('armed') &&
                   getComputedStyle(el).pointerEvents === 'none';
    el.dispatchEvent(new Event('pointerdown'));
    const whileHidden = state.orbiters.length;
    state.phase = 'playing';
    ({ hidden, loaded: state.powerup.dots.length, whileHidden });
  `);
  check('the button hides and stops taking taps once the game is over', guarded.hidden, guarded);
  check('and cannot be pressed into firing, bank loaded or not',
    guarded.loaded === 2 && guarded.whileHidden === 0, guarded);

  const notFire = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('red', 2);
    scene.updatePowerupDots(0.25);
    state.input.fire = true;
    scene.updateFiring(0.016);
    state.input.fire = false;
    ({ shots: state.orbiters.length, bullets: state.bullets.length });
  `);
  check('the main fire pad no longer launches missiles',
    notFire.shots === 0 && notFire.bullets > 0, notFire);

  const stageBtn = await page.evaluate(SETTLE + `
    window.__headOnDebug.giveOrbs('blue', 1);
    scene.syncMissileButton();
    const before = document.getElementById('missileBtn').classList.contains('armed');
    window.__headOnDebug.forceChallenge();
    scene.syncMissileButton();
    ({ before, during: document.getElementById('missileBtn').classList.contains('armed') });
  `);
  check('the button disarms inside a meteor stage', stageBtn.before && !stageBtn.during, stageBtn);

  // --- shot size -----------------------------------------------------------
  // The slider has to move the hit box with the art, or it is lying.
  const size = await page.evaluate(SETTLE + `
    const T = window.__headOnTuning.tuning;
    const probe = (mult) => {
      T.orbiterSize = mult;
      scene.clearOrbiters();
      window.__headOnDebug.giveOrbs('green', 1);
      scene.updatePowerupDots(0.25);
      scene.launchOrbiters();
      const o = state.orbiters[0];
      const target = state.formation.filter(f => f.alive && f.colorKey === 'green')[0];
      const scale = o.sprite.scaleX;
      // Sit just outside the target's own radius and creep in until it
      // connects - the gap that still registers IS the hit radius.
      let reach = 0;
      for (let gap = 40; gap >= 0; gap -= 0.5) {
        o.x = target.x; o.y = target.y + target.radius + gap;
        if (scene.orbiterVsEnemies(o)) { reach = gap; break; }
      }
      scene.clearPowerup(); scene.clearOrbiters();
      return { scale, reach };
    };
    const small = probe(0.5), normal = probe(1), big = probe(2);
    T.orbiterSize = window.__headOnTuning.defaults().orbiterSize;
    ({ small, normal, big });
  `);
  check('the size slider scales the sprite',
    size.small.scale === 0.5 && size.normal.scale === 1 && size.big.scale === 2, size);
  check('and scales the hit radius with it, so the slider is not lying',
    size.small.reach < size.normal.reach && size.normal.reach < size.big.reach, size);

  // Dragging the slider has to be felt on shots ALREADY in the air, or
  // tuning it means firing a fresh volley after every nudge.
  const liveSize = await page.evaluate(SETTLE + `
    const T = window.__headOnTuning.tuning;
    T.orbiterSize = 1;
    window.__headOnDebug.giveOrbs('green', 1);
    scene.updatePowerupDots(0.25);
    scene.launchOrbiters();
    const atLaunch = state.orbiters[0].sprite.scaleX;
    T.orbiterSize = 0.5;
    scene.updateOrbiters(0.016);
    const after = state.orbiters.length ? state.orbiters[0].sprite.scaleX : null;
    T.orbiterSize = window.__headOnTuning.defaults().orbiterSize;
    ({ atLaunch, after });
  `);
  check('resizing mid-flight is felt by shots already up',
    liveSize.atLaunch === 1 && liveSize.after === 0.5, liveSize);

  // --- odds and ends -------------------------------------------------------
  // The orbiting core rides a formation slot; a shot can kill that slot.
  // updateCore() has to notice, the same way it does for a starburst.
  const coreCarrier = await page.evaluate(SETTLE + `
    const carrier = state.core && state.core.carrierSlot;
    if (!carrier) { ({ skipped: true }); } else {
      window.__headOnDebug.giveOrbs(carrier.colorKey, 1);
      scene.updatePowerupDots(0.25);
      scene.launchOrbiters();
      const o = state.orbiters[0];
      o.x = carrier.x; o.y = carrier.y;
      scene.orbiterVsEnemies(o);
      scene.updateCore(0.016);
      ({ skipped: false, carrierDead: !carrier.alive, core: state.core });
    }
  `);
  check('killing the core\'s carrier with a shot cleans the core up, not crashes',
    coreCarrier.skipped || (coreCarrier.carrierDead && coreCarrier.core === null), coreCarrier);

  const leak = await page.evaluate(SETTLE + `
    const baseline = scene.children.list.length;
    window.__headOnDebug.giveOrbs('green', 3);
    for (let volley = 0; volley < 12; volley++) {
      scene.updatePowerupDots(0.3);
      scene.launchOrbiters();
      ${FLY}
    }
    scene.clearPowerup();
    ({ baseline, after: scene.children.list.length, shotsLeft: state.orbiters.length });
  `);
  // Only GROWTH is a leak - the volleys destroy enemies as they go, so the
  // count legitimately falls.
  check('twelve volleys leak no sprites',
    leak.after <= leak.baseline + 2 && leak.shotsLeft === 0, leak);

  // --- live ----------------------------------------------------------------
  const live = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.lives = 99;
    // A hit wipes the bank by design (clearPowerup in shipHit), which
    // would make the "dots still banked" check below measure the wrong
    // thing entirely. Keep the ship out of trouble for the sample.
    state.diveTimer = 9999;
    state.ship.invulnerableUntil = performance.now() + 60000;
    window.__headOnDebug.giveOrbs('green', 2);
    return new Promise(res => setTimeout(() => {
      const scoreBefore = state.score;
      // The missile button, not the fire pad - they are separate triggers now.
      document.getElementById('missileBtn').dispatchEvent(new Event('pointerdown'));
      setTimeout(() => {
        const airborne = state.orbiters.length;
        setTimeout(() => res({
          airborne,
          settled: state.orbiters.length,
          scored: state.score > scoreBefore,
          dotsKept: state.powerup.dots.length,
          phase: state.phase
        }), 5000);
      }, 80);
    }, 1500));
  });
  check('in a real running game a tap puts shots in the air', live.airborne > 0, live);
  check('they resolve on their own', live.settled === 0, live);
  check('they score', live.scored, live);
  check('and the dots are still banked afterwards', live.dotsKept === 2, live);
  check('the run continues', live.phase === 'playing', live);

  check('no page errors after full run', errors.length === 0, errors);
});
