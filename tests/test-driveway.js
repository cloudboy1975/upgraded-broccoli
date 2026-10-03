// The driveway - round the side of the house from the yard.
//
// This is the first screen built for the game this is turning into
// rather than for the shooter it started as: somewhere to walk, a thing
// to find, and no score anywhere. So what is worth asserting is what
// makes a place a place - that it can be walked, that the buildings are
// buildings rather than paint, that the one thing in it that moves
// moves when you approach it, and that you can get back out.
//
// The checks that will outlive the art are the mechanical ones: the
// garage door's state, the solidity, the two exits. The drawing is
// checked once, with pixels, because a garage that opens on an empty
// rectangle passes every other check in this file.
const harness = require('./harness');

const BOOT_MS = 900;

async function reachedPage(page, name, timeout) {
  try {
    await page.waitForURL('**/' + name, { timeout: timeout });
    return true;
  } catch (e) {
    return false;
  }
}

// Read defensively: a scene that walks you off the screen leaves the
// context dead, and that should fail a named check rather than kill the
// file.
async function readState(page) {
  try {
    return await page.evaluate(() => window.__driveDebug.state());
  } catch (e) {
    return { gone: true, why: String(e).slice(0, 120) };
  }
}

const moveTo = (page, worldX, depth) =>
  page.evaluate(p => window.__driveDebug.moveTo(p[0], p[1]), [worldX, depth]);

