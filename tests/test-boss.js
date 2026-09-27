// The boss fight.
//
// The fight's whole design is a set of one-to-one mappings - one player
// tool per piece of armour, and nothing else touches it - so most of what
// is worth testing here is the NEGATIVE half of each mapping. That a
// matching orbiter kills a core is easy to get right and easy to see; that
// a mismatched one, a plain bullet, a colour trail and the long-press bolt
// all leave it alone is what actually holds the design up, and none of it
// is visible on screen.
//
// The other theme is the handover. This fight takes a wave's slot, hides
// the bars, freezes the difficulty clock and suppresses checkWaveClear -
// four things that have to come back on afterwards, and a challenge stage
// already shipped a freeze by getting exactly this wrong (a collision pass
// dereferencing a stage the frame it ended). So the end of the fight is
// tested on its own, with a bullet deliberately in flight across it.
const harness = require('./harness');

// A fight at a known starting point: a clean run, a chosen loadout, the
// entrance skipped. Nothing here waits on real time.
const FIGHT = (orbs, fire) => `
  const scene = window.__headOnDebug.scene, state = scene.state;
  scene.resetGame();
  window.__headOnDebug.forceBoss({ orbs: ${JSON.stringify(orbs)}, fire: ${JSON.stringify(fire)} });
  window.__headOnDebug.skipBossRise();
  const boss = state.boss;
`;

const ALL = { red: 1, green: 1, blue: 1 };
const NONE = { red: 0, green: 0, blue: 0 };

// A hand-built orbiter sitting exactly on a target, for the damage tests -
// the real launch path is covered by test-orbiter-shots.js, and flying one
// in here would only be testing the homing again.
const ORBITER_AT = `
  function orbiterAt(x, y, colorKey) {
    return { gunId: -1, colorKey: colorKey, x: x, y: y, heading: -Math.PI / 2,
             age: 0, parked: false, trailTimer: 0, trail: [],
             sprite: scene.add.sprite(x, y, 'orbiterTex_' + colorKey) };
  }
`;

