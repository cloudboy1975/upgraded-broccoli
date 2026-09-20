// Challenge stage: the Galaga-style meteor gauntlet that replaces every
// Nth wave. See the CHALLENGE_* constants block in head-on.html.
//
// The stage is a whole second game mode sharing one update loop, so most
// of what can go wrong is at its edges: what it tears down on the way in,
// what it puts back on the way out, and what it must NOT let the combat
// game do while it runs. Those get as much coverage here as the meteors.
const harness = require('./harness');

// A settled wave with nothing in flight - the state a stage is entered from.
const SETTLE = `
  const scene = window.__headOnDebug.scene, state = scene.state;
  scene.resetGame();
  window.__headOnDebug.skipFormationEntry();
  state.diveTimer = 9999;
`;

// Steps an active stage to completion, returning what happened on the way.
const RUN_STAGE = `
  let t = 0, maxMeteors = 0, volleys = 0, peakStars = 0;
  const beats = [];
  let lastBeat = null;
  for (let i = 0; i < 3000 && state.challenge; i++) {
    window.__headOnDebug.stepChallenge(0.016);
    t += 0.016;
    if (!state.challenge) break;
    if (state.challenge.beat !== lastBeat) { lastBeat = state.challenge.beat; beats.push(lastBeat); }
    maxMeteors = Math.max(maxMeteors, state.challenge.meteors.length);
    volleys = state.challenge.volleysFired;
    peakStars = Math.max(peakStars, state.starSpeedScale);
  }
`;

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;

  check('no page errors on load', errors.length === 0, errors);

  // Guards the class of bug that already bit once: TUNING is seeded at
  // load time from plain `var` constants, so a key whose constant is
  // declared LOWER in the file arrives undefined through hoisting.
  // defaults() looks fine either way, because by then it exists - so this
  // has to read the LIVE object.
  const seeded = await page.evaluate(() => {
    const live = window.__headOnTuning.tuning;
    return Object.keys(live).filter(k => {
      const v = live[k];
      return v === undefined || (typeof v === 'number' && isNaN(v));
    });
  });
  check('every live tuning value is seeded (no hoisting holes)', seeded.length === 0, seeded);

  // --- when a stage is due ----------------------------------------------
  const due = await page.evaluate(SETTLE + `
    const T = window.__headOnTuning.tuning;
    T.challengeEveryWaves = 3;
    const out = {};
    for (let w = 1; w <= 10; w++) { state.wave = w; out[w] = scene.challengeDue(); }
    T.challengeEnabled = false;
    const offAt4 = (state.wave = 4, scene.challengeDue());
    T.challengeEnabled = true;
    ({ out, offAt4 });
  `);
  // state.wave has already been incremented past the wave that ended, so
  // "wave 4" means three waves cleared.
  check('a stage is due after every 3rd cleared wave, and not otherwise',
    due.out[4] === true && due.out[7] === true && due.out[10] === true &&
    due.out[1] === false && due.out[2] === false && due.out[3] === false &&
    due.out[5] === false && due.out[6] === false, due.out);
  check('turning challenge stages off in the lab stops them being due', due.offAt4 === false, due);

  // The route that actually MATTERS: clearing a wave in the ordinary game
  // loop has to hand over to a stage. Every other test here reaches a
  // stage through the debug hook, which bypasses this entirely - a
  // mutation that stopped checkWaveClear() ever starting one passed all
  // of them. This is the only check standing between that and a feature
  // nobody ever sees.
  const viaWaveClear = await page.evaluate(SETTLE + `
    const T = window.__headOnTuning.tuning;
    T.challengeEveryWaves = 3;
    const out = {};
    // Clear wave 3 -> wave becomes 4 -> three waves cleared -> a stage.
    state.wave = 3;
    state.formation.forEach(f => { if (f.alive) { f.sprite.destroy(); f.alive = false; } });
    for (let i = 0; i < 400 && !state.challenge; i++) scene.checkWaveClear(0.016);
    out.startedOnThirdClear = state.challenge !== null;
    out.waveAfter = state.wave;
    out.formationStillEmpty = state.formation.filter(f => f.alive).length === 0;

    // ...and the complement: clearing a wave that is NOT the third just
    // brings the next formation in, with no stage.
    if (state.challenge) { scene.clearMeteors(); state.challenge = null; scene.setColorBarsVisible(true); }
    scene.resetGame();
    window.__headOnDebug.skipFormationEntry();
    state.diveTimer = 9999;
    state.wave = 1;
    state.formation.forEach(f => { if (f.alive) { f.sprite.destroy(); f.alive = false; } });
    for (let i = 0; i < 400 && !state.challenge && !state.formation.some(f => f.alive); i++) scene.checkWaveClear(0.016);
    out.noStageOnFirstClear = state.challenge === null;
    out.formationCameBack = state.formation.filter(f => f.alive).length > 0;
    out;
  `);
  check('clearing the 3rd wave actually starts a stage (not just the debug hook)',
    viaWaveClear.startedOnThirdClear, viaWaveClear);
  check('a stage takes the next wave\'s slot instead of a formation',
    viaWaveClear.formationStillEmpty, viaWaveClear);
  check('clearing an ordinary wave brings the next formation in, not a stage',
    viaWaveClear.noStageOnFirstClear && viaWaveClear.formationCameBack, viaWaveClear);

  // --- entering a stage --------------------------------------------------
  const entry = await page.evaluate(SETTLE + `
    // Litter the screen with everything a stage has to clear away.
    scene.fireBullet ? scene.fireBullet() : null;
    state.bullets.push({ x: 100, y: 200, vy: -100, ttl: 5, trailLevels: {}, trailSprites: {}, sprite: scene.add.sprite(100, 200, 'bulletTex') });
    state.enemyBullets.push({ x: 50, y: 50, vx: 0, vy: 90, sprite: scene.add.sprite(50, 50, 'enemyBulletTex') });
    const before = {
      bars: state.colorBars[0].segments[0].sprite.visible,
      formationAlive: state.formation.filter(f => f.alive).length
    };
    window.__headOnDebug.forceChallenge();
    ({
      before,
      bullets: state.bullets.length,
      enemyBullets: state.enemyBullets.length,
      strips: state.strips.length,
      orbs: state.orbs.length,
      core: state.core,
      barsHidden: state.colorBars[0].segments[0].sprite.visible === false,
      crackHidden: state.colorBars[0].segments[0].crackSprite.visible === false,
      beat: state.challenge.beat,
      volleysTotal: state.challenge.volleysTotal
    });
  `);
  check('entering a stage clears player bullets', entry.bullets === 0, entry);
  check('entering a stage clears enemy fire', entry.enemyBullets === 0, entry);
  check('entering a stage releases the orbiting core', entry.core === null, entry);
  check('the colour bars are hidden for the duration', entry.barsHidden && entry.crackHidden, entry);
  check('a stage starts on its wind-up beat', entry.beat === 'accelerate', entry);
  check('it takes its volley count from the live tuning', entry.volleysTotal === 6, entry);

  // --- the stage itself --------------------------------------------------
  const ran = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    ${RUN_STAGE}
    ({
      seconds: +t.toFixed(2), beats, volleys, maxMeteors, peakStars: +peakStars.toFixed(2),
      ended: state.challenge === null,
      done: state.challengesDone,
      starsAfter: state.starSpeedScale,
      barsBack: state.colorBars[0].segments[0].sprite.visible,
      formationAfter: state.formation.filter(f => f.alive).length
    });
  `);
  check('a stage runs wind-up, gauntlet, wind-down in order',
    ran.beats.join('>') === 'accelerate>run>depart', ran.beats);
  check('a stage ends on its own', ran.ended, ran);
  check('it fires exactly the volleys it promised', ran.volleys === 6, ran);
  check('meteors actually arrived', ran.maxMeteors > 0, ran);
  check('the starfield winds all the way up', ran.peakStars >= 8.9, ran);
  check('and all the way back down', ran.starsAfter === 1, ran);
  check('the bars come back when the stage ends', ran.barsBack === true, ran);
  check('the next formation flies in after the stage', ran.formationAfter > 0, ran);
  check('the stage counts toward the approach', ran.done === 1, ran);

  // The stage must wait for the last rock to LEAVE, not stop on a timer -
  // otherwise a slow meteor gets cut off mid-screen.
  const tail = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    let sawLastVolleyWithMeteors = false, endedWithMeteorsUp = false;
    for (let i = 0; i < 3000 && state.challenge; i++) {
      const ch = state.challenge;
      const wasFinalAndBusy = ch.volleysFired >= ch.volleysTotal && ch.meteors.length > 0;
      if (wasFinalAndBusy) sawLastVolleyWithMeteors = true;
      if (wasFinalAndBusy && ch.beat === 'depart') endedWithMeteorsUp = true;
      window.__headOnDebug.stepChallenge(0.016);
    }
    ({ sawLastVolleyWithMeteors, endedWithMeteorsUp });
  `);
  check('the wind-down waits for the last meteor to pass',
    tail.sawLastVolleyWithMeteors && !tail.endedWithMeteorsUp, tail);

  // --- hazard behaviour ---------------------------------------------------
  const hit = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    state.challenge.beat = 'run';
    state.ship.invulnerableUntil = 0;
    const lives = state.lives, score = state.score;
    const m = { x: state.ship.x, y: 413, vx: 0, vy: 0, radius: 12, spin: 0,
                sprite: scene.add.sprite(state.ship.x, 413, 'meteorTex_0') };
    state.challenge.meteors.push(m);
    scene.shipVsMeteors();
    ({
      lives, livesAfter: state.lives,
      meteorSurvived: state.challenge.meteors.indexOf(m) !== -1,
      scoreUnchanged: state.score === score,
      noDeathBlast: state.starburstFx === null
    });
  `);
  check('a meteor hit costs a life', hit.livesAfter === hit.lives - 1, hit);
  check('the meteor is indestructible - it survives hitting you', hit.meteorSurvived, hit);
  // The board is off screen during a stage, so a blast would only chip the
  // bars invisibly.
  check('no death blast goes off during a stage', hit.noDeathBlast, hit);

  const invuln = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    state.ship.invulnerableUntil = performance.now() + 5000;
    const lives = state.lives;
    state.challenge.meteors.push({ x: state.ship.x, y: 413, vx: 0, vy: 0, radius: 12, spin: 0,
      sprite: scene.add.sprite(state.ship.x, 413, 'meteorTex_0') });
    scene.shipVsMeteors();
    ({ lives, livesAfter: state.lives });
  `);
  check('a meteor cannot touch you while you are respawn-invulnerable',
    invuln.livesAfter === invuln.lives, invuln);

  // A banked shield dot blocks a meteor like every other hazard - but
  // unlike a diver, the rock is NOT destroyed by being blocked.
  const shield = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    state.ship.invulnerableUntil = 0;
    scene.collectColor('red');
    const dot = state.powerup.dots[0];
    const lives = state.lives;
    const m = { x: dot.sprite.x, y: dot.sprite.y, vx: 0, vy: 0, radius: 10, spin: 0,
                sprite: scene.add.sprite(dot.sprite.x, dot.sprite.y, 'meteorTex_0') };
    state.challenge.meteors.push(m);
    scene.shipVsMeteors();
    ({
      lives, livesAfter: state.lives,
      dotsLeft: state.powerup.dots.length,
      meteorSurvived: state.challenge.meteors.indexOf(m) !== -1
    });
  `);
  check('a shield dot blocks a meteor', shield.livesAfter === shield.lives, shield);
  check('and is spent doing it', shield.dotsLeft === 0, shield);
  check('but the meteor is not destroyed by being blocked', shield.meteorSurvived, shield);

  // Bullets spark off rock and are spent - v1 meteors cannot be broken,
  // but the fire button still has to answer.
  const shot = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    const m = { x: 180, y: 300, vx: 0, vy: 0, radius: 12, spin: 0,
                sprite: scene.add.sprite(180, 300, 'meteorTex_0') };
    state.challenge.meteors.push(m);
    const b = { x: 180, y: 300, vy: -400, ttl: 5, trailLevels: {}, trailSprites: {},
                sprite: scene.add.sprite(180, 300, 'bulletTex') };
    state.bullets.push(b);
    const consumed = scene.bulletVsMeteors(b, state.bullets.length - 1);
    ({
      consumed,
      bulletsLeft: state.bullets.length,
      meteorSurvived: state.challenge.meteors.indexOf(m) !== -1,
      sparks: state.challenge.sparks.length
    });
  `);
  check('a bullet is consumed by the rock it hits', shot.consumed === true && shot.bulletsLeft === 0, shot);
  check('the rock survives being shot', shot.meteorSurvived, shot);
  check('and the hit sparks, so firing still reads as doing something', shot.sparks === 1, shot);

  // --- the approach -------------------------------------------------------
  const planet = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    window.__headOnTuning.tuning.challengeStagesToArrival = 5;
    const sizes = [];
    for (let done = 0; done <= 6; done++) {
      state.challengesDone = done;
      scene.updatePlanet();
      sizes.push({ done, approach: +scene.planetApproach().toFixed(3), scale: +scene.planetSprite.scale.toFixed(4) });
    }
    state.challengesDone = 0;
    scene.updatePlanet();
    sizes;
  `);
  check('the planet starts as a distant speck', planet[0].scale > 0 && planet[0].scale < 0.03, planet[0]);
  check('each completed stage brings it closer',
    planet.every((s, i) => i === 0 || s.scale > planet[i - 1].scale || s.approach === 1), planet);
  check('the approach reaches 1 at the configured stage count', planet[5].approach === 1, planet[5]);
  check('and clamps there rather than overshooting',
    planet[6].approach === 1 && planet[6].scale === planet[5].scale, [planet[5], planet[6]]);
  // Growth is non-linear on purpose - the early stages should barely move
  // it so the last approach is the dramatic one.
  check('growth accelerates rather than stepping evenly',
    (planet[5].scale - planet[4].scale) > (planet[1].scale - planet[0].scale) * 3,
    planet.map(s => s.scale));

  // It also has to grow DURING a stage, not jump between them.
  const inStage = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    const start = scene.planetApproach();
    const seen = [];
    for (let i = 0; i < 3000 && state.challenge; i++) {
      window.__headOnDebug.stepChallenge(0.016);
      if (state.challenge) seen.push(+scene.planetApproach().toFixed(4));
    }
    ({ start: +start.toFixed(4), mid: seen[Math.floor(seen.length / 2)], end: seen[seen.length - 1] });
  `);
  check('the planet grows while you are flying at it, not only between stages',
    inStage.mid > inStage.start && inStage.end > inStage.mid, inStage);

  // --- volley patterns ----------------------------------------------------
  const bag = await page.evaluate(SETTLE + `
    state.meteorBag = [];
    const ids = [];
    for (let i = 0; i < 24; i++) ids.push(scene.drawMeteorPattern().id);
    const size = new Set(ids).size;
    let cleanCycles = 0;
    for (let i = 0; i + size <= ids.length; i += size) {
      if (new Set(ids.slice(i, i + size)).size === size) cleanCycles++;
    }
    ({ ids, size, cleanCycles, cycles: Math.floor(ids.length / size) });
  `);
  check('the volley bag deals every pattern once per cycle',
    bag.cleanCycles === bag.cycles && bag.size === 4, bag);

  // The wall's whole point is that there is exactly one way through it.
  const wall = await page.evaluate(SETTLE + `
    const wallPattern = window.__headOnTuning.meteorPatterns.filter(p => p.id === 'wall')[0];
    const gaps = [];
    for (let i = 0; i < 40; i++) {
      const lane = Math.floor(Math.random() * 5);
      const rocks = wallPattern.build({ speed: 300, lane });
      const lanesUsed = rocks.map(r => Math.floor(r.x / (360 / 5)));
      gaps.push({ count: rocks.length, missing: [0,1,2,3,4].filter(l => lanesUsed.indexOf(l) === -1) });
    }
    ({
      alwaysOneGap: gaps.every(g => g.missing.length === 1),
      alwaysFourRocks: gaps.every(g => g.count === 4)
    });
  `);
  check('a wall volley always leaves exactly one lane open', wall.alwaysOneGap, wall);
  check('a wall volley fills every other lane', wall.alwaysFourRocks, wall);

  const spawns = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    const offScreen = [];
    for (let i = 0; i < 3000 && state.challenge; i++) {
      window.__headOnDebug.stepChallenge(0.016);
      if (!state.challenge) break;
      state.challenge.meteors.forEach(m => {
        if (m.spawnChecked) return;
        m.spawnChecked = true;
        offScreen.push(m.y - m.radius < 0);
      });
    }
    ({ total: offScreen.length, allOffScreen: offScreen.every(Boolean) });
  `);
  check('every meteor enters from off screen rather than popping in',
    spawns.total > 0 && spawns.allOffScreen, spawns);

  // --- what a stage must NOT do -------------------------------------------
  const frozen = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    const before = state.difficulty.elapsed;
    ${RUN_STAGE}
    ({ before: +before.toFixed(3), after: +state.difficulty.elapsed.toFixed(3), seconds: +t.toFixed(2) });
  `);
  // The stage is a breather. Letting the difficulty clock run through it
  // would hand the player a harder game for doing nothing.
  check('difficulty does not escalate during a stage',
    frozen.after === frozen.before && frozen.seconds > 5, frozen);

  const noCombat = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    let sawFormation = false, sawEnemyFire = false, sawStrip = false, waveMoved = false;
    const wave = state.wave;
    for (let i = 0; i < 3000 && state.challenge; i++) {
      window.__headOnDebug.stepChallenge(0.016);
      // Only meaningful while the stage is still up: the final step runs
      // endChallenge(), which spawns the next wave by design.
      if (!state.challenge) break;
      if (state.formation.some(f => f.alive)) sawFormation = true;
      if (state.enemyBullets.length) sawEnemyFire = true;
      if (state.strips.length) sawStrip = true;
      if (state.wave !== wave) waveMoved = true;
    }
    ({ sawFormation, sawEnemyFire, sawStrip, waveMoved });
  `);
  check('no enemies spawn during a stage', !noCombat.sawFormation, noCombat);
  check('no enemy fire during a stage', !noCombat.sawEnemyFire, noCombat);
  check('no powerup strips during a stage', !noCombat.sawStrip, noCombat);
  check('the wave counter does not advance during a stage', !noCombat.waveMoved, noCombat);

  // --- teardown -----------------------------------------------------------
  const ended = await page.evaluate(SETTLE + `
    window.__headOnDebug.forceChallenge();
    for (let i = 0; i < 200; i++) window.__headOnDebug.stepChallenge(0.016); // mid-gauntlet
    const meteorsUp = state.challenge.meteors.length;
    scene.endGame();
    ({
      meteorsUp,
      challenge: state.challenge,
      phase: state.phase,
      stars: state.starSpeedScale,
      barsBack: state.colorBars[0].segments[0].sprite.visible,
      flame: scene.flameSprite.visible
    });
  `);
  check('the stage under test really was mid-gauntlet', ended.meteorsUp > 0, ended);
  check('game over during a stage tears the stage down', ended.challenge === null, ended);
  check('game over during a stage restores the bars', ended.barsBack === true, ended);
  check('game over during a stage kills the thrust and the flame',
    ended.stars === 1 && ended.flame === false, ended);

  const reset = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    state.challengesDone = 3;
    window.__headOnDebug.forceChallenge();
    for (let i = 0; i < 200; i++) window.__headOnDebug.stepChallenge(0.016);
    scene.resetGame();
    ({
      challenge: state.challenge,
      done: state.challengesDone,
      stars: state.starSpeedScale,
      barsBack: state.colorBars[0].segments[0].sprite.visible,
      flame: scene.flameSprite.visible,
      planetScale: +scene.planetSprite.scale.toFixed(4)
    });
  `);
  check('a restart mid-stage clears the stage', reset.challenge === null, reset);
  check('a restart puts the approach back to the start', reset.done === 0, reset);
  check('a restart restores the bars and kills the flame',
    reset.barsBack === true && reset.flame === false && reset.stars === 1, reset);
  check('a restart shrinks the planet back to a speck', reset.planetScale < 0.03, reset);

  // --- sprite hygiene ------------------------------------------------------
  // A stage creates and destroys a lot of sprites; a leak here compounds
  // every three waves for a whole run.
  const leak = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    window.__headOnDebug.skipFormationEntry();
    state.diveTimer = 9999;
    const baseline = scene.children.list.length;
    for (let s = 0; s < 3; s++) {
      window.__headOnDebug.forceChallenge();
      for (let i = 0; i < 3000 && state.challenge; i++) window.__headOnDebug.stepChallenge(0.016);
      state.formation.forEach(f => { if (f.alive) { f.sprite.destroy(); f.alive = false; } });
    }
    window.__headOnDebug.forceChallenge();
    for (let i = 0; i < 3000 && state.challenge; i++) window.__headOnDebug.stepChallenge(0.016);
    ({ baseline, after: scene.children.list.length, done: state.challengesDone });
  `);
  check('four stages back to back leak no sprites',
    Math.abs(leak.after - leak.baseline) <= 2, leak);

  // --- live, not just stepped ----------------------------------------------
  const live = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    // A parked ship in a meteor gauntlet dies - that is the stage working.
    // This check is about the stage completing in real time, so take the
    // lives out of the equation rather than asserting an idle ship lives.
    state.lives = 99;
    return new Promise(res => setTimeout(() => {
      window.__headOnDebug.forceChallenge();
      setTimeout(() => {
        const mid = {
          beat: state.challenge && state.challenge.beat,
          meteors: state.challenge ? state.challenge.meteors.length : 0,
          stars: +state.starSpeedScale.toFixed(2),
          // flameOn, not flameSprite.visible: the flame blinks with the
          // ship during respawn invulnerability by design, so sampling
          // the sprite catches it dark at random and flakes.
          flame: scene.flameOn
        };
        setTimeout(() => res({ mid, ended: state.challenge === null, phase: state.phase }), 9000);
      }, 2500);
    }, 1000));
  });
  check('in a real running game the stage accelerates and throws rock',
    live.mid.meteors > 0 && live.mid.stars > 5 && live.mid.flame === true, live.mid);
  check('and completes on its own in real time', live.ended && live.phase === 'playing', live);

  // --- the boundary out of a stage ----------------------------------------
  // The bug this exists for: the collision pass used to run in the caller,
  // AFTER updateChallenge() had possibly called endChallenge() and nulled
  // state.challenge - so a bullet still in flight on the exact frame a
  // stage ended dereferenced a stage that no longer existed. Phaser
  // schedules the next frame after the update callback returns, so the
  // throw did not drop a frame, it stopped the game permanently.
  //
  // Nothing caught it because no test ever had a bullet alive across that
  // frame: the debug step did not fire, and the live test never held the
  // fire button. Firing all the way through a stage is now the check.
  const boundary = await page.evaluate(SETTLE + `
    state.lives = 99;
    window.__headOnDebug.forceChallenge();
    let steps = 0, bulletsAtEnd = -1;
    let threw = null;
    for (let i = 0; i < 3000 && state.challenge; i++) {
      // One bullet alive on every single frame, boundary included.
      if (state.bullets.length === 0) {
        state.bullets.push({ x: 180, y: 220, vy: -400, ttl: 5, trailLevels: {}, trailSprites: {},
                             sprite: scene.add.sprite(180, 220, 'bulletTex') });
      }
      const wasLast = state.challenge.beat === 'depart' &&
                      state.challenge.age >= 0.88;
      try { window.__headOnDebug.stepChallenge(0.016); }
      catch (e) { threw = String(e); break; }
      steps++;
      if (wasLast && !state.challenge) bulletsAtEnd = state.bullets.length;
    }
    ({ threw, steps, bulletsAtEnd, ended: state.challenge === null,
       formation: state.formation.filter(f => f.alive).length });
  `);
  check('firing right through the end of a stage does not throw',
    boundary.threw === null, boundary);
  check('a bullet really was in flight on the frame the stage ended',
    boundary.bulletsAtEnd > 0, boundary);
  check('and the stage still handed over to the next wave',
    boundary.ended && boundary.formation > 0, boundary);

  // The same boundary in a real frame loop, since the stepped hook and
  // update() are separate call sites and it was the live one that froze.
  const liveBoundary = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.lives = 99;
    window.__headOnDebug.forceChallenge();
    const iv = setInterval(() => {
      if (!state.challenge) { clearInterval(iv); return; }
      if (state.bullets.length === 0) {
        state.bullets.push({ x: 180, y: 220, vy: -400, ttl: 5, trailLevels: {}, trailSprites: {},
                             sprite: scene.add.sprite(180, 220, 'bulletTex') });
      }
    }, 16);
    return new Promise(res => setTimeout(() => {
      const clock = state.clock;
      setTimeout(() => {
        clearInterval(iv);
        res({
          // The real symptom: is the game loop still running at all?
          loopAlive: state.clock > clock,
          ended: state.challenge === null,
          frameErrors: window.__headOnDebug.frameErrors.count,
          lastError: window.__headOnDebug.frameErrors.last
        });
      }, 2000);
    }, 12000));
  });
  check('the game loop survives a stage ending with bullets in flight',
    liveBoundary.loopAlive, liveBoundary);
  check('the stage ended and no frame threw',
    liveBoundary.ended && liveBoundary.frameErrors === 0, liveBoundary);

  // --- the frame guard itself ---------------------------------------------
  // The guard is what stops any FUTURE bug of this class being fatal, so
  // it needs its own proof: throw on purpose, and check the loop lives.
  const guard = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    const before = window.__headOnDebug.frameErrors.count;
    // Break one thing the loop touches every frame, briefly.
    const real = scene.updateBackground;
    scene.updateBackground = function () { throw new Error('deliberate test explosion'); };
    return new Promise(res => setTimeout(() => {
      const clock = state.clock;
      setTimeout(() => {
        scene.updateBackground = real;
        setTimeout(() => res({
          caught: window.__headOnDebug.frameErrors.count > before,
          message: window.__headOnDebug.frameErrors.last,
          loopAliveWhileBroken: state.clock > clock,
          recovered: state.phase === 'playing'
        }), 400);
      }, 700);
    }, 400));
  });
  check('a thrown frame is caught rather than killing the game', guard.caught, guard);
  check('the loop keeps running through it', guard.loopAliveWhileBroken, guard);
  check('and play continues once the fault clears', guard.recovered, guard);
  check('the error is recorded, not swallowed',
    guard.message === 'deliberate test explosion', guard);
  // Put the counter back so the harness's own end-of-file check, which
  // fails on any caught exception, is not tripped by this test's own.
  await page.evaluate(() => {
    window.__headOnDebug.frameErrors.count = 0;
    window.__headOnDebug.frameErrors.last = null;
    window.__headOnDebug.frameErrors.seen = {};
  });
  // Same for the console line the guard correctly printed. Only the
  // deliberate one is dropped - anything else still fails below.
  for (let i = errors.length - 1; i >= 0; i--) {
    if (errors[i].indexOf('deliberate test explosion') !== -1) errors.splice(i, 1);
  }

  check('no page errors after full run', errors.length === 0, errors);
});
