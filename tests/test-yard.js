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
async function reachedPage(page, name, timeout) {
  try {
    await page.waitForURL('**/' + name, { timeout: timeout });
    return true;
  } catch (e) {
    return false;
  }
}

function reachedGame(page, timeout) { return reachedPage(page, 'head-on.html', timeout); }

// Every state read has to survive the page NAVIGATING AWAY underneath
// it. The yard has two auto-triggers on it now - the ship and the
// doorstep - and either one placed badly enough to cover the spawn
// point sends the scene somewhere else before a single check runs,
// killing the file with a test error rather than failing the check that
// exists to catch precisely that. The sentinel turns it back into a
// FAIL, and it is asserted positively below for the same reason: an
// absent state object would sail through any "not true" test.
async function readState(page) {
  try {
    return await page.evaluate(() => window.__yardDebug.state());
  } catch (e) {
    return { gone: true, why: String(e).slice(0, 120) };
  }
}

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  await page.waitForTimeout(BOOT_MS);

  check('no page errors on load', errors.length === 0, errors);

  const start = await readState(page);
  check('the scene boots into the yard, on foot', start.mode === 'walk', start);
  check('and stays there rather than triggering something on load',
    start.gone !== true && start.atShip === false && start.atDoor === false, start);
  check('starting away from the ship, not on top of it',
    start.shipDistance > start.boardRadius * 1.5, start);
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

  // --- the front door goes inside -------------------------------------------
  // The scene's whole navigation is two opposite walks: right to the
  // ship, left to the house. Both are auto-triggers with no button, and
  // both have to be reachable by ONE held direction from where you
  // start - the door was not, for the same reason the ship once was
  // not, and it is worth a standing check on each.
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);
  // Read defensively and asserted as an explicit false: a doorstep big
  // enough to cover the start point sends the scene straight into the
  // house, and every evaluate after that hits a dead context - which
  // reads as a broken test file rather than as this failing.
  const atStart = await readState(page);
  check('you do not start on the doorstep', atStart.atDoor === false, atStart);

  const doorMs = await walkUntilBoarded(page, 'ArrowLeft', 8000);
  const entering = await page.evaluate(() => window.__yardDebug.state());
  check('holding left alone reaches the front door',
    entering.mode === 'entering', { doorMs, entering });
  check('and it is as short a walk as the one to the ship', doorMs < 3500, { doorMs });

  check('which takes you inside the house',
    await reachedPage(page, 'house.html', 6000), page.url());


  // Coming back out must not put you straight back in. The start point
  // is where you land on the way out, so if it sat inside the doorstep's
  // zone the two scenes would bounce off each other forever.
  const inside = await page.evaluate(() => window.__houseDebug.state());
  check('and the house is a real scene, not a dead end', inside.mode === 'walk', inside);

  await page.evaluate(() => { const d = window.__houseDebug; d.moveTo(d.props.door.worldX, 0.08); });
  check('whose own door comes back out to the yard',
    await reachedPage(page, 'yard.html', 6000), page.url());
  await page.waitForTimeout(BOOT_MS);

  const backOutside = await page.evaluate(() => window.__yardDebug.state());
  check('landing outside the doorstep, not on it',
    backOutside.mode === 'walk' && !backOutside.atDoor, backOutside);
  await page.waitForTimeout(900);
  const settled = await page.evaluate(() => ({ mode: window.__yardDebug.state().mode, url: location.pathname }));
  check('so you stay outside instead of bouncing back in',
    settled.mode === 'walk' && settled.url.indexOf('yard.html') !== -1, settled);

  // The way in is the DOOR, not a marker near it. That distinction is
  // invisible to any test that only walks left until something happens -
  // a trigger sitting on the lawn a metre to one side passes that just
  // as well, and looks like teleporting off a paving stone, which is
  // what it was. So: lined up with the door works, one house-width
  // aside does not, and it works from anywhere down the garden rather
  // than only from the depth the player happens to spawn at.
  const aim = await page.evaluate(() => {
    const d = window.__yardDebug, s = d.scene;
    const house = d.state().house;
    const door = s.placeAt(house.worldX, house.depth);
    function worldXOfScreen(x, depth) {
      return (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    }
    function at(worldX, depth) { s.worldX = worldX; s.depth = depth; return s.atDoor(); }
    const out = { depths: [], aside: null, behind: null };
    [0.5, 0.64, 0.8, 0.96].forEach(function (depth) {
      out.depths.push({ depth: depth, lined: at(worldXOfScreen(door.x, depth), depth) });
    });
    // One house-width to the side, at the depth you actually walk at.
    const houseW = 200 * door.scale * 1.15;
    out.aside = at(worldXOfScreen(door.x + houseW, 0.64), 0.64);
    // And up past it, which is round the back.
    out.behind = at(worldXOfScreen(door.x, 0.2), 0.2);
    s.worldX = -0.16; s.depth = 0.64;
    return out;
  });
  check('lining up with the door opens it from anywhere down the garden',
    aim.depths.length === 4 && aim.depths.every(d => d.lined === true), aim);
  check('standing a house-width to the side does not', aim.aside === false, aim);
  check('and nor does being round the back of it', aim.behind === false, aim);

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
