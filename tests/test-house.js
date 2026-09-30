// Inside the house - chapter 1's interior.
//
// The room itself is mostly a picture, and a picture is not worth
// asserting about. What IS worth asserting is everything that decides
// whether the picture is a place you can be in:
//
//   - that the two objects the chapter is being built around are
//     reachable at all, and reachable SEPARATELY (a reach zone loose
//     enough to be usable is very easily loose enough for the TV and
//     the desk to claim each other)
//   - that the way out works, and that nothing else does it by accident
//   - that the furniture is sized against the FIGURE rather than against
//     the canvas, which is the difference between a room and a doll's
//     house and is invisible in any single screenshot
//   - that nothing stands under the thumb controls
//
// The TV and the computer are placeholders. That they SAY so is tested
// too, because a prominent object that ignores you reads as broken, and
// the whole point of putting them in now is to promise what is coming.
const harness = require('./harness');

const BOOT_MS = 700;

async function reachedPage(page, name, timeout) {
  try {
    await page.waitForURL('**/' + name, { timeout: timeout });
    return true;
  } catch (e) {
    return false;
  }
}

// Stand in front of a prop, at the depth a player would naturally stop
// at rather than on top of it.
// The boot reads have to survive the page NAVIGATING AWAY underneath
// them. That is not hypothetical: a room that spawns you on the front
// door leaves immediately, every later evaluate hits a dead context,
// and the file dies with a test error instead of failing the one check
// that was there to catch exactly that. The sentinel makes it a FAIL.
async function readState(page) {
  try {
    return await page.evaluate(() => window.__houseDebug.state());
  } catch (e) {
    return { gone: true, why: String(e).slice(0, 120) };
  }
}