// Likewise a bullet: fireBullet() is covered elsewhere, and building one
// here is how a test puts a specific trail at a specific place.
const BULLET_AT = `
  function bulletAt(x, y, levels) {
    const b = { x: x, y: y, vy: -400, ttl: 5, trailLevels: { red: 0, green: 0, blue: 0 },
                trailSprites: {}, sprite: scene.add.sprite(x, y, 'bulletTex') };
    Object.keys(levels || {}).forEach(k => { b.trailLevels[k] = levels[k]; });
    state.bullets.push(b);
    return b;
  }
`;

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  check('no page errors on load', errors.length === 0, errors);

  // --- the tunables are actually wired -------------------------------------
  // Read from the LIVE tuning object, not defaults(): the recurring bug in
  // this file is a constant declared BELOW the line that seeds TUNING from
  // it, which leaves the live value undefined while defaults() - called
  // later - still looks perfectly correct.
  const tune = await page.evaluate(() => {
    const t = window.__headOnTuning.tuning;
    return { hull: t.bossHullHp, core: t.bossCoreHp, armour: t.bossArmourHp,
             add: t.bossAddInterval, enabled: t.bossEnabled };
  });
  check('every boss tunable reached the live tuning as a real number',
    [tune.hull, tune.core, tune.armour, tune.add].every(v => typeof v === 'number' && isFinite(v) && v > 0),
    tune);
  check('and the boss is on by default', tune.enabled === true, tune);

  // --- he takes a challenge stage's slot, and only at the planet ----------
  const due = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    const total = window.__headOnTuning.tuning.challengeStagesToArrival;
    const at = n => { state.challengesDone = n; return { approach: scene.planetApproach(), boss: scene.bossDue() }; };
    const out = { early: at(0), midway: at(Math.floor(total / 2)), arrived: at(total), past: at(total + 3) };
    state.challengesDone = 0;
    return out;
  });
  check('no boss while the home world is still distant',
    !due.early.boss && !due.midway.boss, due);
  check('the boss becomes due exactly when the approach completes',
    due.arrived.boss && due.arrived.approach === 1, due);
  check('and stays due past it', due.past.boss, due);

  // The integration path, not the predicate: a real cleared wave has to
  // route to startBoss() rather than to startChallenge(). Testing only
  // bossDue() would pass with the call site never wired up at all.
  const handover = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.challengesDone = window.__headOnTuning.tuning.challengeStagesToArrival;
    state.wave = window.__headOnTuning.tuning.challengeEveryWaves; // clearing this one makes a stage due
    state.formation.forEach(f => { if (f.alive) { f.sprite.destroy(); f.alive = false; } });
    for (let i = 0; i < 400 && !state.boss && !state.challenge; i++) scene.checkWaveClear(0.016);
    return { boss: !!state.boss, challenge: !!state.challenge, phase: state.boss && state.boss.phase };
  });
  check('clearing the wave that arrives at the planet starts the BOSS, not a stage',
    handover.boss && !handover.challenge, handover);
  check('and he starts by rising', handover.phase === 'rise', handover);

  const stillStages = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.challengesDone = 1; // short of the planet
    state.wave = window.__headOnTuning.tuning.challengeEveryWaves;
    state.formation.forEach(f => { if (f.alive) { f.sprite.destroy(); f.alive = false; } });
    for (let i = 0; i < 400 && !state.boss && !state.challenge; i++) scene.checkWaveClear(0.016);
    const out = { boss: !!state.boss, challenge: !!state.challenge };
    scene.resetGame();
    return out;
  });
  check('short of the planet it is still an ordinary meteor stage',
    stillStages.challenge && !stillStages.boss, stillStages);

  // --- the entrance --------------------------------------------------------
  const rise = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    window.__headOnDebug.forceBoss(null);
    const startY = state.boss.y, startScale = state.boss.sprite.scaleX;
    for (let i = 0; i < 40; i++) window.__headOnDebug.stepBoss(0.016);
    const mid = { y: state.boss.y, phase: state.boss.phase, adds: state.formation.length };
    for (let i = 0; i < 200; i++) window.__headOnDebug.stepBoss(0.016);
    ({ startY, startScale, mid, endY: state.boss.y, endPhase: state.boss.phase,
       endScale: state.boss.sprite.scaleX });
  `);
  check('he starts inside the home world and climbs out of it',
    rise.startY > rise.mid.y && rise.mid.y > rise.endY, rise);
  check('growing as he comes', rise.endScale > rise.startScale && rise.endScale === 1, rise);
  check('he spawns nothing while still arriving', rise.mid.adds === 0, rise);
  check('and settles into the fight', rise.endPhase === 'fight', rise);

  // --- what the fight replaces --------------------------------------------
  const suspended = await page.evaluate(FIGHT(ALL, ALL) + `
    const before = { elapsed: state.difficulty.elapsed, wave: state.wave,
                     bars: state.colorBars[0].segments[0].sprite.visible };
    for (let i = 0; i < 120; i++) window.__headOnDebug.stepBoss(0.016);
    ({ before, elapsed: state.difficulty.elapsed, wave: state.wave,
       bars: state.colorBars[0].segments[0].sprite.visible,
       barsAlive: state.colorBars.filter(b => b.alive).length });
  `);
  check('the colour bars go off screen for the fight', suspended.bars === false, suspended);
  check('but they are not destroyed - they are the run\'s standing pressure',
    suspended.barsAlive > 0, suspended);

  // Hidden is not enough: the bars descend on their own and break into
  // brick shards when they land. Left running through a fight they would
  // be creeping down behind it and could deposit a shard swarm the
  // moment the bars came back, from a descent nobody could see happening.
  // Has to run on real frames: whether the bars descend is decided by
  // which calls update() makes during a fight, and stepBoss() is a model
  // of that same branch - it could only ever agree with itself.
  const barsHeld = await page.evaluate(FIGHT(ALL, ALL) + `
    const y0 = state.colorBars.map(b => b.y);
    const shards0 = state.brickShards.length;
    new Promise(res => setTimeout(() => res({
      y0, y1: state.colorBars.map(b => b.y),
      moved: state.colorBars.some((b, i) => b.y !== y0[i]),
      shards: state.brickShards.length - shards0
    }), 2500));
  `);
  check('and they do not creep down the screen while the fight is on',
    barsHeld.moved === false && barsHeld.shards === 0, barsHeld);

  // The wave counter and the difficulty clock are both driven from
  // update(), so these have to be checked through a real frame rather than
  // through stepBoss().
  const live = await page.evaluate(FIGHT(ALL, ALL) + `
    const before = { elapsed: state.difficulty.elapsed, wave: state.wave };
    new Promise(res => setTimeout(() => res({
      before, elapsed: state.difficulty.elapsed, wave: state.wave,
      phase: state.boss && state.boss.phase
    }), 2500));
  `);
  check('the difficulty clock is frozen for the fight - it is a set piece, not free escalation',
    live.elapsed === live.before.elapsed, live);
  check('and no wave rolls over underneath it despite an empty formation',
    live.wave === live.before.wave, live);

  // --- the belly cores: matching orbiters, and NOTHING else ----------------
  const core = await page.evaluate(FIGHT(ALL, ALL) + ORBITER_AT + BULLET_AT + `
    const c = boss.cores[0];
    const cx = () => boss.x + c.ox, cy = () => boss.y + c.oy;
    const start = c.hp;

    const matched = scene.orbiterVsBossCores(orbiterAt(cx(), cy(), c.colorKey));
    const afterMatch = c.hp;

    const wrongKey = window.__headOnTuning ? null : null;
    const other = ['red','green','blue'].filter(k => k !== c.colorKey)[0];
    const mismatched = scene.orbiterVsBossCores(orbiterAt(cx(), cy(), other));
    const afterMismatch = c.hp;

    const b = bulletAt(cx(), cy(), {});
    const plainHitHull = scene.bulletVsBossHull(b, state.bullets.length - 1);
    const afterPlain = c.hp;

    const trailed = bulletAt(cx(), cy(), { [c.colorKey]: 3 });
    scene.pulseTrailVsBossArmour(trailed);
    const afterTrail = c.hp;

    ({ start, matched, afterMatch, mismatched, afterMismatch,
       plainHitHull, afterPlain, afterTrail, trailStillCarried: trailed.trailLevels[c.colorKey] });
  `);
  check('a matching orbiter chips a belly core', core.matched && core.afterMatch === core.start - 1, core);
  check('a mismatched orbiter passes straight through it',
    !core.mismatched && core.afterMismatch === core.afterMatch, core);
  check('a plain bullet cannot touch a core', !core.plainHitHull && core.afterPlain === core.afterMatch, core);
  check('and neither can a colour trail - cores are not bricks',
    core.afterTrail === core.afterMatch && core.trailStillCarried === 3, core);

  const coreKill = await page.evaluate(FIGHT(ALL, ALL) + ORBITER_AT + `
    const c = boss.cores[1];
    const hits = [];
    for (let i = 0; i < c.maxHp + 2; i++) {
      const hit = scene.orbiterVsBossCores(orbiterAt(boss.x + c.ox, boss.y + c.oy, c.colorKey));
      scene.layoutBoss();
      hits.push({ hit, hp: c.hp, alive: c.alive, light: +c.sprite.scaleX.toFixed(3),
                  lit: c.sprite.visible });
    }
    ({ maxHp: c.maxHp, hits, socket: c.socketSprite.visible, score: state.score });
  `);
  check('a core takes exactly its tuned number of matching hits to deaden',
    coreKill.hits[coreKill.maxHp - 1].alive === false &&
    coreKill.hits[coreKill.maxHp - 2].alive === true, coreKill.hits);
  check('a deadened core stops responding to further hits',
    coreKill.hits.slice(coreKill.maxHp).every(h => h.hit === false), coreKill.hits);
  check('it visibly goes out, leaving the empty socket behind',
    coreKill.hits[coreKill.maxHp - 1].lit === false && coreKill.socket === true, coreKill);
  check('and killing it scores', coreKill.score > 0, coreKill);

  // --- telling the player a hit landed ------------------------------------
  // A core takes five hits and a hull twenty-six. Without these, four
  // fifths of the core work and twenty-five twenty-sixths of the hull
  // work land with nothing on screen to show for them - which is what
  // "the missiles just disappear into the orbs" is.
  const drain = await page.evaluate(FIGHT(ALL, ALL) + ORBITER_AT + `
    const c = boss.cores[0];
    const settle = () => { // let the impact kick decay so this measures the DRAIN
      for (let i = 0; i < 40; i++) window.__headOnDebug.stepBoss(0.016);
    };
    settle();
    const sizes = [+c.sprite.scaleX.toFixed(4)];
    const popped = [];
    for (let i = 0; i < c.maxHp; i++) {
      scene.orbiterVsBossCores(orbiterAt(boss.x + c.ox, boss.y + c.oy, c.colorKey));
      window.__headOnDebug.stepBoss(0.016);
      popped.push(+c.sprite.scaleX.toFixed(4)); // mid-kick
      settle();
      if (c.alive) sizes.push(+c.sprite.scaleX.toFixed(4));
    }
    ({ sizes, popped, socketFixed: +c.socketSprite.scaleX.toFixed(4) });
  `);
  check('every hit on a core visibly shrinks its light, not just the last one',
    drain.sizes.length === tune.core &&
    drain.sizes.every((v, i) => i === 0 || v < drain.sizes[i - 1]), drain.sizes);
  check('and the socket it sits in does not move, so the shrinking has a rim to read against',
    drain.socketFixed === 1, drain);
  check('a hit also kicks the light outward for a moment',
    drain.popped[0] > drain.sizes[0], drain);

  const flashes = await page.evaluate(FIGHT(ALL, ALL) + ORBITER_AT + BULLET_AT + `
    const lit = s => ({ tinted: s.isTinted, fill: s.tintFill, tint: s.tintTopLeft });
    const c = boss.cores[0], br = boss.bricks[0];

    scene.orbiterVsBossCores(orbiterAt(boss.x + c.ox, boss.y + c.oy, c.colorKey));
    window.__headOnDebug.stepBoss(0.016);
    const coreOn = lit(c.sprite);
    for (let i = 0; i < 40; i++) window.__headOnDebug.stepBoss(0.016);
    const coreOff = lit(c.sprite);

    const bullet = bulletAt(boss.x + br.ox, boss.y + br.oy, { [br.colorKey]: 1 });
    scene.pulseTrailVsBossArmour(bullet);
    window.__headOnDebug.stepBoss(0.016);
    const plateOn = lit(br.sprite);
    for (let i = 0; i < 40; i++) window.__headOnDebug.stepBoss(0.016);
    const plateOff = lit(br.sprite);

    ({ coreOn, coreOff, plateOn, plateOff });
  `);
  check('a struck core flashes white', flashes.coreOn.fill === true, flashes);
  check('and stops', flashes.coreOff.tinted === false, flashes);
  check('a struck plate flashes too', flashes.plateOn.fill === true, flashes);
  check('and stops', flashes.plateOff.tinted === false, flashes);

  const hullCues = await page.evaluate(FIGHT(ALL, ALL) + BULLET_AT + `
    const lit = () => ({ tinted: boss.sprite.isTinted, fill: boss.sprite.tintFill,
                         tint: boss.sprite.tintTopLeft });
    // A shot that bounces off the sealed hull is NOT consumed - it flies
    // on, and stepBoss() runs a full collision pass, so one left sitting
    // in the air lands the moment the last plate breaks. That is correct
    // in play and wrong in a test that wants a clean reading of each
    // state, hence the sweep between probes.
    const clearShots = () => { state.bullets.forEach(b => b.sprite.destroy()); state.bullets = []; };

    // Sealed: ordinary fire does nothing to him, so he must not flinch.
    scene.bulletVsBossHull(bulletAt(boss.x, boss.y, {}), state.bullets.length - 1);
    window.__headOnDebug.stepBoss(0.016);
    const sealed = lit();
    clearShots();

    boss.cores.forEach(c => { c.hp = 0; c.alive = false; });
    boss.bricks.forEach(b => { b.hp = 0; b.alive = false; b.sprite.destroy(); b.crackSprite.destroy(); });
    window.__headOnDebug.stepBoss(0.016);
    const bare = lit();

    scene.bulletVsBossHull(bulletAt(boss.x, boss.y, {}), state.bullets.length - 1);
    const struck = lit(); // paintBossHull() runs on the hit itself, not a frame later
    for (let i = 0; i < 40; i++) window.__headOnDebug.stepBoss(0.016);
    const settled = lit();

    // ...and the burn deepens as he is worn down.
    const burn = [];
    for (let i = 0; i < 5; i++) {
      boss.hullHp = Math.max(1, boss.hullHp - 4);
      boss.hullFlash = 0;
      scene.paintBossHull();
      burn.push(boss.sprite.tintTopLeft);
    }
    ({ sealed, bare, struck, settled, burn, hullHp: boss.hullHp });
  `);
  // Not "is it tinted" - a neutral white tint and no tint at all render
  // identically, so that would pass for free. What matters is that fire
  // which does nothing to him produces no FLASH, and that an undamaged
  // hull is drawn in its own colours whatever state it is in.
  check('an armoured hull does not flinch at fire that cannot hurt it',
    hullCues.sealed.fill === false && hullCues.sealed.tint === 0xffffff, hullCues);
  check('and an unhurt bare hull is not drawn as damaged either',
    hullCues.bare.fill === false && hullCues.bare.tint === 0xffffff, hullCues);
  check('a bare hull flashes white on the frame it is hit',
    hullCues.struck.fill === true, hullCues);
  check('and settles back out of the flash', hullCues.settled.fill === false, hullCues);
  check('the bare hull darkens steadily as it is worn down',
    hullCues.burn.every((v, i) => i === 0 || v < hullCues.burn[i - 1]) &&
    hullCues.burn[0] !== hullCues.bare.tint, hullCues.burn);

  // The homing has to know about cores, or hitting one would be luck.
  const seek = await page.evaluate(FIGHT(ALL, ALL) + ORBITER_AT + `
    const c = boss.cores[2];
    const o = orbiterAt(state.ship.x, 400, c.colorKey);
    const target = scene.nearestOrbiterTarget(o, 1000);
    // ...and only its own colour.
    const wrong = orbiterAt(state.ship.x, 400, ['red','green','blue'].filter(k => k !== c.colorKey)[0]);
    boss.cores.forEach(x => { if (x.colorKey !== wrong.colorKey) return; x.alive = false; });
    const wrongTarget = scene.nearestOrbiterTarget(wrong, 1000);
    ({ target, want: { x: boss.x + c.ox, y: boss.y + c.oy }, wrongTarget });
  `);
  check('an orbiter steers at the belly core of its own colour',
    seek.target && Math.abs(seek.target.x - seek.want.x) < 0.001 &&
    Math.abs(seek.target.y - seek.want.y) < 0.001, seek);
  check('and at nothing once that colour\'s core is dead', seek.wrongTarget === null, seek);

  // --- the tentacle plates: colour trails, on the bars' own terms ----------
  const plate = await page.evaluate(FIGHT(ALL, ALL) + ORBITER_AT + BULLET_AT + `
    const br = boss.bricks[0];
    const px = () => boss.x + br.ox, py = () => boss.y + br.oy;
    const start = br.hp;

    const matched = bulletAt(px(), py(), { [br.colorKey]: 2 });
    scene.pulseTrailVsBossArmour(matched);
    const afterMatch = { hp: br.hp, spent: matched.trailLevels[br.colorKey], resolved: !!matched.trailResolved };

    const other = ['red','green','blue'].filter(k => k !== br.colorKey)[0];
    const mismatched = bulletAt(px(), py(), { [other]: 3 });
    scene.pulseTrailVsBossArmour(mismatched);
    const afterMismatch = { hp: br.hp, absorbed: mismatched.trailLevels[other] };

    const orb = scene.orbiterVsBossCores(orbiterAt(px(), py(), br.colorKey));
    const afterOrbiter = br.hp;

    ({ start, maxHp: br.maxHp, afterMatch, afterMismatch, orb, afterOrbiter,
       crack: br.crackSprite.alpha });
  `);
  check('a matching colour trail chips an armour plate by its level',
    plate.afterMatch.hp === plate.start - 2, plate);
  check('spending that colour and resolving the shot, exactly as a bar segment does',
    plate.afterMatch.spent === 0 && plate.afterMatch.resolved, plate);
  check('a mismatched trail is absorbed whole and does no damage',
    plate.afterMismatch.hp === plate.afterMatch.hp && plate.afterMismatch.absorbed === 0, plate);
  check('an orbiter cannot touch a plate - plates are not cores',
    !plate.orb && plate.afterOrbiter === plate.afterMatch.hp, plate);
  check('damage shows as a spreading crack', plate.crack > 0 && plate.crack < 1, plate);

  // "Destroyed as any other bricks" includes the long-press bolt, the
  // other thing in this game that destroys a brick.
  const bolt = await page.evaluate(FIGHT(ALL, ALL) + `
    const br = boss.bricks.filter(b => b.colorKey === 'green')[0];
    const before = br.hp;
    const fake = { colorKey: 'green', sprite: { x: boss.x + br.ox } };
    scene.applyPowerupBoltVsBossArmour(fake);
    const afterMatch = br.hp;
    const red = boss.bricks.filter(b => b.colorKey === 'red')[0];
    const redBefore = red.hp;
    scene.applyPowerupBoltVsBossArmour({ colorKey: 'green', sprite: { x: boss.x + red.ox } });
    ({ before, afterMatch, redBefore, redAfter: red.hp });
  `);
  check('the long-press bolt chips a plate of its own colour', bolt.afterMatch < bolt.before, bolt);
  check('and leaves the other colours alone', bolt.redAfter === bolt.redBefore, bolt);

  // The bolt must not still be grinding down the hidden bars instead.
  const boltNotBars = await page.evaluate(FIGHT(ALL, ALL) + `
    const seg = state.colorBars.filter(b => b.alive && b.colorKey === 'green')[0].segments.filter(s => s.alive)[0];
    const before = seg.hp;
    scene.applyPowerupBoltDamage({ colorKey: 'green', sprite: { x: seg.sprite.x } });
    ({ before, after: seg.hp });
  `);
  check('the bolt does not secretly damage the off-screen bars during a fight',
    boltNotBars.after === boltNotBars.before, boltNotBars);

  // --- the hull: sealed until every piece of shielding is off -------------
  const hull = await page.evaluate(FIGHT(ALL, ALL) + BULLET_AT + `
    const sealed = scene.bulletVsBossHull(bulletAt(boss.x, boss.y, {}), state.bullets.length - 1);
    const hpAfterSealed = boss.hullHp;

    boss.cores.forEach(c => { c.hp = 0; c.alive = false; });
    const stillSealed = scene.bulletVsBossHull(bulletAt(boss.x, boss.y, {}), state.bullets.length - 1);
    const hpAfterCores = boss.hullHp;

    boss.bricks.forEach(b => { b.hp = 0; b.alive = false; });
    const exposed = scene.bossExposed();
    const open = scene.bulletVsBossHull(bulletAt(boss.x, boss.y, {}), state.bullets.length - 1);
    ({ sealed, hpAfterSealed, stillSealed, hpAfterCores, exposed, open, hp: boss.hullHp,
       texture: boss.sprite.texture.key });
  `);
  check('ordinary fire cannot touch him at full shielding',
    !hull.sealed && hull.hpAfterSealed === tune.hull, hull);
  check('nor with the cores dead but the plates still on - it takes BOTH',
    !hull.stillSealed && hull.hpAfterCores === tune.hull, hull);
  check('with every piece off he is exposed', hull.exposed, hull);
  check('and ordinary fire finally hurts him', hull.open && hull.hp === tune.hull - 1, hull);

  const bare = await page.evaluate(FIGHT(ALL, ALL) + `
    const dressed = boss.sprite.texture.key;
    boss.cores.forEach(c => { c.hp = 0; c.alive = false; });
    boss.bricks.forEach(b => { b.hp = 0; b.alive = false; });
    window.__headOnDebug.stepBoss(0.016);
    ({ dressed, bare: boss.sprite.texture.key });
  `);
  check('and says so - the body changes to its bare look the moment it is stripped',
    bare.dressed !== bare.bare && bare.bare === 'bossHullBareTex', bare);

  // --- shielding drives the spawn rate ------------------------------------
  const rate = await page.evaluate(FIGHT(ALL, ALL) + `
    const full = scene.bossAddInterval();
    boss.bricks.forEach(b => { b.hp = 0; b.alive = false; });
    const half = scene.bossAddInterval();
    boss.cores.forEach(c => { c.hp = 0; c.alive = false; });
    const none = scene.bossAddInterval();
    ({ full, half, none, shieldingFull: 1, shieldingNone: scene.bossShielding() });
  `);
  check('shielding is full at the start and empty once stripped',
    rate.shieldingNone === 0, rate);
  check('stripping him visibly calms the spawning down',
    rate.full < rate.half && rate.half < rate.none, rate);
  check('the full-shielding rate is the tuned one', Math.abs(rate.full - tune.add) < 0.001, rate);

  // --- his adds are ordinary divers ---------------------------------------
  const adds = await page.evaluate(FIGHT(ALL, ALL) + `
    for (let i = 0; i < 600; i++) window.__headOnDebug.stepBoss(0.016); // ~9.6s
    const flying = state.formation.filter(f => f.alive);
    ({ spawned: boss.addsSpawned, flying: flying.length,
       allDiving: flying.every(f => f.diving && !f.entering),
       allBelowHim: flying.every(f => f.y >= boss.y),
       moved: flying.every(f => f.y > f.baseY) });
  `);
  check('he spawns attackers once the fight is on', adds.spawned > 0, adds);
  check('and they are ordinary divers, already committed', adds.allDiving, adds);
  check('flying down away from him', adds.flying === 0 || adds.moved, adds);

  const addDeath = await page.evaluate(FIGHT(ALL, ALL) + BULLET_AT + `
    for (let i = 0; i < 400 && !state.formation.some(f => f.alive); i++) window.__headOnDebug.stepBoss(0.016);
    const slot = state.formation.filter(f => f.alive)[0];
    const scoreBefore = state.score;
    const b = bulletAt(slot.x, slot.y, {});
    const hit = scene.bulletVsFormation(b, state.bullets.length - 1);
    ({ hit, dead: !slot.alive, scored: state.score - scoreBefore });
  `);
  check('an add dies to an ordinary bullet like anything else',
    addDeath.hit && addDeath.dead && addDeath.scored > 0, addDeath);

  // state.formation is never spliced anywhere else in the game - a wave's
  // array is simply thrown away by the next spawnFormation(), and a boss
  // fight has no such moment until it ends. So dead adds have to be
  // retired here or a long fight accumulates them without limit.
  const prune = await page.evaluate(FIGHT(ALL, ALL) + `
    let peak = 0;
    for (let i = 0; i < 2500; i++) { // ~40s of fighting
      window.__headOnDebug.stepBoss(0.016);
      if (state.formation.length > peak) peak = state.formation.length;
    }
    ({ spawned: boss.addsSpawned, arrayLength: state.formation.length, peak,
       alive: state.formation.filter(f => f.alive).length });
  `);
  check('40s of spawning does not pile dead adds up in the formation array',
    prune.spawned > 6 && prune.peak < prune.spawned, prune);
  check('and every slot still held is a live one', prune.arrayLength === prune.alive, prune);

  // --- the deficit, and why arriving loaded matters -----------------------
  const deficit = await page.evaluate(FIGHT(NONE, NONE) + `
    ({ dots: state.powerup.dots.length,
       levels: Object.assign({}, state.colorLevels),
       needed: scene.bossNeededColors() });
  `);
  check('arriving empty really is empty - no guns and no fire power',
    deficit.dots === 0 && deficit.levels.red === 0 && deficit.levels.blue === 0, deficit);
  check('and every colour is still needed', deficit.needed.length === 3, deficit);

  // The economy keeps running through the fight - that is the ONLY way a
  // deficit is recoverable, and it is the difference between this and a
  // challenge stage.
  const economy = await page.evaluate(FIGHT(NONE, NONE) + `
    state.powerupSpawnTimer = 0;
    let saw = 0;
    for (let i = 0; i < 1200; i++) {
      scene.updatePowerupSpawns(0.016);
      saw += state.strips.length + state.orbs.length;
      state.strips.forEach(s => s.sprite.destroy());
      state.orbs.forEach(o => o.hostSprite.destroy());
      state.strips = []; state.orbs = [];
      state.powerupSpawnTimer = Math.min(state.powerupSpawnTimer, 0.5);
    }
    ({ saw });
  `);
  check('powerups keep coming during the fight, so a deficit can be made up',
    economy.saw > 0, economy);

  // ...and they come in a colour that is still worth something. A colour
  // whose bars all died earlier in the run would otherwise never drop,
  // leaving its core permanently unkillable.
  const offered = await page.evaluate(FIGHT(NONE, NONE) + `
    state.colorBars.forEach(bar => {
      if (bar.colorKey !== 'red') return;
      bar.segments.forEach(s => { s.alive = false; });
      bar.alive = false;
    });
    const seen = {};
    for (let i = 0; i < 400; i++) seen[scene.pickPowerupColor()] = (seen[scene.pickPowerupColor()] || 0) + 1;
    const keys = Object.keys(seen).sort();
    // ...and once a colour is finished with, it stops being offered.
    boss.cores.forEach(c => { if (c.colorKey === 'blue') { c.alive = false; } });
    boss.bricks.forEach(b => { if (b.colorKey === 'blue') { b.alive = false; } });
    const after = {};
    for (let i = 0; i < 400; i++) after[scene.pickPowerupColor()] = 1;
    ({ keys, needed: scene.bossNeededColors(), afterKeys: Object.keys(after).sort() });
  `);
  check('a colour whose bars all died still drops during the fight',
    offered.keys.indexOf('red') !== -1, offered);
  check('and a colour with nothing of his left stops being offered',
    offered.afterKeys.indexOf('blue') === -1 && offered.afterKeys.length === 2, offered);

  // --- the kill, and the handover back ------------------------------------
  const death = await page.evaluate(FIGHT(ALL, ALL) + BULLET_AT + `
    boss.cores.forEach(c => { c.hp = 0; c.alive = false; });
    boss.bricks.forEach(b => { b.hp = 0; b.alive = false; });
    // Step until he actually has something in the air - his adds fly off
    // the bottom in a couple of seconds, so a fixed number of steps lands
    // on an empty screen as often as not.
    for (let i = 0; i < 900 && state.formation.filter(f => f.alive).length < 2; i++) {
      window.__headOnDebug.stepBoss(0.016);
    }
    const addsBefore = state.formation.filter(f => f.alive).length;
    boss.hullHp = 1;
    const scoreBefore = state.score;
    scene.bulletVsBossHull(bulletAt(boss.x, boss.y, {}), state.bullets.length - 1);
    ({ addsBefore, phase: boss.phase,
       addsAfter: state.formation.filter(f => f.alive).length,
       ring: state.starburstFx !== null, scoreGain: state.score - scoreBefore });
  `);
  check('the last hull hit starts him dying', death.phase === 'dying', death);
  check('and the blast takes his adds with it, so the kill is not a death trap',
    death.addsBefore > 0 && death.addsAfter === 0, death);
  check('with a ring to watch', death.ring, death);

  const after = await page.evaluate(FIGHT(ALL, ALL) + `
    const wave = state.wave, done = state.challengesDone = 5;
    boss.cores.forEach(c => { c.hp = 0; c.alive = false; });
    boss.bricks.forEach(b => { b.hp = 0; b.alive = false; });
    boss.hullHp = 1;
    scene.bulletVsBossHull({ x: boss.x, y: boss.y, trailLevels: {}, trailSprites: {},
                             sprite: scene.add.sprite(boss.x, boss.y, 'bulletTex') }, -1);
    const scoreBefore = state.score;
    for (let i = 0; i < 400 && state.boss; i++) window.__headOnDebug.stepBoss(0.016);
    ({ wave, done, boss: !!state.boss, scoreGain: state.score - scoreBefore,
       challengesDone: state.challengesDone,
       bars: state.colorBars[0].segments[0].sprite.visible,
       formation: state.formation.filter(f => f.alive).length,
       approach: scene.planetApproach() });
  `);
  check('the fight ends by itself once he has come apart', after.boss === false, after);
  check('killing him scores', after.scoreGain > 0, after);
  check('the approach starts over - the run flies on toward the next world',
    after.challengesDone === 0 && after.approach === 0, after);
  check('the bars come back', after.bars === true, after);
  check('and a fresh wave flies in', after.formation > 0, after);

  // The exact shape of the freeze that shipped at the end of a challenge
  // stage: a collision pass dereferencing a fight that ended earlier in
  // the same frame. It needs a bullet alive across the boundary, which is
  // why no ordinary test caught it the first time.
  const boundary = await page.evaluate(FIGHT(ALL, ALL) + BULLET_AT + ORBITER_AT + `
    boss.cores.forEach(c => { c.hp = 0; c.alive = false; });
    boss.bricks.forEach(b => { b.hp = 0; b.alive = false; });
    boss.hullHp = 1;
    scene.bulletVsBossHull(bulletAt(boss.x, boss.y, {}), state.bullets.length - 1);
    boss.age = 99; // one step from the end of the death animation
    // Both kinds of shot alive across the boundary. The orbiter is the
    // one that matters most: updateOrbiters() calls orbiterVsBossCores()
    // for every shot in the air with no state.boss check of its own, and
    // having missiles out when he finally dies is the normal case, not an
    // edge one.
    bulletAt(180, 300, { red: 2 });
    state.orbiters.push(orbiterAt(180, 260, 'red'));
    let threw = null;
    try {
      for (let i = 0; i < 5; i++) window.__headOnDebug.stepBoss(0.016);
      scene.handleCollisions();
      scene.updateOrbiters(0.016);
      // And called directly with no fight running, because that is the
      // property the collision ordering leans on: each damage path has to
      // be safe on its own, not merely unreachable from one call site.
      scene.pulseTrailVsBossArmour(bulletAt(180, 300, { red: 2 }));
      scene.orbiterVsBossCores(orbiterAt(180, 260, 'red'));
      scene.bulletVsBossHull(bulletAt(180, 300, {}), state.bullets.length - 1);
      scene.applyPowerupBoltVsBossArmour({ colorKey: 'red', sprite: { x: 180 } });
      scene.bossNeededColors();
      scene.bossShielding();
      scene.bossExposed();
    } catch (e) { threw = String(e); }
    ({ threw, boss: !!state.boss });
  `);
  check('nothing throws when the fight ends with a shot still in flight',
    boundary.threw === null && boundary.boss === false, boundary);

  // --- dying during the fight ---------------------------------------------
  const playerDeath = await page.evaluate(FIGHT(ALL, ALL) + `
    for (let i = 0; i < 400; i++) window.__headOnDebug.stepBoss(0.016);
    const seg = () => state.colorBars.filter(b => b.alive)[0].segments.filter(s => s.alive)[0].hp;
    const hpBefore = seg(), lives = state.lives, adds = state.formation.filter(f => f.alive).length;
    scene.shipHit('test');
    ({ adds, addsAfter: state.formation.filter(f => f.alive).length,
       hpBefore, hpAfter: seg(), livesLost: lives - state.lives,
       stillFighting: !!state.boss, dots: state.powerup.dots.length });
  `);
  check('dying costs a life and clears his adds, same as it clears a wave',
    playerDeath.livesLost === 1 && playerDeath.addsAfter === 0, playerDeath);
  check('but does NOT chip the hidden bars - that would be damage nobody can see',
    playerDeath.hpAfter === playerDeath.hpBefore, playerDeath);
  check('and it costs you the loadout, which is the real price here',
    playerDeath.dots === 0, playerDeath);
  check('the fight itself carries on', playerDeath.stillFighting, playerDeath);

  const gameOver = await page.evaluate(FIGHT(ALL, ALL) + `
    const before = scene.children.list.length;
    state.lives = 1;
    scene.shipHit('test');
    const over = { phase: state.phase, boss: !!state.boss, sprites: scene.children.list.length };
    scene.resetGame();
    ({ before, over, restarted: { phase: state.phase, boss: !!state.boss, wave: state.wave,
       bars: state.colorBars[0].segments[0].sprite.visible,
       formation: state.formation.filter(f => f.alive).length } });
  `);
  check('running out of lives mid-fight ends the game and tears him down',
    gameOver.over.phase === 'gameover' && gameOver.over.boss === false, gameOver.over);
  check('leaving no frozen boss sprites behind the overlay',
    gameOver.over.sprites < gameOver.before, gameOver);
  check('and a restart comes back to an ordinary wave with the bars up',
    gameOver.restarted.phase === 'playing' && gameOver.restarted.boss === false &&
    gameOver.restarted.bars === true && gameOver.restarted.formation > 0, gameOver.restarted);

  // --- the back door -------------------------------------------------------
  const backDoor = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    const opened = scene.openBossSetup();
    const paused = { phase: state.phase, boss: !!state.boss,
                     overlay: document.getElementById('bossSetupOverlay').classList.contains('visible') };
    scene.closeBossSetup({ orbs: { red: 2, green: 0, blue: 1 }, fire: { red: 0, green: 3, blue: 0 } });
    return { opened, paused, phase: state.phase,
             overlay: document.getElementById('bossSetupOverlay').classList.contains('visible'),
             boss: !!state.boss,
             dots: state.powerup.dots.map(d => d.colorKey).sort(),
             levels: Object.assign({}, state.colorLevels) };
  });
  check('the back door pauses the run rather than starting mid-dodge',
    backDoor.opened && backDoor.paused.phase === 'paused' && backDoor.paused.boss === false, backDoor);
  check('and puts the chooser up', backDoor.paused.overlay, backDoor);
  check('picking Fight resumes and starts him', backDoor.phase === 'playing' && backDoor.boss, backDoor);
  check('with exactly the loadout chosen',
    JSON.stringify(backDoor.dots) === JSON.stringify(['blue', 'red', 'red']) &&
    backDoor.levels.green === 3 && backDoor.levels.red === 0, backDoor);
  check('and the chooser goes away', backDoor.overlay === false, backDoor);

  // Nothing must run while it is up - that is what "pause" has to mean.
  const frozen = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    window.__headOnDebug.skipFormationEntry();
    scene.openBossSetup();
    const before = { clock: state.clock, elapsed: state.difficulty.elapsed,
                     y: state.formation.filter(f => f.alive)[0].y };
    return new Promise(res => setTimeout(() => {
      const after = { clock: state.clock, elapsed: state.difficulty.elapsed,
                      y: state.formation.filter(f => f.alive)[0].y };
      scene.closeBossSetup(null);
      res({ before, after, resumed: state.phase, boss: !!state.boss });
    }, 1200));
  });
  check('the game really is stopped while the chooser is up',
    frozen.after.clock === frozen.before.clock &&
    frozen.after.elapsed === frozen.before.elapsed, frozen);
  check('Cancel resumes without starting anything',
    frozen.resumed === 'playing' && frozen.boss === false, frozen);

  // ...and it opens from a finished run too, which is the case that
  // matters most for playtesting: the run you want to try the fight
  // from is usually the one that just killed you.
  const fromOver = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.lives = 1;
    scene.shipHit('test');
    const dead = { phase: state.phase, lives: state.lives,
                   overlay: document.getElementById('gameOverOverlay').classList.contains('visible') };
    const opened = scene.openBossSetup();
    const chooser = {
      opened,
      chooser: document.getElementById('bossSetupOverlay').classList.contains('visible'),
      // The game-over screen is later in the DOM and just as full-bleed,
      // so it has to be out of the way or it paints over the chooser.
      gameOver: document.getElementById('gameOverOverlay').classList.contains('visible'),
      phase: state.phase
    };
    scene.closeBossSetup({ orbs: { red: 1, green: 1, blue: 0 }, fire: { red: 0, green: 0, blue: 2 } });
    return { dead, chooser, after: {
      phase: state.phase, boss: !!state.boss, lives: state.lives, wave: state.wave, score: state.score,
      overlay: document.getElementById('gameOverOverlay').classList.contains('visible'),
      chooser: document.getElementById('bossSetupOverlay').classList.contains('visible'),
      bars: state.colorBars.filter(b => b.alive).length,
      dots: state.powerup.dots.map(d => d.colorKey).sort(),
      levels: Object.assign({}, state.colorLevels)
    } };
  });
  check('the run really was over before this', fromOver.dead.phase === 'gameover' && fromOver.dead.overlay, fromOver.dead);
  check('the chooser opens from a finished run', fromOver.chooser.opened && fromOver.chooser.chooser, fromOver.chooser);
  check('and the game-over screen gets out of its way', fromOver.chooser.gameOver === false, fromOver.chooser);
  check('Fight restarts the run and drops straight into the fight',
    fromOver.after.phase === 'playing' && fromOver.after.boss &&
    fromOver.after.lives === 3 && fromOver.after.wave === 1 && fromOver.after.score === 0, fromOver.after);
  check('with the bars restored and the game-over screen gone',
    fromOver.after.bars > 0 && fromOver.after.overlay === false &&
    fromOver.after.chooser === false, fromOver.after);
  check('carrying the loadout that was chosen, not the dead run\'s',
    JSON.stringify(fromOver.after.dots) === JSON.stringify(['green', 'red']) &&
    fromOver.after.levels.blue === 2, fromOver.after);

  // Cancel is the half that is easy to get wrong: the restart is
  // deferred to Fight precisely so backing out does not quietly throw
  // the finished run away before you have looked at the score.
  const cancelFromOver = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.score = 4242;
    state.lives = 1;
    scene.shipHit('test');
    const score = state.score;
    scene.openBossSetup();
    scene.closeBossSetup(null);
    return { phase: state.phase, boss: !!state.boss, score, scoreNow: state.score,
             overlay: document.getElementById('gameOverOverlay').classList.contains('visible'),
             chooser: document.getElementById('bossSetupOverlay').classList.contains('visible') };
  });
  check('Cancel from a finished run leaves it finished',
    cancelFromOver.phase === 'gameover' && cancelFromOver.boss === false, cancelFromOver);
  check('with the game-over screen back and the score untouched',
    cancelFromOver.overlay === true && cancelFromOver.chooser === false &&
    cancelFromOver.scoreNow === cancelFromOver.score, cancelFromOver);

  // The lab sits above every overlay, so it can be reopened over the
  // chooser and this pressed twice. The second open must not re-read the
  // game-over screen's state after the first one already hid it.
  const doubleOpen = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.lives = 1;
    scene.shipHit('test');
    const first = scene.openBossSetup();
    const second = scene.openBossSetup();
    scene.closeBossSetup(null);
    return { first, second, phase: state.phase,
             overlay: document.getElementById('gameOverOverlay').classList.contains('visible'),
             chooser: document.getElementById('bossSetupOverlay').classList.contains('visible') };
  });
  check('opening the chooser twice is a no-op the second time', doubleOpen.second === false, doubleOpen);
  check('so Cancel still puts the game-over screen back',
    doubleOpen.overlay === true && doubleOpen.chooser === false &&
    doubleOpen.phase === 'gameover', doubleOpen);

  // Fight from a LIVE run must not restart it - the restart belongs to
  // the game-over path alone. Getting this wrong wipes the score and
  // wave you were opening the chooser from.
  const midRun = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    state.score = 7777;
    state.wave = 6;
    state.lives = 2;
    scene.openBossSetup();
    scene.closeBossSetup({ orbs: { red: 1, green: 0, blue: 0 }, fire: { red: 0, green: 0, blue: 0 } });
    return { phase: state.phase, boss: !!state.boss, score: state.score,
             wave: state.wave, lives: state.lives };
  });
  check('jumping to the boss mid-run keeps the run you were in',
    midRun.boss && midRun.score === 7777 && midRun.wave === 6 && midRun.lives === 2, midRun);

  // And the lab button itself, with a real click, from a real game over.
  await page.evaluate(() => {
    const scene = window.__headOnDebug.scene;
    scene.resetGame();
    scene.state.lives = 1;
    scene.shipHit('test');
    window.__headOnTuning.setLabOpen(true);
  });
  await page.click('#labBossNowBtn');
  const overButton = await page.evaluate(() => ({
    chooser: document.getElementById('bossSetupOverlay').classList.contains('visible'),
    phase: window.__headOnDebug.scene.state.phase
  }));
  check('the lab button opens the chooser from a game over, not just mid-run',
    overButton.chooser && overButton.phase === 'gameover', overButton);
  await page.click('#bossSetupFightBtn');
  const overFought = await page.evaluate(() => {
    const state = window.__headOnDebug.scene.state;
    return { phase: state.phase, boss: !!state.boss, lives: state.lives };
  });
  check('and Fight gets a live boss out of it',
    overFought.boss && overFought.phase === 'playing' && overFought.lives === 3, overFought);

  // Replacing, not topping up: "arrive with two reds" has to mean two.
  const replaces = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    window.__headOnDebug.giveOrbs('blue', 3);
    scene.levelUpFirePower('blue');
    scene.applyBossLoadout({ orbs: { red: 2, green: 0, blue: 0 }, fire: { red: 1, green: 0, blue: 0 } });
    return { dots: state.powerup.dots.map(d => d.colorKey), levels: Object.assign({}, state.colorLevels) };
  });
  check('the chooser replaces what you were carrying rather than adding to it',
    JSON.stringify(replaces.dots) === JSON.stringify(['red', 'red']) &&
    replaces.levels.blue === 0 && replaces.levels.red === 1, replaces);

  // The whole back door through its real controls, with real clicks.
  // Synthetic events do not reach everything a browser does (a synthetic
  // PointerEvent never reaches Phaser's input queue, which once made a
  // working button look broken), and this path is three separate DOM
  // handlers deep - the lab button, the steppers and Fight.
  await page.evaluate(() => {
    window.__headOnDebug.scene.resetGame();
    window.__headOnTuning.setLabOpen(true);
  });
  await page.click('#labBossNowBtn');
  const opened = await page.evaluate(() => ({
    overlay: document.getElementById('bossSetupOverlay').classList.contains('visible'),
    phase: window.__headOnDebug.scene.state.phase,
    steppers: document.querySelectorAll('#bossSetupRows .bs-step').length,
    rows: document.querySelectorAll('#bossSetupRows .boss-setup-row').length
  }));
  check('the lab button really opens the chooser and pauses',
    opened.overlay && opened.phase === 'paused', opened);
  check('with a row per colour for each of the two loadouts',
    opened.rows === 6 && opened.steppers === 24, opened);

  // Rows run [orbs: red, green, blue] then [fire: red, green, blue].
  const rows = page.locator('#bossSetupRows .boss-setup-row');
  await rows.nth(1).locator('.bs-step').nth(2).click(); // orbs green -> 2
  await rows.nth(5).locator('.bs-step').nth(1).click(); // fire blue  -> 1
  const picked = await page.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('#bossSetupRows .boss-setup-row'), row => {
      const on = row.querySelectorAll('.bs-step.on');
      return { label: row.querySelector('.bs-label').textContent,
               lit: on.length, value: on.length === 1 ? on[0].textContent : null };
    }));
  check('exactly one value stays lit per row', picked.every(r => r.lit === 1), picked);
  check('and the taps landed on the rows they were aimed at',
    picked.map(r => r.value).join('') === '020001', picked);

  await page.click('#bossSetupFightBtn');
  const fought = await page.evaluate(() => {
    const state = window.__headOnDebug.scene.state;
    return { phase: state.phase, boss: !!state.boss,
             overlay: document.getElementById('bossSetupOverlay').classList.contains('visible'),
             dots: state.powerup.dots.map(d => d.colorKey).sort(),
             levels: Object.assign({}, state.colorLevels) };
  });
  check('Fight starts the boss from the real button',
    fought.boss && fought.phase === 'playing' && !fought.overlay, fought);
  check('carrying exactly what was tapped',
    JSON.stringify(fought.dots) === JSON.stringify(['green', 'green']) &&
    fought.levels.blue === 1 && fought.levels.red === 0 && fought.levels.green === 0, fought);

  // --- the fight actually survives being played ---------------------------
  const soak = await page.evaluate(FIGHT(ALL, ALL) + `
    const baseline = scene.children.list.length;
    let peak = baseline;
    for (let i = 0; i < 3750; i++) { // ~60s
      window.__headOnDebug.stepBoss(0.016);
      if (i % 30 === 0) { state.input.fire = true; scene.updateFiring(0.016); state.input.fire = false; }
      if (i % 120 === 0) scene.launchOrbiters();
      if (scene.children.list.length > peak) peak = scene.children.list.length;
    }
    ({ baseline, peak, end: scene.children.list.length, boss: !!state.boss,
       lives: state.lives, phase: state.phase });
  `);
  check('a minute of fighting does not run away with sprites',
    soak.peak < soak.baseline + 200, soak);

  check('no page errors after full run', errors.length === 0, errors);
});
