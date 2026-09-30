// The flight tutorial - head-on.html?tutorial, and the computer in the
// house that opens it.
//
// What makes this worth a file of its own is that the tutorial is not a
// separate mode with its own copy of the game: it runs the real thing
// with the wave switched off, arms the real spawners, and listens for
// events the mechanics send it. That buys a tutorial that cannot go
// stale - and it means every lesson depends on a line of code somewhere
// else in the file, any of which can be moved without anyone noticing
// that a lesson stopped being passable.
//
// So the checks here PLAY it. Each lesson is completed the way a player
// completes it - fly into the pod, shoot the next one, tap the missile
// button, ride the strip, hold fire, survive the rocks - and the file
// fails if any one of them stops advancing. The cheap structural checks
// (a banner, a step count) are worth little by comparison and are here
// mostly to name what broke when the played ones fail.
//
// The other half is the things a tutorial must never do: spend a life,
// take what you earned, set a high score, spawn waves at you while you
// are being taught, or become unpassable because you missed the one pod
// it sent.
const harness = require('./harness');

const BOOT_MS = 900;

const tutor = page => page.evaluate(() => window.__headOnDebug.tutorial());

const board = page => page.evaluate(() => {
  const s = window.__headOnDebugState;
  return {
    orbs: s.orbs.length, orbBullets: s.orbBullets.length, strips: s.strips.length,
    dots: s.powerup.dots.length, orbiters: s.orbiters.length, bolts: s.powerupBolts.length,
    enemies: s.formation.filter(f => f.alive).length,
    aliveBars: s.colorBars.filter(b => b.alive).length,
    challenge: !!s.challenge, lives: s.lives, score: s.score, best: s.highScore,
    levels: { red: s.colorLevels.red, green: s.colorLevels.green, blue: s.colorLevels.blue },
    phase: s.phase
  };
});

// Steering is not what any of this is about - the thumbstick has its own
// file - so the driver puts the ship where a player would have flown it
// and leaves every other input real.
const park = (page, x) => page.evaluate(v => { window.__headOnDebugState.ship.x = v; }, x);

// Waits for a condition on the tutorial's own state, doing `work` (the
// flying) on every poll. Returns { ok } rather than throwing, so a
// lesson that stops advancing fails by name instead of killing the file.
async function until(page, pred, ms, work) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < ms) {
    if (work) await work();
    last = await tutor(page);
    if (pred(last)) return { ok: true, at: Date.now() - started, state: last };
    await page.waitForTimeout(70);
  }
  return { ok: false, waited: ms, state: last, board: await board(page) };
}

// Fly at whatever the lesson has put on the board, and tap fire.
const chase = (page, what) => async () => {
  const x = await page.evaluate(key => {
    const s = window.__headOnDebugState;
    const it = key === 'orb' ? s.orbs[0] : s.strips[0];
    return it ? it.x : null;
  }, what);
  if (x !== null) await park(page, x);
};

