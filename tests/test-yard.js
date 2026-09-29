// The yard - chapter 1's opening scene.
//
// Almost everything here is really one assertion in different clothes:
// THE PLAYER GETS INTO THE GAME. This file sits in front of head-on.html,
// it will be crossed hundreds of times by someone who only wants to
// shoot things, and every way it can fail is a way of not letting them
// through - a walk that cannot reach the ship, a boarding trigger that
// never fires, a takeoff that plays forever, a skip button that does
// nothing. So the checks are about arrival and about TIME, not about how
// the grass looks.
//
// The time budgets are deliberately loose. They are here to catch a
// sequence that hangs or a walk that has quietly doubled, not to pin the
// pacing - the pacing is meant to be retuned, and a test that fails every
// time somebody nudges a duration just gets edited into uselessness.
const harness = require('./harness');

const BOOT_MS = 700;

// Holds a direction until the scene leaves 'walk', and reports how long
// that took. Driven by real key events rather than by teleporting,
// because "can you reach the ship by holding right" is the whole
// question and a teleport cannot answer it.
async function walkUntilBoarded(page, key, budgetMs) {
  const started = Date.now();
  await page.keyboard.down(key);
  while (Date.now() - started < budgetMs) {
    const mode = await page.evaluate(() => window.__yardDebug.state().mode);
    if (mode !== 'walk') break;
    await page.waitForTimeout(60);
  }
  await page.keyboard.up(key);
  return Date.now() - started;
}