async function settle(page, worldX, depth, ms) {
  await moveTo(page, worldX, depth);
  await page.waitForTimeout(ms === undefined ? 1800 : ms);
  return readState(page);
}

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  await page.waitForTimeout(BOOT_MS);

  const start = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, st = d.state();
    const me = s.placeAt(st.worldX, st.depth);
    st.meX = Math.round(me.x);
    st.meY = Math.round(me.y);
    return st;
  });
  check('no page errors on load', errors.length === 0, errors);
  // You get here by walking round the back of the house in the yard, so
  // you come out beside the house here - at its corner, in front of its
  // front wall. Two screens that hand the player over in different
  // poses are two screens that do not join up.
  check('the drive boots on foot, at the corner of the house you came round',
    start.mode === 'walk' && start.meX > start.houseFront.right &&
    start.meX < start.houseFront.right + 90, start);
  check('out in front of its wall rather than inside it',
    start.meY > start.houseFront.y && start.inBuilding === false, start);
  check('with the garage shut and nothing to see in it',
    start.garageOpen === 0 && start.carVisible === false, start);
  check('and no prompt until you are standing at something',
    start.prompt === null, start);
  check('and the corner button is still the way out',
    start.buttonVerb === null, start);

  // --- nothing stands under the controls -----------------------------------
  // The yard shipped with the player under the thumbstick and the ship
  // behind the Fly button, twice. It is a layout fact with no other
  // guard on it: everything still WORKS, it is just unusable with a
  // hand on the screen.
  const layout = await page.evaluate(() => {
    const b = window.__driveDebug.bounds();
    function rect(id) {
      const r = document.getElementById(id).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    function overlaps(a, c) {
      return a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    }
    const stick = rect('stickZone'), back = rect('backBtn');
    return {
      youOnStick: overlaps(b.you, stick), youOnBack: overlaps(b.you, back),
      garageOnStick: overlaps(b.garage, stick), garageOnBack: overlaps(b.garage, back),
      houseOnStick: overlaps(b.house, stick), houseOnBack: overlaps(b.house, back)
    };
  });
  check('you do not start standing under the thumbstick', !layout.youOnStick, layout);
  check('nor under the button that takes you back', !layout.youOnBack, layout);
  // Asked of both controls rather than of the one each building happens
  // to be near: the layout has been mirrored once already, and a check
  // that only looks at the old side stops checking anything.
  check('and neither building is parked behind a control',
    !layout.garageOnStick && !layout.garageOnBack &&
    !layout.houseOnStick && !layout.houseOnBack, layout);

  // --- the drive is not the way out ----------------------------------------
  // The way out of this screen is crossing the line of the house's
  // front wall, and the drive runs UP past that same line to the
  // garage. So the way out has a right-hand edge, and if it ever stops
  // having one, walking to the door you came here for sends you home
  // instead. Walked rather than asked, because that is how it would
  // happen: a thumb held up.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2600);
  await page.keyboard.up('ArrowUp').catch(() => {});
  const upTheDrive = await readState(page);
  check('walking straight up the drive reaches the garage rather than leaving',
    upTheDrive.gone !== true && upTheDrive.mode === 'walk' &&
    upTheDrive.nearGarage === true, upTheDrive);

  // --- the garage ----------------------------------------------------------
  // The door is the whole scene: it is the only thing here that
  // responds, and the car exists to be revealed by it. Unlike every
  // other door in this chapter it is a SWITCH, not a motion sensor -
  // you have to press for it, and what you pressed for stays pressed.
  const standAtTheGarage = () => page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, r = s.garageRect();
    const onDrive = (r.bottom - s.horizonY()) / (s.scale.height - s.horizonY()) + 0.22;
    d.moveTo((r.cx - s.scale.width / 2) / s.depthToHalfWidth(onDrive), onDrive);
    return new Promise(res => setTimeout(() => res(d.state()), 2600));
  });
  const approach = await standAtTheGarage();
  check('walking up the drive does not open the garage by itself',
    approach.garageOpen === 0 && approach.carVisible === false, approach);
  check('but it does put the opener in the corner button',
    approach.nearGarage === true && approach.buttonVerb === 'Open', approach);
  check('and says so on screen',
    typeof approach.prompt === 'string' && /garage door/i.test(approach.prompt), approach);
  check('with the button itself relabelled, not just the state',
    (await page.textContent('#backLabel')).trim() === 'Open' &&
    await page.evaluate(() => document.getElementById('backBtn').classList.contains('acts')),
    await page.textContent('#backLabel'));

  await page.click('#backBtn');
  await page.waitForTimeout(2200);
  const pressed = await readState(page);
  check('pressing it rolls the door up',
    pressed.garageOpen > 0.9 && pressed.garageWant === 1, pressed);
  check('and the car is only there once the door is', pressed.carVisible === true, pressed);
  check('and the same button now offers to shut it again',
    pressed.buttonVerb === 'Close', pressed);
  check('without leaving the scene, which is what that button used to do',
    page.url().indexOf('driveway.html') !== -1, page.url());

  // A door you opened stays open. This is the difference between a
  // switch and a motion sensor, and it is the whole point of the press.
  const away = await settle(page, -0.5, 0.9, 2000);
  check('and it stays open when you walk away from it',
    away.garageOpen > 0.9 && away.carVisible === true, away);
  check('with the button back to being the way out', away.buttonVerb === null, away);

  // Standing in the opening, which is where the car is.
  const atCar = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, r = s.garageRect();
    const sill = (r.bottom - s.horizonY()) / (s.scale.height - s.horizonY()) + 0.05;
    d.moveTo((r.cx - s.scale.width / 2) / s.depthToHalfWidth(sill), sill);
    return new Promise(res => setTimeout(() => res(d.state()), 2400));
  });
  check('standing in the opening says what is in there',
    atCar.atCar === true && typeof atCar.prompt === 'string' && atCar.prompt.length > 5, atCar);

  // ...and pressing again shuts it, from the same button.
  await standAtTheGarage();
  await page.click('#backBtn');
  await page.waitForTimeout(2200);
  const shut = await readState(page);
  check('pressing again rolls it back down',
    shut.garageOpen < 0.1 && shut.garageWant === 0 && shut.carVisible === false, shut);

  // The key does what the button does, for anyone at a desk.
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1800);
  const byKey = await readState(page);
  check('and the action key works it too', byKey.garageOpen > 0.9, byKey);
  // Left open on purpose: the pixel check below is about what is inside.

  // ...and it is really drawn. Everything above would pass with a lit
  // rectangle and no car in it.
  // ...and it is really drawn. Everything above would pass with a lit
  // rectangle and no car in it.
  //
  // The control is the same lit opening with the car MOVED ASIDE rather
  // than hidden: renderGarage() sets the car's visibility from the
  // door's own state every frame, so hiding it lasts exactly one frame
  // and the first version of this check compared a picture with itself.
  const snapCar = () => page.evaluate(() => new Promise(res => {
    const s = window.__driveDebug.scene, r = s.garageRect();
    const box = { x: r.left + 2, y: r.bottom - (r.bottom - r.top) * 0.55,
                  w: r.width - 4, h: (r.bottom - r.top) * 0.5 };
    s.game.renderer.snapshotArea(Math.round(box.x), Math.round(box.y),
      Math.round(box.w), Math.round(box.h), img => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let sum = 0, bright = 0;
        for (let i = 0; i < px.length; i += 4) {
          const v = (px[i] + px[i + 1] + px[i + 2]) / 3;
          sum += v;
          if (v > 150) bright++;  // chrome, headlights, a pale body
        }
        res({ mean: +(sum / (px.length / 4)).toFixed(1), bright: bright });
      });
  }));
  const withCar = await snapCar();
  await page.evaluate(() => { window.__driveDebug.scene.carSprite.x -= 4000; });
  await page.waitForTimeout(320);
  const without = await snapCar();
  await page.evaluate(() => { window.__driveDebug.scene.carSprite.x += 4000; });
  check('and there is a car in there, not just a lit rectangle',
    withCar.bright > without.bright + 40, { withCar, without });

  // --- the buildings are buildings -----------------------------------------
  // Asked of the buildings' own fronts rather than of points picked by
  // eye: the first version of this probed twenty pixels left of the
  // opening, which is outside the garage, and happily reported that a
  // wall was not solid when it was. Each probe names the depth it is
  // asking about in the building's own terms, because both buildings
  // have moved more than once.
  const walls = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, st = d.state();
    const wx = (x, depth) => (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    const depthAt = y => (y - s.horizonY()) / (s.scale.height - s.horizonY());
    const r = s.garageRect();
    const inGarageWall = (st.garageFront.left + r.left) / 2;   // brick, left of the opening
    const inHouseWall = (st.houseFront.left + st.houseFront.right) / 2;
    // A pace INSIDE each building - behind its wall line, where the
    // brick is. In front of the threshold everything is free whether
    // the doorway is cut out or not, which is what the first version of
    // this probe measured and why it proved nothing.
    const inGarage = depthAt(r.bottom - 12);
    const inHouse = depthAt(st.houseFront.y - 16);
    s.garageOpen = 0; // asked of a SHUT garage, whatever the last check left it as
    return {
      throughTheGarage: s.insideBuilding(wx(inGarageWall, inGarage), inGarage),
      throughTheHouse: s.insideBuilding(wx(inHouseWall, inHouse), inHouse),
      shutDoorway: s.insideBuilding(wx(r.cx, inGarage), inGarage),
      besideTheDoorway: s.insideBuilding(wx(inGarageWall, inGarage), inGarage),
      outOnTheDrive: s.insideBuilding(wx(r.cx, 0.8), 0.8),
      probes: { inGarageWall: Math.round(inGarageWall), inHouseWall: Math.round(inHouseWall) }
    };
  });
  check('the garage wall is solid', walls.throughTheGarage === true, walls);
  check('and so is the house beside it', walls.throughTheHouse === true, walls);
  // A shut door is a wall. With the doorway cut out whatever the door
  // was doing, walking up the drive walked you straight through the
  // garage and out into the field behind it.
  check('and a shut door is a wall too, not a way through',
    walls.shutDoorway === true && walls.besideTheDoorway === true, walls);
  check('and the drive in front of it all is free', walls.outOnTheDrive === false, walls);

  // ...and with the door up, the opening is a room you can stand in -
  // which is where the car is, and the one thing the pixel check above
  // needed you to be able to do.
  const openDoorway = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene;
    const r = s.garageRect();
    const depthAt = y => (y - s.horizonY()) / (s.scale.height - s.horizonY());
    const inGarage = depthAt(r.bottom - 12);
    const wx = (x, depth) => (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    const deeper = depthAt(r.bottom - 30); // past the pocket, into the building
    s.garageOpen = 1;
    const open = s.insideBuilding(wx(r.cx, inGarage), inGarage);
    const back = s.insideBuilding(wx(r.cx, deeper), deeper);
    s.garageOpen = s.garageWant; // back to whatever the switch says
    return { open: open, back: back };
  });
  check('with the door up it is a room you can stand in', openDoorway.open === false, openDoorway);
  // A room, not a corridor: the far end of an open garage is still a
  // wall, or walking up the drive walks you out through the back of it.
  check('but only a pocket - the back of it is still a wall',
    openDoorway.back === true, openDoorway);

  // --- something is going on out there -------------------------------------
  // Deliberately small, so the check is that it MOVES and that it stays
  // in the sky - a static dot is a dead pixel and one that wanders below
  // the ridges is a firefly.
  const sky = await page.evaluate(() => {
    const d = window.__driveDebug;
    const first = d.state().ufos;
    return new Promise(res => setTimeout(() => {
      const scene = d.scene;
      res({ first: first, later: d.state().ufos, horizonFrac: scene.horizonY() / scene.scale.height });
    }, 1200));
  });
  check('there is something in the sky', sky.first.length >= 2, sky);
  check('and it is moving', sky.first.some((u, i) => Math.abs(u.x - sky.later[i].x) > 0.002), sky);
  check('and it stays up there, above the ridges',
    sky.later.every(u => u.y > 0 && u.y < 0.8), sky);

  // ...and now and then one of them does something. Both set pieces are
  // started by hand rather than waited for: they are on ten-second
  // random countdowns, and a test that waits out a countdown is a test
  // that fails on a slow afternoon.
  const loop = await page.evaluate(() => {
    const d = window.__driveDebug;
    const i = d.loopNow(0);
    const base = d.state().ufos[i];
    const samples = [];
    return new Promise(res => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const u = d.state().ufos[i];
        samples.push({ x: u.drawX, y: u.drawY, looping: u.looping });
        if (Date.now() - t0 > 2600) {
          clearInterval(iv);
          res({ base: base, samples: samples, horizon: d.scene.horizonY() });
        }
      }, 80);
    });
  });
  const ys = loop.samples.map(s => s.y), xs = loop.samples.map(s => s.x);
  check('one of them rolls through a loop',
    Math.max(...ys) - Math.min(...ys) > 12 && Math.max(...xs) - Math.min(...xs) > 12,
    { rise: Math.round(Math.max(...ys) - Math.min(...ys)), swing: Math.round(Math.max(...xs) - Math.min(...xs)) });
  check('and comes out of it rather than orbiting forever',
    loop.samples[loop.samples.length - 1].looping === false, loop.samples.slice(-3));
  check('and does the whole thing in the sky',
    ys.every(y => y > 0 && y < loop.horizon), { min: Math.min(...ys), max: Math.max(...ys), horizon: Math.round(loop.horizon) });

  const burst = await page.evaluate(() => {
    const d = window.__driveDebug;
    const i = d.shootNow(1);
    const seen = [];
    return new Promise(res => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const st = d.state();
        if (st.shots.length) seen.push(st.shots[0]);
        if (Date.now() - t0 > 1600) {
          clearInterval(iv);
          res({ seen: seen, firingAfter: d.state().ufos[i].firing, horizon: d.scene.horizonY() });
        }
      }, 40);
    });
  });
  check('and one of them fires the odd laser', burst.seen.length > 0, burst.seen.length);
  check('which is a bolt aimed down at the ground, not a line across the sky',
    burst.seen.every(s => s.y2 > s.y1 && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 6), burst.seen[0]);
  check('fired from up there rather than from the driveway',
    burst.seen.every(s => s.y1 > 0 && s.y1 < burst.horizon), { first: burst.seen[0], horizon: Math.round(burst.horizon) });
  check('and it is over in a second or two, not a beam left on',
    burst.firingAfter === false, burst.firingAfter);

  // --- the way back --------------------------------------------------------
  // Round the house, the same move that brought you here - not off an
  // edge. The two screens have to agree about which way round the house
  // you are walking, or the map folds in half.
  await page.goto(ctx.url('driveway.html'));
  await page.waitForTimeout(BOOT_MS);
  const gapHere = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, st = d.state();
    // At the house's corner, a stride short of its front line - which is
    // where the player is when the hint has to be doing its job.
    const depth = (st.houseFront.y + 40 - s.horizonY()) / (s.scale.height - s.horizonY());
    const worldX = (st.houseFront.right + 14 - s.scale.width / 2) / s.depthToHalfWidth(depth);
    d.moveTo(worldX, depth);
    return new Promise(res => setTimeout(() => {
      const now = d.state();
      now.gapWorldX = worldX;
      now.gapDepth = depth;
      res(now);
    }, 300));
  });
  check('standing at the side of the house says the way back is round it',
    typeof gapHere.prompt === 'string' && /back to the yard/i.test(gapHere.prompt), gapHere);
  check('and you have not gone round it yet', gapHere.pastTheHouse === false, gapHere);

  // Walked STRAIGHT up from fourteen pixels past the corner, with no
  // sideways help. Walking up-and-left crosses a corridor of any width
  // on the way past, so it proves the way out exists but not that it is
  // wide enough to walk: a four-pixel version of this passed that way.
  await page.evaluate(p => window.__driveDebug.moveTo(p[0], p[1]), [gapHere.gapWorldX, gapHere.gapDepth]);
  await page.waitForTimeout(140);
  await page.keyboard.down('ArrowUp');
  const walkedBack = await reachedPage(page, 'yard.html?at=side', 9000);
  await page.keyboard.up('ArrowUp').catch(() => {});
  check('walking straight up past the corner of the house goes home', walkedBack, page.url());
  if (!walkedBack) return; // everything below reads the yard's own scene
  const landed = await page.evaluate(() => {
    const d = window.__yardDebug, s = d.scene, st = d.state();
    const me = s.placeAt(st.worldX, st.depth);
    return { worldX: +st.worldX.toFixed(2), depth: +st.depth.toFixed(2), mode: st.mode,
             atShip: st.atShip, past: st.pastTheHouse,
             meX: Math.round(me.x), houseRight: Math.round(st.houseFront.right) };
  });
  check('landing at the side of the house, not in the middle of the lawn',
    landed.meX > landed.houseRight && landed.meX < landed.houseRight + 90, landed);
  check('and far enough out not to go straight back round',
    landed.mode === 'walk' && landed.past === false, landed);
  check('and beside the ship rather than inside it', landed.atShip === false, landed);

  // ...and here too, the last thing you see is him going behind the
  // house rather than fading out beside it.
  await page.goto(ctx.url('driveway.html'));
  await page.waitForTimeout(BOOT_MS);
  const walkOff = await page.evaluate(() => new Promise(res => {
    const d = window.__driveDebug, s = d.scene, frames = [];
    const h = s.houseFront();
    const depth = (h.y - 12 - s.horizonY()) / (s.scale.height - s.horizonY());
    d.moveTo((h.right + 6 - s.scale.width / 2) / s.depthToHalfWidth(depth), depth);
    s.leaveForYard();
    const iv = setInterval(() => {
      frames.push({
        mode: s.mode, x: Math.round(s.you.x),
        behind: s.you.x > h.left && s.you.x < h.right && s.you.depth < s.houseSprite.depth
      });
      if (frames.length >= 7) { clearInterval(iv); res(frames); }
    }, 50);
  }));
  check('and he walks on behind the house while the screen fades',
    walkOff.every(f => f.mode === 'leaving') &&
    walkOff[walkOff.length - 1].x < walkOff[0].x - 8 &&
    walkOff[walkOff.length - 1].behind === true, walkOff);

  // The button and the key do the same thing - away from the garage,
  // where the button is still the way out.
  await page.goto(ctx.url('driveway.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.click('#backBtn');
  check('the Back button goes round the corner too',
    await reachedPage(page, 'yard.html?at=side', 9000), page.url());

  await page.goto(ctx.url('driveway.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.keyboard.press('Escape');
  check('and so does Escape', await reachedPage(page, 'yard.html?at=side', 9000), page.url());

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'driveway.html' });