async function standAt(page, key, depthOffset) {
  await page.evaluate(function (args) {
    var d = window.__houseDebug, p = d.props[args.key];
    d.moveTo(p.worldX, p.depth + args.offset);
  }, { key: key, offset: depthOffset === undefined ? 0.18 : depthOffset });
  await page.waitForTimeout(220);
  return page.evaluate(() => window.__houseDebug.state());
}

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  await page.waitForTimeout(BOOT_MS);

  check('no page errors on load', errors.length === 0, errors);

  const start = await readState(page);
  check('the room boots with you standing in it', start.mode === 'walk', start);
  // Asserted as an explicit false, not as "not true" - a room that has
  // already left takes its state object with it, and undefined would
  // sail through a negation.
  check('away from the door, so you do not walk straight back out',
    start.atDoor === false, start);
  check('and not already at anything',
    start.atTv === false && start.atDesk === false && start.prompt === null, start);

  // --- the two objects the chapter is being built around ------------------
  const atTv = await standAt(page, 'tv');
  check('standing in front of the TV registers', atTv.atTv, atTv);
  check('and it says what it is going to be',
    typeof atTv.prompt === 'string' && atTv.prompt.length > 0, atTv);
  check('without the desk claiming the same spot', !atTv.atDesk, atTv);

  const atDesk = await standAt(page, 'desk');
  check('standing in front of the computer registers', atDesk.atDesk, atDesk);
  check('and it says what it is going to be too',
    typeof atDesk.prompt === 'string' && atDesk.prompt.length > 0, atDesk);
  check('and the two do not describe each other',
    atDesk.prompt !== atTv.prompt && !atDesk.atTv, { atDesk, atTv });

  // The reach zones are deliberately generous - you stand in FRONT of
  // furniture - and generous is one step from "the whole room". The
  // middle of the floor must belong to nothing.
  const middle = await page.evaluate(() => {
    window.__houseDebug.moveTo(0.06, 0.70);
    return new Promise(res => setTimeout(() => res(window.__houseDebug.state()), 220));
  });
  check('the middle of the room is not standing at anything',
    !middle.atTv && !middle.atDesk && middle.prompt === null, middle);

  const farSide = await page.evaluate(() => {
    window.__houseDebug.moveTo(-0.95, 0.9);
    return new Promise(res => setTimeout(() => res(window.__houseDebug.state()), 220));
  });
  check('nor is the far corner', !farSide.atTv && !farSide.atDesk, farSide);

  // A prompt that sticks after you have walked off reads as a stuck label.
  check('and the prompt clears when you walk away', farSide.prompt === null, farSide);

  // --- the way out ---------------------------------------------------------
  // Walking into the front door leaves, with no button, the same rule as
  // walking into the ship outside.
  const beforeLeave = await page.evaluate(() => window.__houseDebug.state());
  check('nothing has left yet', beforeLeave.mode === 'walk', beforeLeave);

  await page.evaluate(() => { const d = window.__houseDebug; d.moveTo(d.props.door.worldX, 0.08); });
  await page.waitForTimeout(220);
  const leaving = await page.evaluate(() => window.__houseDebug.state());
  check('walking into the front door leaves', leaving.mode === 'leaving', leaving);
  const uiGone = await page.evaluate(() => ({
    controls: document.getElementById('controlBar').classList.contains('gone')
  }));
  check('and the controls get out of the way while it fades', uiGone.controls, uiGone);
  check('landing back in the yard', await reachedPage(page, 'yard.html', 6000), page.url());

  // The Out button is the same escape hatch the yard's Fly button is.
  await page.goto(ctx.url('house.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.click('#outBtn');
  check('the Out button leaves from anywhere', await reachedPage(page, 'yard.html', 6000), page.url());

  await page.goto(ctx.url('house.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.keyboard.press('Escape');
  check('and so does Escape', await reachedPage(page, 'yard.html', 6000), page.url());

  // --- the room is a room --------------------------------------------------
  await page.goto(ctx.url('house.html'));
  await page.waitForTimeout(BOOT_MS);

  // Sized against the FIGURE, not the canvas. Every one of these was
  // wrong on the first pass - the sofa back stood taller than the person
  // walking past it - and nothing about a screenshot makes that obvious
  // until you put a number on it. Ranges rather than exact values,
  // because the framing is meant to be retuned and these are the
  // relationships that must survive it.
  const scale = await page.evaluate(() => {
    const b = window.__houseDebug.bounds();
    const h = k => b[k].bottom - b[k].top;
    const person = h('you');
    const out = { person: Math.round(person) };
    ['door', 'shelf', 'desk', 'tv', 'lamp', 'plant', 'sofa'].forEach(k => {
      out[k] = +(h(k) / person).toFixed(2);
    });
    return out;
  });
  check('the figure is drawn big enough to be a person in a room, not a speck',
    scale.person > 70, scale);
  check('nothing in the room towers over them',
    ['door', 'shelf', 'desk', 'tv', 'lamp', 'plant', 'sofa'].every(k => scale[k] < 1.1), scale);
  check('the sofa back comes up to about the waist, as a sofa does',
    scale.sofa > 0.3 && scale.sofa < 0.65, scale);
  check('the plant is a houseplant, not a tree', scale.plant < 0.6, scale);
  check('and the door is the tallest thing against the wall',
    scale.door > scale.tv && scale.door > scale.desk, scale);

  // --- the door is IN the wall ---------------------------------------------
  // It was not: it stood a little way out on the floorboards, which on a
  // flat trapezoid reads as a door slab propped up in the middle of the
  // room. Furniture stands out in front of the wall on purpose - that is
  // what makes it furniture - but a door is part of the wall, and the
  // only thing on screen saying so is where its foot lands. Asserted
  // against the junction itself rather than a pixel value, so retuning
  // the framing moves both together.
  const junction = await page.evaluate(() => {
    const b = window.__houseDebug.bounds();
    return { floorY: +b.floorY.toFixed(1), doorBottom: +b.door.bottom.toFixed(1) };
  });
  check('the front door stands in the wall, not out on the floor',
    Math.abs(junction.doorBottom - junction.floorY) <= 2, junction);

  // Nothing may stand under the thumb controls - the same layout trap
  // the yard had, and the same standing check for it.
  const layout = await page.evaluate(() => {
    const b = window.__houseDebug.bounds();
    function rect(id) {
      const r = document.getElementById(id).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    function overlaps(a, c) {
      return a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    }
    const stick = rect('stickZone'), out = rect('outBtn');
    return {
      youOnStick: overlaps(b.you, stick),
      youOnOut: overlaps(b.you, out),
      sofaOnStick: overlaps(b.sofa, stick)
    };
  });
  check('you do not start standing under the thumbstick', !layout.youOnStick, layout);
  check('nor under the Out button', !layout.youOnOut, layout);
  check('and the furniture stays clear of them too', !layout.sofaOnStick, layout);

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'house.html' });
