// The touch controls' hit areas.
//
// Every control here is bigger to the thumb than it is to the eye. That
// is the whole content of this file, and it is worth its own tests for
// one reason: the slop is INVISIBLE. Delete it, halve it, let a parent's
// overflow clip it or let a sibling paint over it, and the game still
// looks exactly right in every screenshot while quietly going back to
// dropping presses. Nothing else in the suite would notice.
//
// So each control is tested three ways - the face still works, a press
// in the slop works, and a press beyond the slop does NOT. The third is
// the one that stops "make it bigger" turning into a control that eats
// the whole screen.
//
// The other half is the constraint that came with the request: improve
// the feel WITHOUT altering the layout or the look. That is testable
// too, and it is - the visible boxes are pinned to their exact sizes, so
// growing the real button instead of its slop fails here.
const harness = require('./harness');

const SETTLE = `
  const scene = window.__headOnDebug.scene, state = scene.state;
  scene.resetGame();
  window.__headOnDebug.skipFormationEntry();
`;

// A real browser press at an absolute point, so the hit-testing under
// test is the browser's own rather than a synthetic dispatch at an
// element - which would bypass the very thing being checked.
async function pressAt(page, x, y, holdMs) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

async function rects(page) {
  return page.evaluate(() => {
    function r(id) {
      const b = document.getElementById(id).getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom,
               w: b.width, h: b.height, cx: b.left + b.width / 2 };
    }
    return { missile: r('missileBtn'), slide: r('zoneSlide'), mid: r('zoneMid'),
             footer: document.querySelector('footer a').getBoundingClientRect().top };
  });
}

