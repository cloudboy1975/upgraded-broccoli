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
    st.borderX = Math.round(s.scale.width / 2 + st.leftEdgeX * s.depthToHalfWidth(st.depth));
    st.middleX = Math.round(s.scale.width / 2);
    return st;
  });
  check('no page errors on load', errors.length === 0, errors);
  // You get here through the left-hand border, so that is where you
  // come in - not in the middle of the drive and not at some spot of
  // its own. The way in and the way out are the same door, and standing
  // somewhere else on arrival is the thing that tells a player the two
  // screens are not really next to each other.
  check('the drive boots on foot, in at the border you came through',
    start.mode === 'walk' && start.meX < start.middleX &&
    start.meX - start.borderX < 90, start);
  // ...but not ON it. A player who lands a step from the border and
  // looks around is a player who gets sent straight home for it.
  check('and a walk clear of it, not balanced on the edge',
    start.meX - start.borderX > 28 && start.atLeftEdge === false, start);
  check('out in front of the house wall rather than inside it',
    start.meY > start.houseFront.y && start.inBuilding === false, start);
  check('with the garage shut and nothing to see in it',
    start.garageOpen === 0 && start.carVisible === false, start);
  // Standing in the doorway, the doorway says where it goes.
  check('and the way you came in is signposted from where you land',
    typeof start.prompt === 'string' && /back .*to the yard/i.test(start.prompt), start);
  check('and the corner button is still the way out',
    start.buttonVerb === null, start);
  // There is one way onto this screen and it is a cut, so arriving is a
  // cut: black while the page loads, then the scene. Fading up after an
  // instant exit is the transition the instant exit was made to avoid.
  const arrival = await page.evaluate(() => {
    const el = document.getElementById('blackout');
    return { cls: el.className, opacity: getComputedStyle(el).opacity,
             fade: getComputedStyle(el).transitionDuration };
  });
  check('and the scene does not fade up on arrival either',
    arrival.opacity === '0' && arrival.fade === '0s', arrival);

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

  // --- you can get from the door to the garage -----------------------------
  // The thing you came here for is up the drive, and you come in at the
  // far side of the screen from it. Walked rather than asked: out onto
  // the drive, then up it, which is the route a thumb takes - and the
  // test is that it ends at the garage rather than walled in or back in
  // the yard.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1700);
  await page.keyboard.up('ArrowRight').catch(() => {});
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2600);
  await page.keyboard.up('ArrowUp').catch(() => {});
  const upTheDrive = await readState(page);
  check('walking out onto the drive and up it reaches the garage',
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

  // --- the drive is drawn on the drive -------------------------------------
  // The slab has one expansion joint across it, and it used to be drawn
  // centred on the slab's NEAR end at a height where the slab's own
  // centre line is forty pixels away - so it hung out over the lawn on
  // the left and stopped short of the concrete on the right, a stray
  // line floating in the middle of the screen. Checked twice: once
  // against the slab's own corners, and once in pixels, because the
  // first version of this bug passed every state check in this file.
  const joint = await page.evaluate(() => {
    const s = window.__driveDebug.slab();
    const t = (s.jointY - s.topY) / (s.nearY - s.topY);
    return {
      jointLeft: s.jointLeft, jointRight: s.jointRight,
      edgeLeft: s.topLeft + (s.nearLeft - s.topLeft) * t,
      edgeRight: s.topRight + (s.nearRight - s.topRight) * t,
      jointY: s.jointY
    };
  });
  check('the joint across the drive starts and ends on the concrete',
    joint.jointLeft >= joint.edgeLeft && joint.jointRight <= joint.edgeRight, joint);
  check('and reaches most of the way across it, not a scratch in the middle',
    (joint.jointRight - joint.jointLeft) > (joint.edgeRight - joint.edgeLeft) * 0.9, joint);

  // ...and nothing is drawn on the grass beside it. Two patches of lawn
  // at the joint's own height, one just off the concrete and one well
  // clear of it: a line that overshoots lands in the first.
  const lawn = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, sl = d.slab();
    const t = (sl.jointY - sl.topY) / (sl.nearY - sl.topY);
    const edge = sl.topLeft + (sl.nearLeft - sl.topLeft) * t;
    s.firefliesGfx.setVisible(false); // they wander; this is about the line
    s.garageWant = 0; s.garageOpen = 0; // ...and so does the light out of the garage
    function mean(x, y, w, h) {
      return new Promise(res => {
        s.game.renderer.snapshotArea(Math.round(x), Math.round(y), Math.round(w), Math.round(h), img => {
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
    return new Promise(res => {
      setTimeout(async () => {
        const beside = await mean(edge - 24, sl.jointY - 2, 18, 5);
        const further = await mean(edge - 62, sl.jointY - 2, 18, 5);
        s.firefliesGfx.setVisible(true);
        res({ beside: beside, further: further, edge: Math.round(edge) });
      }, 120);
    });
  });
  check('with nothing painted on the lawn beside it',
    Math.abs(lawn.beside - lawn.further) < 2.5, lawn);

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
  // Straight out to the left-hand border, in front of the house. The
  // test is a thumb held left from wherever the player actually lands,
  // because that is the whole requirement: the way home is the
  // direction the yard is in, not a corner to be found.
  await page.goto(ctx.url('driveway.html'));
  await page.waitForTimeout(BOOT_MS);
  const headingOut = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, h = s.houseFront();
    const depthAt = y => (y - s.horizonY()) / (s.scale.height - s.horizonY());
    const wx = (x, depth) => (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    // Beside the house, in front of its front wall: here holding left
    // walks you out, and the hint says so.
    const infront = depthAt(h.y + 50);
    d.moveTo(wx(h.right + 20, infront), infront);
    return new Promise(res => setTimeout(() => {
      const out = d.state();
      // ...and the same distance from the corner but UP the drive,
      // past the house's line, where the house is in the way and
      // holding left gets you nothing. A hint there would be a lie.
      const behind = depthAt(h.y - 80);
      d.moveTo(wx(h.right + 20, behind), behind);
      setTimeout(() => { out.upTheDrive = d.state(); res(out); }, 200);
    }, 300));
  });
  check('walking out to the left says that is the way back',
    typeof headingOut.prompt === 'string' && /back .*to the yard/i.test(headingOut.prompt), headingOut);
  check('and you are not out of the scene yet',
    headingOut.atLeftEdge === false && headingOut.mode === 'walk', headingOut);
  check('but it keeps quiet up the drive, where the house is in the way',
    headingOut.upTheDrive.prompt === null &&
    headingOut.upTheDrive.nearLeftEdge === false, headingOut.upTheDrive);

  await page.goto(ctx.url('driveway.html'));
  await page.waitForTimeout(BOOT_MS);
  const startedAt = await readState(page);
  await page.keyboard.down('ArrowLeft');
  const walkedBack = await reachedPage(page, 'yard.html?at=side', 12000);
  await page.keyboard.up('ArrowLeft').catch(() => {});
  check('and holding left from where you arrive walks you home, with nothing in the way',
    walkedBack, { from: { worldX: startedAt.worldX, depth: startedAt.depth }, url: page.url() });
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

  // ...and the hand-off is a CUT. No fade, no walk-off: the player
  // touches the border and is on the other screen, which is the whole
  // point of doing it this way. Sampled hard, because an animated
  // version of this would still arrive - just a beat later and with a
  // mode nobody asked for in between.
  await page.goto(ctx.url('driveway.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.evaluate(() => window.__driveDebug.moveTo(-0.9, 0.7));
  await page.waitForTimeout(120);
  const modes = [];
  const sampler = setInterval(() => {
    page.evaluate(() => window.__driveDebug.state().mode).then(m => modes.push(m), () => {});
  }, 25);
  const began = Date.now();
  await page.keyboard.down('ArrowLeft');
  const snapped = await reachedPage(page, 'yard.html?at=side', 9000);
  const tookMs = Date.now() - began;
  clearInterval(sampler);
  await page.keyboard.up('ArrowLeft').catch(() => {});
  // 'gone' is the one frame between touching the border and the page
  // going; what must never appear is a sequence being played.
  check('and crossing the border cuts straight there, with no leaving sequence',
    snapped && modes.every(m => m === 'walk' || m === 'gone'),
    { modes: [...new Set(modes)], tookMs: tookMs });

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

  // --- the garage stays how you left it ------------------------------------
  // The screens are separate pages, so a door that is open when you
  // walk out is a door that has to be remembered somewhere to still be
  // open when you walk back in. Walked rather than asked: out to the
  // yard, round the house, and back in.
  await page.goto(ctx.url('driveway.html'));
  await page.evaluate(() => window.__driveDebug.forgetWorld());
  await page.reload();
  await page.waitForTimeout(BOOT_MS);
  const firstVisit = await readState(page);
  check('a first visit finds the garage shut',
    firstVisit.garageOpen === 0 && firstVisit.garageWant === 0, firstVisit);

  await standAtTheGarage();
  await page.click('#backBtn');
  await page.waitForTimeout(2200);
  const opened = await readState(page);
  check('and pressing it is remembered, not just drawn',
    opened.garageOpen > 0.9 && (await page.evaluate(() => window.__driveDebug.world())).garageOpen === true,
    opened);

  await page.evaluate(() => window.__driveDebug.moveTo(-0.98, 0.72));
  const leftIt = await reachedPage(page, 'yard.html?at=side', 9000);
  check('walking out of the scene with it open', leftIt, page.url());
  if (leftIt) {
    await page.waitForTimeout(BOOT_MS);
    await page.evaluate(() => {
      const d = window.__yardDebug, s = d.scene, f = s.houseFront();
      const depth = (f.y - 20 - s.horizonY()) / (s.scale.height - s.horizonY());
      d.moveTo((f.right + 18 - s.scale.width / 2) / s.depthToHalfWidth(depth), depth);
    });
    const cameBack = await reachedPage(page, 'driveway.html', 9000);
    check('and straight back in again', cameBack, page.url());
    if (cameBack) {
      // Read early, on the first frames: the door must already BE open,
      // not roll open while you watch. It has been open the whole time.
      await page.waitForTimeout(260);
      const early = await readState(page);
      check('finds the garage still open, already open rather than opening',
        early.garageOpen > 0.9 && early.garageWant === 1 && early.carVisible === true, early);

      // ...and a reload is the same sitting, so it holds there too.
      await page.reload();
      await page.waitForTimeout(BOOT_MS);
      const reloaded = await readState(page);
      check('and holds across a reload', reloaded.garageOpen > 0.9, reloaded);

      // The other way round, so this is a memory and not a default.
      await standAtTheGarage();
      await page.click('#backBtn');
      await page.waitForTimeout(2200);
      await page.reload();
      await page.waitForTimeout(BOOT_MS);
      const shutAgain = await readState(page);
      check('shutting it is remembered the same way',
        shutAgain.garageOpen === 0 && shutAgain.carVisible === false, shutAgain);
    }
  }

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'driveway.html' });
