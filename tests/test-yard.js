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
async function walkUntilBoarded(page, keys, budgetMs) {
  const held = [].concat(keys);
  const started = Date.now();
  for (const k of held) await page.keyboard.down(k);
  while (Date.now() - started < budgetMs) {
    const mode = await page.evaluate(() => window.__yardDebug.state().mode);
    if (mode !== 'walk') break;
    await page.waitForTimeout(60);
  }
  for (const k of held) await page.keyboard.up(k);
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

// Hold a direction from a spot and report where it left you, plus
// whether the player was ever standing inside the house's walls on the
// way - which is the thing being fixed, and is invisible in a final
// position.
async function walkUntilStopped(page, from, keys, budgetMs) {
  await page.evaluate(f => window.__yardDebug.moveTo(f[0], f[1]), from);
  await page.waitForTimeout(140);
  for (const k of keys) await page.keyboard.down(k);
  const started = Date.now();
  let everInside = false, left = false;
  while (Date.now() - started < budgetMs) {
    const st = await readState(page);
    if (st.gone) { left = true; break; }
    if (st.inWall) everInside = true;
    if (st.mode !== 'walk') break;
    await page.waitForTimeout(50);
  }
  for (const k of keys) await page.keyboard.up(k).catch(() => {});
  const end = left ? { gone: true } : await readState(page);
  return { end: end, everInside: everInside };
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

  // Up the path and in, which is one diagonal push of the stick. The
  // ship is one held direction because it is the thing you came for;
  // the house asks for a deliberate walk to its door, which is what the
  // path on the grass is there to teach.
  const doorMs = await walkUntilBoarded(page, ['ArrowLeft', 'ArrowUp'], 8000);
  const entering = await page.evaluate(() => window.__yardDebug.state());
  check('walking up the path and into the doorway goes in',
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

  // The way in is the DOORWAY - standing IN it, not merely pointing at
  // it from the lawn. Every one of these is a spot that used to let you
  // in and now must not: the trigger has been a stepping stone and a
  // whole column of grass, and both looked fine until somebody walked
  // it. The door's position is solved for rather than hardcoded, so a
  // trigger that drifts thirty pixels off it still fails here.
  const aim = await page.evaluate(() => {
    const d = window.__yardDebug, s = d.scene;
    const door = d.state().doorRect;
    function worldXOfScreen(x, depth) {
      return (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    }
    function at(worldX, depth) { s.worldX = worldX; s.depth = depth; return s.atDoor(); }
    // The threshold's own depth, solved from the door's screen position.
    const sill = (door.bottom - s.horizonY()) / (s.scale.height - s.horizonY());
    const out = {
      sill: +sill.toFixed(2),
      inDoorway: at(worldXOfScreen(door.cx, sill), sill),
      onPath: at(worldXOfScreen(door.cx, 0.72), 0.72),
      atSpawnDepth: at(worldXOfScreen(door.cx, 0.64), 0.64),
      frontOfYard: at(worldXOfScreen(door.cx, 0.96), 0.96),
      aside: at(worldXOfScreen(door.cx + 200 * door.scale * 0.6, sill), sill),
      behind: at(worldXOfScreen(door.cx, 0.2), 0.2)
    };
    s.worldX = -0.16; s.depth = 0.64;
    return out;
  });
  check('standing in the doorway is the way in', aim.inDoorway === true, aim);
  check('pointing at it from the path is not', aim.onPath === false, aim);
  check('nor from where you spawned', aim.atSpawnDepth === false, aim);
  check('nor from the front of the yard', aim.frontOfYard === false, aim);
  check('standing beside the door does not let you in', aim.aside === false, aim);
  check('and nor does being round the back of the house', aim.behind === false, aim);

  // --- the house is solid --------------------------------------------------
  // You could walk into it. Not through the door - through the WALL:
  // the depth axis runs past the building, the sprites sort by screen
  // y, and the player slid behind the front wall and vanished, a foot
  // from a door they never found. Worth its own section because none of
  // the door checks above would ever notice: they are all about the one
  // place in that wall where walking in IS the point.
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);

  const intoTheWall = await walkUntilStopped(page, [-0.85, 0.72], ['ArrowUp'], 4000);
  check('walking at the front of the house stops you',
    intoTheWall.end.mode === 'walk' && intoTheWall.end.depth > 0.4, intoTheWall);
  check('and you are left standing in front of it, not inside it',
    intoTheWall.everInside === false && intoTheWall.end.inWall === false, intoTheWall);

  // The wall is the house's own WIDTH, and only from its own feet
  // backwards - a block that swallowed the whole garden would pass the
  // two checks above just as well. Asked of the geometry directly
  // rather than walked: the lane beside the house is a few metres wide
  // and the ship's boarding radius is generous, and two probes in this
  // file have already been eaten trying to walk down it.
  const wallShape = await page.evaluate(() => {
    const d = window.__yardDebug, s = d.scene;
    const f = d.state().houseFront;
    const wx = (x, depth) => (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    const back = 0.3, front = 0.8, mid = (f.left + f.right) / 2;
    return {
      behindTheWall: s.insideHouse(wx(mid, back), back),
      besideIt: s.insideHouse(wx(f.right + 30, back), back),
      inFrontOfIt: s.insideHouse(wx(mid, front), front),
      besideX: +wx(f.right + 30, back).toFixed(2)
    };
  });
  check('and the wall is the house itself, not the whole top of the garden',
    wallShape.behindTheWall === true && wallShape.besideIt === false, wallShape);
  check('with the yard in front of it free to stand in',
    wallShape.inFrontOfIt === false, wallShape);

  // --- the door opens as you come up the path -----------------------------
  // The light spilling out is the only thing on screen telling a
  // first-timer the house can be entered at all, and it is pure
  // decoration - nothing breaks if it stops working, which is exactly
  // why it needs a test.
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);
  const swing = await page.evaluate(() => {
    const d = window.__yardDebug, s = d.scene;
    function worldXOfScreen(x, depth) {
      return (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    }
    const door = d.state().doorRect;
    function settle(worldX, depth, ms) {
      d.moveTo(worldX, depth);
      return new Promise(res => setTimeout(() => res(d.state().doorOpen), ms));
    }
    return (async () => {
      const shutAtSpawn = d.state().doorOpen;
      const onPath = await settle(worldXOfScreen(door.cx, 0.62), 0.62, 700);
      const walkedOff = await settle(0.5, 0.8, 900);
      const backAgain = await settle(worldXOfScreen(door.cx, 0.62), 0.62, 700);
      // Level with the door but well off to one side. The zone is tall
      // so it reaches down the path, and nothing else here would notice
      // if it got equally wide and started opening the door for anyone
      // crossing the front of the house. Kept back at the house's own
      // depth, clear of the ship - out on the path this spot boards.
      const aside = await settle(worldXOfScreen(door.cx + 150 * door.scale, 0.45), 0.45, 900);
      return { shutAtSpawn, onPath: +onPath.toFixed(2),
               walkedOff: +walkedOff.toFixed(2), backAgain: +backAgain.toFixed(2),
               aside: +aside.toFixed(2) };
    })();
  });
  check('the door is shut when the scene opens', swing.shutAtSpawn === 0, swing);
  check('and swings open as you come up the path', swing.onPath > 0.9, swing);
  check('shutting again when you wander off', swing.walkedOff < 0.1, swing);
  check('and opening again when you come back', swing.backAgain > 0.9, swing);
  check('but not for someone crossing the front of the house', swing.aside < 0.1, swing);

  // ...and the light has to reach the screen. Everything above reads the
  // swing's state, and a door that "opens" while nothing gets drawn
  // passes all of it - so this one reads pixels back off the canvas. The
  // figure is parked away in the corner for both samples, with the
  // proximity test stubbed out, so the only difference between the two
  // reads is the light: the doorway itself, and the grass just outside
  // it where the spill lands.
  const litPixels = await page.evaluate(() => {
    const d = window.__yardDebug, s = d.scene;
    const door = d.state().doorRect;
    function brightness(x, y, w, h) {
      return new Promise(res => {
        s.game.renderer.snapshotArea(Math.round(x), Math.round(y),
          Math.round(w), Math.round(h), img => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let sum = 0;
            for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
            res(+(sum / (px.length / 4) / 3).toFixed(2));
          });
      });
    }
    const doorway = () => brightness(door.left, door.top, door.width, door.bottom - door.top);
    const grass = () => brightness(door.cx - 55, door.bottom + 4, 110, 46);
    const wait = ms => new Promise(res => setTimeout(res, ms));
    return (async () => {
      d.moveTo(0.55, 0.9);
      await wait(900);
      const out = { shutDoorway: await doorway(), shutGrass: await grass() };
      s.nearDoor = function () { return true; };
      await wait(800);
      out.open = d.state().doorOpen;
      out.litDoorway = await doorway();
      out.litGrass = await grass();
      delete s.nearDoor;
      return out;
    })();
  });
  check('the open doorway is lit on screen, not just in the state',
    litPixels.open === 1 && litPixels.litDoorway > litPixels.shutDoorway * 1.8, litPixels);
  check('and the light spills out onto the grass in front of it',
    litPixels.litGrass > litPixels.shutGrass * 1.12, litPixels);

  // Stepping through arrives with the leaf a hair short of wide, so the
  // swing has to keep running under the fade - freezing it there reads
  // as the door catching on something at the last moment. Started
  // deliberately half open, because the real walk-in gets to 0.96 and a
  // check that starts there proves nothing.
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);
  const throughFade = await page.evaluate(() => {
    const d = window.__yardDebug, s = d.scene;
    const door = d.state().doorRect;
    const sill = (door.bottom - s.horizonY()) / (s.scale.height - s.horizonY());
    // Deliberately off to one side of the opening, the way the real
    // walk-in arrives: the doorstep is wider than the door.
    d.moveTo((door.cx + door.width * 0.8 - s.scale.width / 2) / s.depthToHalfWidth(sill), sill);
    s.doorOpen = 0.6;
    return new Promise(res => {
      const started = Date.now();
      let atEntry = null, peak = 0, offAtEntry = null, closest = Infinity, overLight = false;
      const off = () => Math.abs(s.you.x - door.cx);
      // Watched against the SCENE's clock rather than a wall-time
      // delay. The fade runs on that clock - at wall speed on a real
      // machine and at half of it on a headless one - and the page
      // navigates the moment the fade ends, so a probe still reading
      // then dies as a broken test file instead of a failing check.
      // Letting go three-quarters of the way through is a whole frame
      // clear of that, on either machine.
      const tick = setInterval(() => {
        const st = d.state();
        const done = mode => {
          clearInterval(tick);
          res({ atEntry: atEntry === null ? null : +atEntry.toFixed(2),
                peak: +peak.toFixed(2), mode: mode,
                offAtEntry: offAtEntry === null ? null : Math.round(offAtEntry),
                closest: closest === Infinity ? null : Math.round(closest),
                overLight: overLight });
        };
        if (!st) { done('gone'); return; }
        if (st.mode === 'entering') {
          if (atEntry === null) { atEntry = st.doorOpen; offAtEntry = off(); }
          peak = Math.max(peak, st.doorOpen);
          closest = Math.min(closest, off());
          overLight = s.you.depth > s.doorGfx.depth;
          if (peak > 0.95 && closest < 3) done(st.mode);
          else if (st.modeAge > st.enterFade * 0.75) done(st.mode);
        } else if (atEntry !== null || Date.now() - started > 2500) {
          done(st.mode);
        }
      }, 16);
    });
  });
  check('the door keeps swinging open behind the entering fade',
    throughFade.atEntry < 0.7 && throughFade.peak > 0.95, throughFade);
  // Triggering the doorstep from one side must not end the scene with
  // the figure disappearing into the wall next to the door.
  check('and you step across into the opening rather than into the wall',
    throughFade.offAtEntry > 10 && throughFade.closest < 3, throughFade);
  // ...and in front of the light, not behind it. The doorway is painted
  // over the house and the figure standing in it shares the house's
  // foot, so the two sort on a tie - which the light won, swallowing
  // him whole on the last frame of the scene.
  check('standing in the lit doorway rather than behind the light',
    throughFade.overLight === true, throughFade);

  // That last one walked into the house, so back to the yard.
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(BOOT_MS);

  // Setting off toward the ship must not open it - the notice zone
  // reaches a long way down the path, and the ship is down the path too.
  // Out on the right-hand side of the yard, and deliberately NOT at the
  // ship: the first version of this check stood close enough to board,
  // which froze the door open mid-takeoff and then left the scene in
  // liftoff for every check after it.
  const towardShip = await page.evaluate(() => {
    const d = window.__yardDebug;
    d.moveTo(0.1, 0.85);
    return new Promise(res => setTimeout(() => {
      const s = d.state();
      res({ open: s.doorOpen, mode: s.mode, atShip: s.atShip });
    }, 800));
  });
  check('heading for the ship leaves the door alone',
    towardShip.open < 0.1 && towardShip.mode === 'walk', towardShip);

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
