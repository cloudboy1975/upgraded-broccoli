// The pink row's weave.
//
// Reported as jarring the eye. Measuring the dive paths said why: it was
// not moving sideways faster than a swoop, it was cramming the same swing
// into two thirds the vertical distance - a cycle every 162px of descent
// at 100px wide. This file pins the retune (a longer wave), the per-dive
// variation that replaced the single repeated pattern, and the cap that
// stops that variation compounding into something worse than the original.
const harness = require('./harness');

const SETTLE = `
  const scene = window.__headOnDebug.scene, state = scene.state;
  scene.resetGame();
  window.__headOnDebug.skipFormationEntry();
  state.difficulty.elapsed = 300;
  state.diveTimer = 9999;
`;

// Drops one zigzag and returns it, mid-dive.
const DROP_ZIGZAG = `
  const slot = state.formation.filter(f => f.alive && f.type === 'zigzag')[0];
  slot.launchIn = 0.02; slot.launchTotal = 0.02; slot.sortieId = 't';
  for (let i = 0; i < 5; i++) window.__headOnDebug.step(0.016);
`;

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;

  check('no page errors on load', errors.length === 0, errors);

  const seeded = await page.evaluate(() => {
    const live = window.__headOnTuning.tuning;
    return Object.keys(live).filter(k => {
      const v = live[k];
      return v === undefined || (typeof v === 'number' && isNaN(v));
    });
  });
  check('every live tuning value is seeded (no hoisting holes)', seeded.length === 0, seeded);

  // --- the retune -----------------------------------------------------------
  // Measured off real dive paths rather than read off the constants, so
  // this still means something if the motion is ever reshaped.
  const geom = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    const T = window.__headOnTuning.tuning;
    function trace(type) {
      let lateralPeak = 0, descent = 0, n = 0;
      const halfWaves = [];
      for (let trial = 0; trial < 6; trial++) {
        scene.resetGame();
        window.__headOnDebug.skipFormationEntry();
        state.difficulty.elapsed = 300;
        state.diveTimer = 9999;
        const slot = state.formation.filter(f => f.alive && f.type === type)[0];
        slot.launchIn = 0.02; slot.launchTotal = 0.02; slot.sortieId = 't';
        for (let i = 0; i < 5; i++) window.__headOnDebug.step(0.016);
        let prevX = slot.x, prevY = slot.y, lastSign = null, lastCrossY = null;
        for (let i = 0; i < 400 && slot.alive && slot.diving; i++) {
          window.__headOnDebug.stepDivers(0.016);
          const vx = (slot.x - prevX) / 0.016;
          // Skip the weave's ease-in. Scaling a sine in from zero over
          // DIVE_WEAVE_EASE_IN adds a d(scale)/dt term to the lateral
          // speed, so the first ~0.35s spikes for reasons that have
          // nothing to do with how the wave itself reads. Measuring
          // through it made this check swing between 1.78 and 2.08 run
          // to run - it was measuring the transient, not the weave.
          if (slot.age < 0.4) { prevX = slot.x; prevY = slot.y; continue; }
          descent += (slot.y - prevY) / 0.016; n++;
          lateralPeak = Math.max(lateralPeak, Math.abs(vx));
          const sign = Math.sign(vx);
          if (lastSign !== null && sign !== 0 && sign !== lastSign) {
            if (lastCrossY !== null) halfWaves.push(slot.y - lastCrossY);
            lastCrossY = slot.y;
          }
          if (sign !== 0) lastSign = sign;
          prevX = slot.x; prevY = slot.y;
        }
      }
      const avgDescent = descent / n;
      const wave = halfWaves.length ? (halfWaves.reduce((a, c) => a + c, 0) / halfWaves.length) * 2 : 0;
      return {
        wavelength: Math.round(wave),
        descent: Math.round(avgDescent),
        lateralPeak: Math.round(lateralPeak),
        dartRatio: +(lateralPeak / avgDescent).toFixed(2)
      };
    }
    ({ zigzag: trace('zigzag'), swoop: trace('swoop') });
  `);
  // The original crammed a cycle into 162px. Anything under ~190 is back
  // in the range that was reported as jarring.
  check('a zigzag cycle now spans a long stretch of descent, not a stutter',
    geom.zigzag.wavelength >= 190, geom);
  // Against an absolute figure, not against swoop: swoop's own peak
  // depends on a random phase and measured anywhere from 1.56 to 1.91
  // across runs, so comparing the two is a coin toss. The original
  // zigzag sat at 1.97.
  check('and no longer darts as hard, relative to its own descent, as it did',
    geom.zigzag.dartRatio < 1.9, geom);
  // It must still be the hardest row - smoother was the ask, not easier.
  check('it still descends faster than a swoop, so it stays the hard row',
    geom.zigzag.descent > geom.swoop.descent, geom);

  // --- per-dive variation ---------------------------------------------------
  const vary = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    const T = window.__headOnTuning.tuning;
    function sample(variation, n) {
      T.zigzagVariation = variation;
      const freqs = [], amps = [], peaks = [];
      for (let t = 0; t < n; t++) {
        scene.resetGame();
        window.__headOnDebug.skipFormationEntry();
        state.difficulty.elapsed = 300;
        state.diveTimer = 9999;
        const slot = state.formation.filter(f => f.alive && f.type === 'zigzag')[0];
        slot.launchIn = 0.02; slot.launchTotal = 0.02; slot.sortieId = 't';
        for (let i = 0; i < 5; i++) window.__headOnDebug.step(0.016);
        if (!slot.weaveFreq) continue;
        freqs.push(slot.weaveFreq);
        amps.push(slot.weaveAmplitude);
        peaks.push(slot.weaveFreq * slot.weaveAmplitude);
      }
      return { freqs, amps, peaks };
    }
    const off = sample(0, 20);
    const on = sample(0.22, 120);
    const d = window.__headOnTuning.defaults();
    T.zigzagVariation = d.zigzagVariation;
    ({
      off: {
        distinctFreq: new Set(off.freqs.map(f => f.toFixed(4))).size,
        freq: off.freqs[0], amp: off.amps[0]
      },
      on: {
        n: on.freqs.length,
        distinctFreq: new Set(on.freqs.map(f => f.toFixed(4))).size,
        freqMin: +Math.min(...on.freqs).toFixed(2), freqMax: +Math.max(...on.freqs).toFixed(2),
        ampMin: +Math.min(...on.amps).toFixed(1), ampMax: +Math.max(...on.amps).toFixed(1),
        peakMax: +Math.max(...on.peaks).toFixed(1),
        cap: +(d.zigzagFreq * d.zigzagAmplitude * 1.22).toFixed(1),
        overCap: on.peaks.filter(x => x > d.zigzagFreq * d.zigzagAmplitude * 1.22 + 0.5).length
      },
      base: { freq: d.zigzagFreq, amp: d.zigzagAmplitude }
    });
  `);
  check('with variation off, every dive flies the identical wave',
    vary.off.distinctFreq === 1 && vary.off.freq === vary.base.freq &&
    vary.off.amp === vary.base.amp, vary.off);
  // A proportion, not an exact count: the sample is rounded to 4dp to
  // compare, and a few collisions in 120 draws from a continuous range is
  // the birthday paradox, not the code repeating itself. With variation
  // off this reads 1, which is what the check is really for.
  check('with it on, dives essentially never share a wave',
    vary.on.distinctFreq >= vary.on.n * 0.9 && vary.on.n > 100, vary.on);
  check('dives vary in how long their wave is', vary.on.freqMax - vary.on.freqMin > 0.8, vary.on);
  check('and in how wide it swings', vary.on.ampMax - vary.on.ampMin > 10, vary.on);
  // The bug this exists for: frequency and amplitude multiply into the
  // lateral speed, so rolling both high compounds into a dive that darts
  // HARDER than the one being tuned away from. Measured at 306 px/s
  // against the old 282 before the cap went in.
  check('no dive compounds into something more frantic than the baseline allows',
    vary.on.overCap === 0 && vary.on.peakMax <= vary.on.cap + 0.5, vary.on);

  // --- the lean must follow the wave it leans into --------------------------
  // The sprite's roll and its sideways motion are two readings of the
  // same sine. If the roll kept the tuned frequency while the motion used
  // the dive's own, they would drift apart and the ship would look like
  // it was rolling at random.
  const lean = await page.evaluate(SETTLE + DROP_ZIGZAG + `
    let worst = 0, sampled = 0;
    for (let i = 0; i < 150 && slot.alive && slot.diving; i++) {
      window.__headOnDebug.stepDivers(0.016);
      // Skip the telegraph settle: for up to telegraphSettleMax after the
      // drop the sprite is still easing out of its spin, so rotation is
      // deliberately not the flight angle yet.
      if (slot.spinSettle > 0) continue;
      const scale = Math.min(1, slot.age / 0.35);          // DIVE_WEAVE_EASE_IN
      const expected = Math.sin(slot.age * slot.weaveFreq + slot.phase) * 0.4 * scale;
      worst = Math.max(worst, Math.abs(slot.sprite.rotation - expected));
      sampled++;
    }
    ({ worst: +worst.toFixed(5), sampled, freq: +slot.weaveFreq.toFixed(3) });
  `);
  check('the lean tracks the dive\'s own wave exactly, not the tuned one',
    lean.sampled > 40 && lean.worst < 0.0001, lean);

  // --- guarantees the retune must not have broken ---------------------------
  // The weave eases in from zero, so a drop never teleports sideways.
  // This cost a whole debugging round once; a reshaped wave is exactly the
  // kind of change that could quietly undo it.
  const drop = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    let worstStep = 0;
    for (let trial = 0; trial < 10; trial++) {
      scene.resetGame();
      window.__headOnDebug.skipFormationEntry();
      state.difficulty.elapsed = 300;
      state.diveTimer = 9999;
      const slot = state.formation.filter(f => f.alive && f.type === 'zigzag')[0];
      slot.launchIn = 0.02; slot.launchTotal = 0.02; slot.sortieId = 't';
      let prevX = slot.x, wasDiving = slot.diving;
      for (let i = 0; i < 40; i++) {
        window.__headOnDebug.step(0.016);
        window.__headOnDebug.stepDivers(0.016);
        if (!wasDiving && slot.diving) worstStep = Math.max(worstStep, Math.abs(slot.x - prevX));
        wasDiving = slot.diving;
        prevX = slot.x;
      }
    }
    ({ worstStep: +worstStep.toFixed(2) });
  `);
  check('a zigzag still does not jump sideways on the frame it drops',
    drop.worstStep < 8, drop);

  const reach = await page.evaluate(SETTLE + DROP_ZIGZAG + `
    const anchor = slot.spawnX;
    let maxDev = 0;
    for (let i = 0; i < 220 && slot.alive; i++) {
      window.__headOnDebug.stepDivers(0.016);
      maxDev = Math.max(maxDev, Math.abs(slot.x - anchor));
    }
    ({ maxDev: +maxDev.toFixed(1), amp: +slot.weaveAmplitude.toFixed(1) });
  `);
  check('and still weaves out to its full width once eased in',
    reach.maxDev > reach.amp * 0.9, reach);

  // A wider wave must not walk off the board.
  const onScreen = await page.evaluate(`
    const scene = window.__headOnDebug.scene, state = scene.state;
    let minX = 999, maxX = -999;
    for (let trial = 0; trial < 12; trial++) {
      scene.resetGame();
      window.__headOnDebug.skipFormationEntry();
      state.difficulty.elapsed = 300;
      state.diveTimer = 9999;
      state.formation.filter(f => f.alive && f.type === 'zigzag').forEach(z => {
        z.launchIn = 0.02; z.launchTotal = 0.02; z.sortieId = 't';
      });
      for (let i = 0; i < 5; i++) window.__headOnDebug.step(0.016);
      for (let i = 0; i < 300; i++) {
        window.__headOnDebug.stepDivers(0.016);
        state.formation.forEach(z => {
          if (z.alive && z.diving && z.type === 'zigzag') {
            minX = Math.min(minX, z.x); maxX = Math.max(maxX, z.x);
          }
        });
      }
    }
    ({ minX: Math.round(minX), maxX: Math.round(maxX) });
  `);
  check('a wider wave still stays on the board', onScreen.minX > -40 && onScreen.maxX < 400, onScreen);

  // --- the lab levers -------------------------------------------------------
  const live = await page.evaluate(SETTLE + `
    const T = window.__headOnTuning.tuning;
    T.zigzagFreq = 7; T.zigzagAmplitude = 30; T.zigzagVariation = 0;
    ${DROP_ZIGZAG}
    const tight = { f: +slot.weaveFreq.toFixed(2), a: +slot.weaveAmplitude.toFixed(1) };
    const d = window.__headOnTuning.defaults();
    T.zigzagFreq = d.zigzagFreq; T.zigzagAmplitude = d.zigzagAmplitude; T.zigzagVariation = d.zigzagVariation;
    ({ tight });
  `);
  check('the lab sliders retune the wave for the next dive',
    live.tight.f === 7 && live.tight.a === 30, live);

  check('no page errors after full run', errors.length === 0, errors);
});
