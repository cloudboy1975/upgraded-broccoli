// The ordinary combat loop, as a regression net.
//
// This is NOT a rebuild of the full suite that used to exist - it is the
// set of things the challenge-stage work could plausibly have broken by
// restructuring update() into two branches and touching shipHit(),
// updateBackground() and checkWaveClear(). Coverage here should grow as
// other systems get touched, rather than being reconstructed wholesale.
const harness = require('./harness');

const SETTLE = `
  const scene = window.__headOnDebug.scene, state = scene.state;
  scene.resetGame();
  window.__headOnDebug.skipFormationEntry();
`;

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;

  check('no page errors on load', errors.length === 0, errors);

  const boot = await page.evaluate(() => {
    const s = window.__headOnDebug.scene.state;
    return { phase: s.phase, formation: s.formation.length, lives: s.lives, bars: s.colorBars.length, challenge: s.challenge };
  });
  check('the game boots into ordinary play, not a stage',
    boot.phase === 'playing' && boot.challenge === null, boot);
  check('a full formation and a set of bars are present',
    boot.formation === 15 && boot.bars > 0, boot);

  // --- the loop still runs -------------------------------------------------
  const live = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    const start = state.difficulty.elapsed;
    return new Promise(res => setTimeout(() => res({
      elapsedAdvanced: state.difficulty.elapsed > start + 1,
      phase: state.phase,
      starScale: state.starSpeedScale,
      entered: state.formation.filter(f => f.alive && !f.entering).length
    }), 2500));
  });
  check('the difficulty clock advances during ordinary play', live.elapsedAdvanced, live);
  check('the starfield runs at normal speed outside a stage', live.starScale === 1, live);
  check('the wave flies in and settles', live.entered > 0, live);

  // --- shooting ------------------------------------------------------------
  const kill = await page.evaluate(SETTLE + `
    const target = state.formation.filter(f => f.alive)[0];
    const before = state.score;
    const b = { x: target.x, y: target.y, vy: -400, ttl: 5, trailLevels: {}, trailSprites: {},
                sprite: scene.add.sprite(target.x, target.y, 'bulletTex') };
    state.bullets.push(b);
    const hit = scene.bulletVsFormation(b, state.bullets.length - 1);
    ({ hit, dead: !target.alive, scored: state.score - before });
  `);
  check('a bullet still kills a formation member', kill.hit === true && kill.dead, kill);
  check('and still scores for it', kill.scored > 0, kill);

  // --- the death blast still works OUTSIDE a stage -------------------------
  // shipHit() grew a `!state.challenge` condition; this is the other side
  // of that branch.
  const death = await page.evaluate(SETTLE + `
    const seg = () => state.colorBars.filter(b => b.alive)[0].segments.filter(s => s.alive)[0].hp;
    const hpBefore = seg(), scoreBefore = state.score, lives = state.lives;
    scene.shipHit('test');
    ({
      hpBefore, hpAfter: seg(),
      wiped: state.formation.filter(f => f.alive).length,
      scoreUnchanged: state.score === scoreBefore,
      livesLost: lives - state.lives,
      ring: state.starburstFx !== null
    });
  `);
  check('dying outside a stage still sets off the death blast', death.ring, death);
  check('it still wipes the wave', death.wiped === 0, death);
  check('it still chips the bricks', death.hpBefore - death.hpAfter === 2, death);
  check('it still awards no score', death.scoreUnchanged, death);
  check('and still costs exactly one life', death.livesLost === 1, death);

  // --- waves still roll over ----------------------------------------------
  const waves = await page.evaluate(SETTLE + `
    window.__headOnTuning.tuning.challengeEnabled = false; // isolate the ordinary path
    const wave = state.wave;
    state.formation.forEach(f => { if (f.alive) { f.sprite.destroy(); f.alive = false; } });
    for (let i = 0; i < 400 && !state.formation.some(f => f.alive); i++) scene.checkWaveClear(0.016);
    const out = { wave, after: state.wave, refilled: state.formation.filter(f => f.alive).length };
    window.__headOnTuning.tuning.challengeEnabled = true;
    out;
  `);
  check('clearing a wave still advances the counter', waves.after === waves.wave + 1, waves);
  check('and still brings the next formation in', waves.refilled > 0, waves);

  // --- game over and restart ----------------------------------------------
  const over = await page.evaluate(SETTLE + `
    state.lives = 1;
    scene.shipHit('test');
    const gameover = { phase: state.phase, lives: state.lives };
    scene.resetGame();
    ({ gameover, restarted: { phase: state.phase, lives: state.lives, wave: state.wave, score: state.score } });
  `);
  check('the last life still ends the game',
    over.gameover.phase === 'gameover' && over.gameover.lives === 0, over.gameover);
  check('restart still gives a clean run',
    over.restarted.phase === 'playing' && over.restarted.lives === 3 &&
    over.restarted.wave === 1 && over.restarted.score === 0, over.restarted);

  // --- sprite hygiene in ordinary play ------------------------------------
  const leak = await page.evaluate(() => {
    const scene = window.__headOnDebug.scene, state = scene.state;
    scene.resetGame();
    const baseline = scene.children.list.length;
    return new Promise(res => setTimeout(() => res({
      baseline, after: scene.children.list.length, phase: state.phase
    }), 12000));
  });
  // Sprite count moves legitimately with what happens to be on screen -
  // this is looking for unbounded growth, not an exact match.
  check('12s of ordinary play does not run away with sprites',
    leak.after < leak.baseline + 60, leak);

  check('no page errors after full run', errors.length === 0, errors);
});
