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

  const start = await readState(page);
  check('no page errors on load', errors.length === 0, errors);
  check('the drive boots on foot, round the side of the house',
    start.mode === 'walk' && start.worldX > 0.5, start);
  check('with the garage shut and nothing to see in it',
    start.garageOpen === 0 && start.carVisible === false, start);
  check('and no prompt until you are standing at something',
    start.prompt === null, start);

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
      garageOnStick: overlaps(b.garage, stick), houseOnBack: overlaps(b.house, back)
    };
  });
  check('you do not start standing under the thumbstick', !layout.youOnStick, layout);
  check('nor under the button that takes you back', !layout.youOnBack, layout);
  check('and neither building is parked behind a control',
    !layout.garageOnStick && !layout.houseOnBack, layout);

  // --- the garage ----------------------------------------------------------
  // The door is the whole scene: it is the only thing here that
  // responds, and the car exists to be revealed by it.
  const approach = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, r = s.garageRect();
    const onDrive = (r.bottom - s.horizonY()) / (s.scale.height - s.horizonY()) + 0.22;
    d.moveTo((r.cx - s.scale.width / 2) / s.depthToHalfWidth(onDrive), onDrive);
    return new Promise(res => setTimeout(() => res(d.state()), 2600));
  });
  check('walking up the drive rolls the garage door up',
    approach.garageOpen > 0.9 && approach.nearGarage === true, approach);
  check('and the car is only there once the door is', approach.carVisible === true, approach);

  const away = await settle(page, 0.8, 0.9, 2600);
  check('it rolls back down when you walk away',
    away.garageOpen < 0.1 && away.carVisible === false, away);

  // Standing in the opening, which is where the car is.
  const atCar = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, r = s.garageRect();
    const sill = (r.bottom - s.horizonY()) / (s.scale.height - s.horizonY()) + 0.05;
    d.moveTo((r.cx - s.scale.width / 2) / s.depthToHalfWidth(sill), sill);
    return new Promise(res => setTimeout(() => res(d.state()), 2400));
  });
  check('standing in the opening says what is in there',
    atCar.atCar === true && typeof atCar.prompt === 'string' && atCar.prompt.length > 5, atCar);

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
  // wall was not solid when it was.
  const walls = await page.evaluate(() => {
    const d = window.__driveDebug, s = d.scene, st = d.state();
    const wx = (x, depth) => (x - s.scale.width / 2) / s.depthToHalfWidth(depth);
    const r = s.garageRect();
    const back = 0.18; // well up the drive, past both buildings' feet
    // A pace INSIDE the opening - behind the wall line, where the brick
    // either side of it is solid. In front of the threshold everything
    // is free whether the doorway is cut out or not, which is what the
    // first version of this probe measured and why it proved nothing.
    const depthAt = y => (y - s.horizonY()) / (s.scale.height - s.horizonY());
    const doorDepth = depthAt(r.bottom - 15);
    const inGarageWall = (st.garageFront.left + r.left) / 2;   // brick, left of the opening
    const inHouseWall = (st.houseFront.left + st.houseFront.right) / 2;
    return {
      throughTheGarage: s.insideBuilding(wx(inGarageWall, back), back),
      throughTheHouse: s.insideBuilding(wx(inHouseWall, back), back),
      inTheDoorway: s.insideBuilding(wx(r.cx, doorDepth), doorDepth),
      besideTheDoorway: s.insideBuilding(wx(inGarageWall, doorDepth), doorDepth),
      outOnTheDrive: s.insideBuilding(wx(r.cx, 0.8), 0.8),
      probes: { inGarageWall: Math.round(inGarageWall), inHouseWall: Math.round(inHouseWall) }
    };
  });
  check('the garage wall is solid', walls.throughTheGarage === true, walls);
  check('and so is the house beside it', walls.throughTheHouse === true, walls);
  check('but the doorway is somewhere you can stand',
    walls.inTheDoorway === false && walls.besideTheDoorway === true, walls);
  check('and the drive in front of it is free', walls.outOnTheDrive === false, walls);

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

  // --- the way back --------------------------------------------------------
  await settle(page, 0.6, 0.8, 400);
  await page.keyboard.down('ArrowRight');
  const walkedBack = await reachedPage(page, 'yard.html?at=side', 9000);
  await page.keyboard.up('ArrowRight').catch(() => {});
  check('walking off the right-hand side goes back round the corner', walkedBack, page.url());
  const landed = await page.evaluate(() => {
    const s = window.__yardDebug.state();
    return { worldX: +s.worldX.toFixed(2), depth: +s.depth.toFixed(2), mode: s.mode };
  });
  check('landing at the side of the house, not in the middle of the lawn',
    landed.worldX < -0.7, landed);
  check('and far enough in not to bounce straight back', landed.mode === 'walk', landed);

  // The button and the key do the same thing.
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