async function tapFire(page) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(45);
  await page.keyboard.up('Space');
}

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  await page.waitForTimeout(BOOT_MS);

  // --- it starts, and it starts at the beginning ---------------------------
  const start = await tutor(page);
  const startBoard = await board(page);
  check('no page errors on load', errors.length === 0, errors);
  check('?tutorial opens the tutorial rather than an ordinary run',
    !!start && start.index === 0 && start.beat === 0, start);
  check('and it opens on the shield lesson', start && start.lesson === 'shield', start);
  check('with a pod already on the board to fly at', startBoard.orbs === 1, startBoard);
  check('and the banner saying what to do',
    typeof (start || {}).say === 'string' && start.say.length > 10, start);

  const banner = await page.evaluate(() => ({
    visible: document.getElementById('tutorBar').classList.contains('visible'),
    step: document.getElementById('tutorStep').textContent,
    say: document.getElementById('tutorSay').textContent,
    skip: !!document.getElementById('tutorSkipBtn'),
    exit: !!document.getElementById('tutorExitBtn')
  }));
  check('the caption is up, numbered, and carries both ways out',
    banner.visible && /1 \/ \d/.test(banner.step) && banner.skip && banner.exit, banner);

  // --- it can be read ------------------------------------------------------
  // The first version of this put the caption over the top of the board,
  // where the bricks are, at a size that suited a footnote. Both halves
  // of that are geometry rather than taste, so both get a check: the
  // band may not overlap the play area at all, and the line has to be
  // at body-text size on the phone viewport these are run at.
  const legible = await page.evaluate(() => {
    const bar = document.getElementById('tutorBar').getBoundingClientRect();
    const board = document.getElementById('canvasWrap').getBoundingClientRect();
    const say = document.getElementById('tutorSay');
    return {
      overlaps: bar.left < board.right && bar.right > board.left &&
                bar.top < board.bottom && bar.bottom > board.top,
      px: parseFloat(getComputedStyle(say).fontSize),
      wide: bar.width > 200
    };
  });
  check('the caption does not sit over the board', legible.overlaps === false, legible);
  check('and is written at a size you can read while flying',
    legible.px >= 14 && legible.wide, legible);

  // --- and it cannot go past faster than it can be read --------------------
  // Measured on the lightning lesson, because that is the one a player
  // can answer instantly: holding fire pays its first tick a third of a
  // second in, so without a floor under it the line would appear and be
  // gone before it could be read. Both dwells are reading time, and
  // neither throws input away - the note is kept and acted on once the
  // line has had its moment.
  for (let i = 0; i < 3; i++) {
    await page.click('#tutorSkipBtn');
    await page.waitForTimeout(160);
  }
  const atLightning = await tutor(page);
  await page.keyboard.down('Space'); // only now - the clock below starts here
  const dwell = await page.evaluate(() => {
    const d = window.__headOnDebug;
    const started = performance.now();
    let sawGot = 0;
    return new Promise(res => {
      const tick = setInterval(() => {
        const t = d.tutorial();
        if (!t) { clearInterval(tick); res({ gone: true }); return; }
        if (!sawGot && t.got > 0) sawGot = performance.now();
        if (sawGot && t.lesson !== 'lightning') {
          clearInterval(tick);
          res({ toGot: (sawGot - started) / 1000, held: (performance.now() - sawGot) / 1000 });
        }
        if (performance.now() - started > 15000) { clearInterval(tick); res({ timeout: true }); }
      }, 40);
    });
  });
  await page.keyboard.up('Space');
  check('the lesson that can be answered instantly is the one to measure',
    atLightning.lesson === 'lightning', atLightning);
  check('an instruction stays up long enough to read before it can be answered',
    dwell.toGot > 1.0, dwell);
  check('and the answer holds too, instead of flicking past', dwell.held > 2.2, dwell);

  // Back to the top, for the lessons themselves.
  await page.goto(ctx.url('head-on.html?tutorial'));
  await page.waitForTimeout(BOOT_MS);

  // --- the ordinary game is switched off while it teaches ------------------
  // A lesson about one pod does not survive a wave of divers arriving in
  // the middle of it, and the powerup spawner would quietly hand out the
  // very thing the next lesson is about to introduce.
  await page.waitForTimeout(2600);
  const quiet = await board(page);
  check('no wave flies in during a lesson', quiet.enemies === 0, quiet);
  check('and nothing spawns on its own beside what the lesson sent',
    quiet.orbs <= 1 && quiet.strips === 0, quiet);

  // --- nothing it can do to you costs anything -----------------------------
  // Deliberately through shipHit() itself rather than by arranging a
  // collision: this is about what a HIT does, and every hazard in the
  // game funnels through that one door.
  // The board is cleared and the ship parked away from where the pod
  // was first: a beat mid-confirmation ignores notes by design (see
  // tutorNote()), so a pod landing on the ship a frame before the
  // scripted hit below would swallow it and fail this for the wrong
  // reason. Settled, then hit.
  await page.evaluate(() => {
    const s = window.__headOnDebugState;
    s.orbs.forEach(o => o.hostSprite.destroy());
    s.orbs = [];
    s.ship.x = 40;
  });
  await until(page, s => s && s.got === 0, 6000);
  await page.evaluate(() => { window.__headOnDebug.giveOrbs('red', 1); });
  const beforeHit = await board(page);
  await page.evaluate(() => { window.__headOnDebug.scene.shipHit('test'); });
  const afterHit = await board(page);
  check('a hit during a lesson costs no life',
    afterHit.lives === beforeHit.lives, { beforeHit, afterHit });
  check('and takes nothing you were told to go and earn',
    afterHit.dots === beforeHit.dots, { beforeHit, afterHit });
  check('and never ends the run', afterHit.phase === 'playing', afterHit);
  // It is noticed, though - the lesson knows it was clipped, which is
  // what lets a later one say so.
  check('but the lesson does see it land', ((await tutor(page)) || {}).notes.hit >= 1,
    await tutor(page));

  // --- a pod you miss is sent again ---------------------------------------
  // The one failure mode a gated tutorial has that an ungated one does
  // not: miss the thing, and the lesson can never be finished.
  await page.evaluate(() => {
    const s = window.__headOnDebugState;
    s.orbs.forEach(o => o.hostSprite.destroy());
    s.orbs = [];
  });
  let orbsBack = 0, waitedFor = 0;
  while (waitedFor < 5000 && orbsBack === 0) {
    await page.waitForTimeout(150);
    waitedFor += 150;
    orbsBack = await page.evaluate(() => window.__headOnDebugState.orbs.length);
  }
  check('a pod you let fall past is replaced', orbsBack > 0, { orbsBack, waitedFor });

  // --- lesson 1: fly into one, then shoot one -----------------------------
  const touched = await until(page, s => s && s.beat === 1, 15000, chase(page, 'orb'));
  check('flying into the pod banks it and moves the lesson on', touched.ok, touched);

  const shot = await until(page, s => s && s.lesson !== 'shield', 20000, async () => {
    const x = await page.evaluate(() => (window.__headOnDebugState.orbs[0] || {}).x);
    if (x !== undefined) { await park(page, x); await tapFire(page); }
  });
  check('and shooting one, then catching what it becomes, finishes the lesson', shot.ok, shot);

  // --- lesson 2: the missiles ---------------------------------------------
  const armed = await board(page);
  check('the missile lesson arrives with shields banked and targets up',
    armed.dots >= 2 && armed.enemies >= 2, armed);
  const killed = await until(page, s => s && s.lesson !== 'missiles', 25000, async () => {
    await page.click('#missileBtn', { force: true }).catch(() => {});
    await page.waitForTimeout(220);
  });
  check('tapping MISSILES until one finds its colour finishes the lesson', killed.ok, killed);

  // --- lesson 3: the strip, then the bricks it arms you for ---------------
  const withBricks = await board(page);
  check('the pulse lesson puts the bricks back on screen', withBricks.aliveBars >= 3, withBricks);
  const rode = await until(page, s => s && s.beat === 1, 25000, chase(page, 'strip'));
  check('riding the strip the whole way down arms the pulse cannon', rode.ok, rode);
  const levels = await board(page);
  check('and that is a real fire-power level, not a tutorial pretend one',
    levels.levels.green > 0, levels);

  const broke = await until(page, s => s && s.lesson !== 'pulse', 25000, async () => {
    const x = await page.evaluate(() => {
      const s = window.__headOnDebugState;
      const bar = s.colorBars.filter(b => b.alive && b.colorKey === 'green')[0];
      if (!bar) return null;
      const seg = bar.segments.filter(g => g.alive)[0];
      return seg ? seg.sprite.x : bar.x;
    });
    if (x !== null) { await park(page, x); await tapFire(page); }
  });
  check('and firing it at a brick of that colour finishes the lesson', broke.ok, broke);

  // --- lesson 4: the lightning --------------------------------------------
  const banked = await board(page);
  check('the lightning lesson makes sure you have something to burn',
    banked.dots >= 2, banked);
  await page.keyboard.down('Space');
  const burned = await until(page, s => s && s.lesson !== 'lightning', 15000);
  await page.keyboard.up('Space');
  check('holding fire long enough to spend one finishes the lesson', burned.ok, burned);

  // --- lesson 5: the speed jump -------------------------------------------
  const jumping = await board(page);
  check('the last lesson drops you straight into a speed jump', jumping.challenge === true, jumping);
  const survived = await until(page, s => s && s.finished, 45000);
  check('and the stage runs itself out and finishes the tutorial', survived.ok, survived);

  // --- and hands the game back --------------------------------------------
  const handedBack = await until(page, s => s === null, 8000);
  check('which then hands the board back to an ordinary run', handedBack.ok, handedBack);
  const playing = await board(page);
  check('with a real wave flying in', playing.enemies > 0, playing);
  check('and nothing the lessons scored counted toward your best',
    playing.best === 0 && playing.score === 0, playing);
  check('the caption is gone with it', await page.evaluate(
    () => !document.getElementById('tutorBar').classList.contains('visible')), null);

  // --- Skip is per lesson --------------------------------------------------
  // "Skip this" has to mean the whole thing you already know, not the
  // next sentence of it: someone who knows how shields work does not
  // want to be walked through shooting a pod either.
  await page.goto(ctx.url('head-on.html?tutorial'));
  await page.waitForTimeout(BOOT_MS);
  const before = await tutor(page);
  await page.click('#tutorSkipBtn');
  await page.waitForTimeout(250);
  const skipped = await tutor(page);
  check('Skip moves to the next LESSON, not the next beat',
    before.lesson === 'shield' && skipped.lesson === 'missiles' && skipped.beat === 0,
    { before, skipped });
  const skippedBoard = await board(page);
  check('and the skipped-to lesson sets its own board up',
    skippedBoard.enemies >= 2 && skippedBoard.orbs === 0, skippedBoard);

  // Skipping off the end is finishing.
  for (let i = 0; i < 6; i++) {
    await page.click('#tutorSkipBtn').catch(() => {});
    await page.waitForTimeout(150);
  }
  const skippedOut = await until(page, s => s === null, 8000);
  check('skipping past the last lesson ends the tutorial', skippedOut.ok, skippedOut);

  // --- Exit drops it entirely ---------------------------------------------
  await page.goto(ctx.url('head-on.html?tutorial'));
  await page.waitForTimeout(BOOT_MS);
  await page.click('#tutorExitBtn');
  await page.waitForTimeout(400);
  const exited = await tutor(page);
  const exitBoard = await board(page);
  check('Exit leaves the tutorial at once', exited === null, exited);
  check('and leaves you in a running game, not a dead screen',
    exitBoard.enemies > 0 && exitBoard.phase === 'playing', exitBoard);

  // A ?tutorial link that re-armed itself on Restart would make Exit a
  // loop rather than a door.
  await page.evaluate(() => {
    const s = window.__headOnDebug.scene;
    s.resetGame();
    s.resumeLaunch();
  });
  await page.waitForTimeout(300);
  check('and a Restart after Exit is an ordinary run, not the tutorial again',
    (await tutor(page)) === null, await board(page));

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'head-on.html?tutorial' });