// Orbiters in flight is the cleanest read of "the missile button fired":
// one press launches one per loaded gun, and nothing else in a settled
// scene creates them.
const ARM = `
  ${SETTLE}
  window.__headOnDebug.giveOrbs('red', 2);
  scene.syncMissileButton();
`;

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  check('no page errors on load', errors.length === 0, errors);

  // --- the look is unchanged ------------------------------------------------
  // Pinned exactly. The request was explicitly to improve the feel
  // without moving anything, and the obvious wrong fix - make the button
  // bigger - would pass every behaviour check below.
  const box = await rects(page);
  check('the missile button is still exactly 92x38 on screen',
    Math.round(box.missile.w) === 92 && Math.round(box.missile.h) === 38, box.missile);
  check('and both control zones are still 92 tall',
    Math.round(box.slide.h) === 92 && Math.round(box.mid.h) === 92, box);
  check('sitting where they always did, below the board',
    box.slide.top > box.missile.bottom && box.mid.top > box.missile.bottom, box);

  // --- the missile button ---------------------------------------------------
  const face = await page.evaluate(ARM + `state.orbiters.length`);
  check('a fresh arm starts with nothing in flight', face === 0, face);

  const m = (await rects(page)).missile;
  await pressAt(page, m.cx, m.top + m.h / 2);
  check('pressing the button itself fires',
    (await page.evaluate(() => window.__headOnDebug.scene.state.orbiters.length)) > 0);

  // The reported miss: the thumb comes off the fire pad, overshoots, and
  // lands above the button.
  await page.evaluate(ARM);
  await pressAt(page, m.cx, m.top - 20);
  const high = await page.evaluate(() => window.__headOnDebug.scene.state.orbiters.length);
  check('and so does a press 20px ABOVE it, which is the miss being fixed', high > 0, { high });

  await page.evaluate(ARM);
  await pressAt(page, m.left - 18, m.top + m.h / 2);
  const left = await page.evaluate(() => window.__headOnDebug.scene.state.orbiters.length);
  check('and one that lands just short of its left edge', left > 0, { left });

  // ...but the slop has an edge. Without this check "extend it" has no
  // stopping point and the corner of the board becomes a fire button.
  await page.evaluate(ARM);
  await pressAt(page, m.cx, m.top - 55);
  const tooHigh = await page.evaluate(() => window.__headOnDebug.scene.state.orbiters.length);
  check('a press well clear of the button still does nothing', tooHigh === 0, { tooHigh });

  // Stowed means stowed: with nothing banked there is no button, and its
  // slop must not be sitting there swallowing taps either.
  const stowed = await page.evaluate(SETTLE + `
    scene.clearPowerup();
    scene.syncMissileButton();
    ({ armed: scene.missileBtnArmed, orbiters: state.orbiters.length });
  `);
  check('with nothing banked the button is stowed', stowed.armed === false, stowed);
  await pressAt(page, m.cx, m.top - 20);
  const stowedAfter = await page.evaluate(() => ({
    orbiters: window.__headOnDebug.scene.state.orbiters.length
  }));
  check('and pressing where its slop would be does nothing at all',
    stowedAfter.orbiters === 0, stowedAfter);

  // --- the fire pad ---------------------------------------------------------
  const mid = (await rects(page)).mid;
  const fired = await page.evaluate(SETTLE + `state.bullets.length`);
  check('a settled scene starts with no bullets in flight', fired === 0, fired);

  await pressAt(page, mid.cx, mid.top + 20, 120);
  check('pressing the fire pad fires',
    (await page.evaluate(() => window.__headOnDebug.scene.state.bullets.length)) > 0);

  await page.evaluate(SETTLE);
  await pressAt(page, mid.cx, mid.top - 14, 120);
  const fireHigh = await page.evaluate(() => window.__headOnDebug.scene.state.bullets.length);
  check('and so does a press above it, in the gap under the board', fireHigh > 0, { fireHigh });

  await page.evaluate(SETTLE);
  await pressAt(page, mid.cx, mid.top - 40, 120);
  const fireTooHigh = await page.evaluate(() => window.__headOnDebug.scene.state.bullets.length);
  check('but not one that lands a long way up the board', fireTooHigh === 0, { fireTooHigh });

  // --- the slide zone -------------------------------------------------------
  // Steering is a press-then-drag, so this one has to hold and move
  // rather than click - and the press that starts it is the one landing
  // in the slop.
  const sl = (await rects(page)).slide;
  const steer = await page.evaluate(SETTLE + `
    new Promise(res => {
      window.__ctlProbe = () => ({ left: state.input.left, right: state.input.right });
      res(window.__ctlProbe());
    });
  `);
  check('the ship starts unsteered', !steer.left && !steer.right, steer);

  await page.mouse.move(sl.cx, sl.top - 14);
  await page.mouse.down();
  await page.mouse.move(sl.cx + 60, sl.top - 14, { steps: 4 });
  const steered = await page.evaluate(() => window.__ctlProbe());
  await page.mouse.up();
  check('a press above the slide zone still grabs the stick, and dragging steers',
    steered.right === true && steered.left === false, steered);

  const released = await page.evaluate(() => window.__ctlProbe());
  check('and letting go stops the ship', !released.left && !released.right, released);

  await page.mouse.move(sl.cx, sl.top - 40);
  await page.mouse.down();
  await page.mouse.move(sl.cx + 60, sl.top - 40, { steps: 4 });
  const notSteered = await page.evaluate(() => window.__ctlProbe());
  await page.mouse.up();
  check('a press well above it does not', !notSteered.left && !notSteered.right, notSteered);

  // The slide zone used to carry overflow:hidden, which also clipped the
  // hit slop and so had to go. That leaves positionThumb()'s own clamp as
  // the ONLY thing keeping the knob inside its track - previously there
  // were two, and losing the second one silently is exactly how a knob
  // ends up sliding out across the fire pad.
  await page.mouse.move(sl.left + 120, sl.top + 46);
  await page.mouse.down();
  await page.mouse.move(sl.left - 150, sl.top + 46, { steps: 8 });
  const dragged = await page.evaluate(() => {
    const z = document.getElementById('zoneSlide').getBoundingClientRect();
    const t = document.getElementById('slideThumb').getBoundingClientRect();
    const a = document.getElementById('slideAnchor').getBoundingClientRect();
    function inside(r) {
      return r.left >= z.left - 0.5 && r.right <= z.right + 0.5 &&
             r.top >= z.top - 0.5 && r.bottom <= z.bottom + 0.5;
    }
    return { thumb: inside(t), anchor: inside(a) };
  });
  await page.mouse.up();
  check('dragging hard past the edge keeps the knob inside its track',
    dragged.thumb && dragged.anchor, dragged);

  // --- the slop stays out of everything else --------------------------------
  // Two ways this goes wrong that a per-control test cannot see: the
  // zones stealing each other's presses across the gutter between them,
  // and the downward slop reaching the footer's link.
  const neighbours = await page.evaluate(() => {
    function at(x, y) {
      const el = document.elementFromPoint(x, y);
      return el ? (el.id || el.tagName.toLowerCase()) : null;
    }
    const slide = document.getElementById('zoneSlide').getBoundingClientRect();
    const mid = document.getElementById('zoneMid').getBoundingClientRect();
    const link = document.querySelector('footer a').getBoundingClientRect();
    const gutterMid = (slide.right + mid.left) / 2;
    return {
      gutterLeftSide: at(gutterMid - 2, mid.top + 40),
      gutterRightSide: at(gutterMid + 2, mid.top + 40),
      onLink: at(link.left + link.width / 2, link.top + link.height / 2),
      belowZones: at(mid.left + mid.width / 2, mid.bottom + 4)
    };
  });
  check('the gutter between the two zones belongs to the nearer one on each side',
    neighbours.gutterLeftSide === 'zoneSlide' && neighbours.gutterRightSide === 'zoneMid',
    neighbours);
  check('and the footer link is still tappable, not buried under the slop',
    neighbours.onLink === 'a', neighbours);
  check('while the strip right below the zones does belong to them',
    neighbours.belowZones === 'zoneMid', neighbours);

  check('no page errors after full run', errors.length === 0, errors);
});