// waitForURL THROWS on timeout, which aborts the file and reports a test
// error - so a broken takeoff or a dead skip button reads as "the test
// is broken" rather than as the failed check it is. Every arrival goes
// through here instead, and a failure to arrive is just false.
async function reachedGame(page, timeout) {
  try {
    await page.waitForURL('**/head-on.html', { timeout: timeout });
    return true;
  } catch (e) {
    return false;
  }
}

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  await page.waitForTimeout(BOOT_MS);

  check('no page errors on load', errors.length === 0, errors);

  const start = await page.evaluate(() => window.__yardDebug.state());
  check('the scene boots into the yard, on foot', start.mode === 'walk', start);
  check('and you start away from the ship, not on top of it',
    !start.atShip && start.shipDistance > start.boardRadius * 1.5, start);
  check('nothing is prompting yet', start.prompt === null, start);

  // --- nothing stands under the controls ------------------------------------
  // Both of these are layout facts with no other guard on them: the
  // depth axis decides where things land on the screen, and retuning it
  // for how the scene LOOKS will happily park the player under the
  // thumbstick or the ship behind the Fly button. Neither shows up in
  // any behaviour test, because everything still works - it is just
  // unusable with a hand on it.
  const layout = await page.evaluate(() => {
    const b = window.__yardDebug.bounds();
    function rect(id) {
      const r = document.getElementById(id).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    function overlaps(a, c) {
      return a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    }
    const stick = rect('stickZone'), fly = rect('flyBtn');
    return {
      youOnStick: overlaps(b.you, stick),
      shipOnFly: overlaps(b.ship, fly),
      youBottom: Math.round(b.you.bottom), stickTop: Math.round(stick.top),
      shipBottom: Math.round(b.ship.bottom), shipRight: Math.round(b.ship.right),
      flyTop: Math.round(fly.top), flyLeft: Math.round(fly.left)
    };
  });
  check('you do not start standing under the thumbstick', !layout.youOnStick, layout);
  check('and the ship is not parked behind the Fly button', !layout.shipOnFly, layout);

  // --- the ship is a dart, not a pancake ------------------------------------
  // head-on.html's own ship is taller than it is wide. This one is the
  // same craft seen parked, so a little foreshortening is right and a lot
  // is not - it had been drawn at 1.8:1, which read as squat.
  const shape = await page.evaluate(() => window.__yardDebug.shipShape);
  check('the parked ship keeps the game ship\'s upright proportions',
    shape.width / shape.height < 1.25, shape);

  // --- the walk ------------------------------------------------------------
  // Holding ONE direction has to be enough. The ground is a trapezoid
  // with a depth axis, and if reaching the ship needs the player to
  // understand that on the first screen of the game, the opening has
  // taught a lesson nobody asked for.
  const walkMs = await walkUntilBoarded(page, 'ArrowRight', 8000);
  const boarded = await page.evaluate(() => window.__yardDebug.state());
  check('holding right alone reaches the ship', boarded.mode !== 'walk', { walkMs, boarded });
  check('and touching it boards - no button, no confirm', boarded.mode === 'board', boarded);
  check('the walk is short enough never to become a chore', walkMs < 3500, { walkMs });

  const ui = await page.evaluate(() => ({
    controls: document.getElementById('controlBar').classList.contains('gone'),
    hint: document.getElementById('hint').classList.contains('hidden')
  }));
  check('the controls get out of the way once the takeoff starts',
    ui.controls && ui.hint, ui);

  // --- the takeoff ---------------------------------------------------------
  const flying = await page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    const seen = {};
    const tick = () => {
      const s = window.__yardDebug.state();
      seen[s.mode] = true;
      if (s.mode === 'liftoff' && !seen.liftoffAt) {
        seen.liftoffAt = performance.now();
        seen.liftoffY = s.shipY;
        seen.liftoffScale = s.shipScale;
      }
      if (s.mode === 'gone' || performance.now() - t0 > 6000) {
        res({ seen, lastY: s.shipY, lastScale: s.shipScale, youVisible: s.youVisible,
              ms: performance.now() - t0 });
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  check('boarding hands over to a liftoff', flying.seen.liftoff === true, flying);
  check('you are inside the ship by then, not standing beside it',
    flying.youVisible === false, flying);
  check('the ship actually leaves - it climbs and it shrinks',
    flying.lastY < flying.seen.liftoffY && flying.lastScale < flying.seen.liftoffScale, flying);

  // The point of the whole file.
  const arrived = await reachedGame(page, 8000);
  check('the takeoff lands you in the game', arrived, page.url());

  const game = arrived ? await page.evaluate(() => {
    const d = window.__headOnDebug;
    return { ready: !!d, phase: d && d.scene.state.phase };
  }) : { ready: false, phase: null };
  check('and the game is actually running when you get there',
    game.ready && game.phase === 'playing', game);

  // --- the express lane ----------------------------------------------------
  // Someone who only wants to play must never have to sit through any of
  // the above, and the button that does that is the one thing here whose
  // breaking would be invisible in normal testing.
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);
  const before = Date.now();
  await page.click('#flyBtn');
  const skipped = await reachedGame(page, 5000);
  const skipMs = Date.now() - before;
  check('the Fly button goes straight to the game', skipped, page.url());
  check('immediately, with no cutscene to sit through', skipped && skipMs < 2000, { skipMs });

  // Same job, on a keyboard.
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.keyboard.press('Space');
  check('and the space bar does the same', await reachedGame(page, 5000), page.url());

  // --- the house is scenery, and says so ------------------------------------
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);
  const atDoor = await page.evaluate(() => {
    const d = window.__yardDebug;
    const s0 = d.state();
    // Stand where the door is. Teleporting is right here - this is about
    // what happens on arrival, not about the walking, which the walk
    // checks above already cover.
    d.scene.worldX = -0.62;
    d.scene.depth = 0.44;
    return new Promise(res => setTimeout(() => {
      const s = d.state();
      res({ before: s0.prompt, atDoor: s.atDoor, mode: s.mode, prompt: s.prompt,
            hintHidden: document.getElementById('hint').classList.contains('hidden'),
            hintText: document.getElementById('hint').textContent });
    }, 250));
  });
  check('standing at the door says the house is for later',
    atDoor.atDoor && atDoor.prompt !== null && !atDoor.hintHidden, atDoor);
  check('rather than silently doing nothing, which reads as broken',
    atDoor.hintText.length > 0, atDoor);
  check('and the house does NOT launch you', atDoor.mode === 'walk', atDoor);

  // Walking off again clears the prompt - a message that sticks after you
  // have left looks like a stuck label.
  const awayFromDoor = await page.evaluate(() => {
    const d = window.__yardDebug;
    d.scene.worldX = 0.1;
    d.scene.depth = 0.78;
    return new Promise(res => setTimeout(() => {
      const s = d.state();
      res({ atDoor: s.atDoor, prompt: s.prompt,
            hintHidden: document.getElementById('hint').classList.contains('hidden') });
    }, 250));
  });
  check('and it clears again once you walk away',
    !awayFromDoor.atDoor && awayFromDoor.prompt === null && awayFromDoor.hintHidden, awayFromDoor);

  // --- wandering is safe ----------------------------------------------------
  // The boarding radius is generous on purpose. Generous must not mean
  // "anywhere": walking the other way has to leave you in the yard.
  const wander = await page.evaluate(() => {
    const d = window.__yardDebug;
    return new Promise(res => {
      d.scene.worldX = -0.9;
      d.scene.depth = 0.95;
      setTimeout(() => {
        const s = d.state();
        res({ mode: s.mode, atShip: s.atShip, distance: s.shipDistance, radius: s.boardRadius });
      }, 400);
    });
  });
  check('walking away from the ship does not board it',
    wander.mode === 'walk' && !wander.atShip && wander.distance > wander.radius, wander);

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'yard.html' });
