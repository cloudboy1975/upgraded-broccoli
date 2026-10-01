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

// Put the figure somewhere and hold a direction, the way a player
// does - teleporting with moveTo() would walk straight through the
// furniture these checks are about, because nothing is ever asked to
// move INTO it. Reports where they ended up and whether they were ever
// standing inside something on the way.
async function walkHolding(page, from, keys, ms) {
  await page.evaluate(f => window.__houseDebug.moveTo(f[0], f[1]), from);
  await page.waitForTimeout(140);
  for (const k of keys) await page.keyboard.down(k);
  const started = Date.now();
  let insideAt = null, left = false;
  while (Date.now() - started < ms) {
    const st = await readState(page);
    if (st.gone) { left = true; break; }
    if (st.blockedBy) insideAt = st;
    if (st.mode !== 'walk') break;
    await page.waitForTimeout(40);
  }
  for (const k of keys) await page.keyboard.up(k).catch(() => {});
  const end = left ? { gone: true } : await readState(page);
  return { end: end, insideAt: insideAt };
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

  // --- the computer opens the flight tutorial -------------------------------
  // The room was built as two promises - a TV and a computer, both
  // saying "later". This is the first one kept, and it is the only
  // thing in the house that ACTS: walking into something is how the
  // door and the ship work, but a desk is not something you walk into,
  // so the prompt line itself becomes the button.
  const atComputer = await standAt(page, 'desk');
  const computerUi = await page.evaluate(() => {
    const hint = document.getElementById('hint');
    return { tappable: hint.classList.contains('tappable'), text: hint.textContent };
  });
  check('standing at the computer offers something to press',
    atComputer.action === 'head-on.html?tutorial', atComputer);
  check('and says so, on the one line the room uses for everything',
    computerUi.tappable && /tap/i.test(computerUi.text), computerUi);

  // Anything that does NOT act must stay inert, and must not offer a
  // press - an object that looks pressable and does nothing is worse
  // than one that plainly says later. The books are the room's last
  // piece of furniture that is only furniture.
  const atBooks = await standAt(page, 'shelf');
  check('the books are scenery, and do not pretend otherwise',
    atBooks.action === null && typeof atBooks.prompt === 'string' &&
    atBooks.prompt.indexOf('tap') === -1, atBooks);
  const inTheOpen = await page.evaluate(() => {
    window.__houseDebug.moveTo(0.06, 0.70);
    return new Promise(res => setTimeout(() => res(window.__houseDebug.use()), 260));
  });
  check('and pressing use in the middle of the room does nothing', inTheOpen === false, inTheOpen);

  // The whole point of the thing: it goes there.
  await standAt(page, 'desk');
  await page.click('#hint');
  check('tapping it leaves for the tutorial',
    await reachedPage(page, 'head-on.html?tutorial', 6000), page.url());
  await page.goto(ctx.url('house.html'));
  await page.waitForTimeout(BOOT_MS);

  // --- the six o'clock news -------------------------------------------------
  // The TV was the room's other promise. The draft of the broadcast is
  // expected to be rewritten - the dialogue especially - so what is
  // checked here is the MACHINERY around it: that it plays, that the
  // captions track the shots, that the mouth moves while a line is up,
  // that the picture really is being drawn, and that it gives the room
  // back however it ends.
  const tvSpot = await standAt(page, 'tv');
  check('the TV offers the news', tvSpot.action === 'watch:tv', tvSpot);
  const on = await page.evaluate(() => {
    const d = window.__houseDebug;
    d.watchTv();
    return { mode: d.state().mode, tv: d.tv(),
             bar: document.getElementById('tvBar').classList.contains('visible'),
             controls: document.getElementById('controlBar').classList.contains('gone') };
  });
  check('turning it on starts the bulletin', on.mode === 'watching' && on.tv.shot === 0, on);
  check('with the captions up and the room\'s controls out of the way',
    on.bar === true && on.controls === true && on.tv.caption.length > 10, on);
  check('and the caption is the line the shot is actually on',
    on.tv.caption === on.tv.say, on.tv);

  // You cannot wander off mid-sentence.
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  const held = await page.evaluate(() => window.__houseDebug.state());
  check('the room does not walk while the news is on',
    Math.abs(held.worldX - tvSpot.worldX) < 0.001, { tvSpot, held });

  // The mouth. Sampled over half a second: a still mouth and a moving
  // one both "have a mouth", and only one of them is talking.
  const mouth = await page.evaluate(() => new Promise(res => {
    const d = window.__houseDebug;
    const seen = [];
    const tick = setInterval(() => {
      const t = d.tv();
      if (t) seen.push(+t.mouth.toFixed(2));
      if (seen.length >= 14) { clearInterval(tick); res({ min: Math.min.apply(null, seen), max: Math.max.apply(null, seen), seen: seen }); }
    }, 40);
  }));
  check('the anchor talks - the mouth opens and shuts while a line is up',
    mouth.max - mouth.min > 0.4, mouth);

  // The picture itself. Everything above would pass with a black
  // rectangle where the broadcast should be, so this reads the screen:
  // during the invasion footage there is a green two-dimensional thing
  // standing in it.
  const invaderShowed = await page.evaluate(() => new Promise(res => {
    const d = window.__houseDebug, s = d.scene;
    const started = Date.now();
    const tick = setInterval(() => {
      const t = d.tv();
      if (!t) { clearInterval(tick); res({ never: true }); return; }
      if (Date.now() - started > 25000) { clearInterval(tick); res({ timeout: true, green: 0 }); return; }
      if (t.kind !== 'footage' || t.age < 1.2) return;
      clearInterval(tick);
      const r = s.tvRect();
      s.game.renderer.snapshotArea(Math.round(r.x), Math.round(r.y),
        Math.round(r.w), Math.round(r.h * 0.7), img => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let green = 0;
          for (let i = 0; i < px.length; i += 4) {
            if (px[i + 1] > px[i] + 45 && px[i + 1] > px[i + 2] + 25) green++;
          }
          res({ green: green, shot: t.shot, kind: t.kind });
        });
    }, 100);
  }));
  check('and the invader is on screen in the footage, not just in the script',
    invaderShowed.green > 150, invaderShowed);

  // The captions have to keep up with the shots all the way through.
  // Deadlined, like every other watch in the suite: a bulletin that
  // never advances never ends either, and a check that waits for ever
  // is a test file that hangs rather than one that fails.
  const run = await page.evaluate(() => new Promise(res => {
    const d = window.__houseDebug;
    const captions = [], kinds = {}, mismatched = [];
    const started = Date.now();
    const done = over => res({ captions: captions, kinds: Object.keys(kinds),
                               mismatched: mismatched, over: over });
    const tick = setInterval(() => {
      const t = d.tv();
      if (!t) { clearInterval(tick); done(true); return; }
      if (captions[captions.length - 1] !== t.caption) captions.push(t.caption);
      kinds[t.kind] = true;
      if (t.caption !== t.say) mismatched.push(t.shot);
      if (Date.now() - started > 45000) { clearInterval(tick); done(false); }
    }, 120);
  }));
  check('the bulletin ends by itself rather than running for ever',
    run.over === true, { captions: run.captions.length, over: run.over });
  check('the captions change with the shots, all the way to the end',
    run.captions.length >= 5, { captions: run.captions.length });
  check('and never say something other than the line being said',
    run.mismatched.length === 0, run.mismatched);
  check('the report cuts to footage of them, not just the studio',
    run.kinds.indexOf('footage') !== -1, run.kinds);

  const after = await page.evaluate(() => ({
    mode: window.__houseDebug.state().mode,
    tv: window.__houseDebug.tv(),
    bar: document.getElementById('tvBar').classList.contains('visible'),
    controls: document.getElementById('controlBar').classList.contains('gone')
  }));
  check('it runs out on its own and gives the room back',
    after.mode === 'walk' && after.tv === null && after.bar === false && after.controls === false,
    after);

  // And the two ways to stop watching it early.
  await page.evaluate(() => window.__houseDebug.watchTv());
  await page.click('#tvCloseBtn');
  await page.waitForTimeout(200);
  const offByButton = await page.evaluate(() => ({
    mode: window.__houseDebug.state().mode, tv: window.__houseDebug.tv()
  }));
  check('Turn it off stops it at once', offByButton.mode === 'walk' && offByButton.tv === null,
    offByButton);

  await page.evaluate(() => window.__houseDebug.watchTv());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const offByEscape = await page.evaluate(() => ({
    mode: window.__houseDebug.state().mode, url: window.location.pathname
  }));
  check('and Escape turns the TV off rather than walking out of the house',
    offByEscape.mode === 'walk' && /house\.html$/.test(offByEscape.url), offByEscape);

  // --- coming back to something --------------------------------------------
  // A page can ask to start you AT a thing rather than in the middle of
  // the floor (?at=desk), which is how the flight tutorial hands you
  // back: you sat down at that computer, so you get up from it. The
  // door is deliberately NOT one of those spots - landing on the
  // doorstep would walk you straight back out to the yard before you
  // saw the room - and neither is anything the URL made up.
  await page.goto(ctx.url('house.html?at=sofa'));
  await page.waitForTimeout(BOOT_MS);
  const atSofa = await readState(page);
  check('?at= puts you in front of the thing it names',
    Math.abs(atSofa.worldX - 0.42) < 0.05 && atSofa.depth > 0.6 && atSofa.blockedBy === null,
    atSofa);

  await page.goto(ctx.url('house.html?at=door'));
  await page.waitForTimeout(BOOT_MS);
  const atTheDoor = await readState(page);
  check('but never on the doorstep, which would bounce you straight out',
    atTheDoor.gone !== true && atTheDoor.mode === 'walk' && atTheDoor.atDoor === false, atTheDoor);

  await page.goto(ctx.url('house.html?at=nonsense'));
  await page.waitForTimeout(BOOT_MS);
  const atNonsense = await readState(page);
  check('and a spot that is not a thing lands you where you always start',
    Math.abs(atNonsense.worldX - 0.06) < 0.01 && Math.abs(atNonsense.depth - 0.70) < 0.01,
    atNonsense);

  await page.goto(ctx.url('house.html'));
  await page.waitForTimeout(BOOT_MS);

  // --- furniture is solid ---------------------------------------------------
  // Walking through the sofa is the kind of thing that looks fine in a
  // screenshot and ruins a room the moment you play it. What makes this
  // worth its own section is the SHAPE of the fix: a footprint on the
  // floor rather than the sprite's outline, and one axis resolved at a
  // time so furniture is something you slide along instead of something
  // you stick to. Both halves are invisible until someone walks at a
  // sofa, and neither is covered by anything above.
  await page.goto(ctx.url('house.html'));
  await page.waitForTimeout(BOOT_MS);

  const solid = await page.evaluate(() => {
    const d = window.__houseDebug, s = d.scene;
    const out = { start: d.state().blockedBy, own: {}, inFront: {} };
    Object.keys(d.props).forEach(k => {
      const q = d.props[k];
      out.own[k] = s.blockedAt(q.worldX, q.depth);
      out.inFront[k] = s.blockedAt(q.worldX, q.depth + 0.18);
    });
    return out;
  });
  check('you do not start standing inside the furniture', solid.start === null, solid);
  check('every piece of furniture is solid',
    ['shelf', 'desk', 'tv', 'lamp', 'plant', 'sofa'].every(k => solid.own[k] === k), solid);
  // The one thing in the room you are SUPPOSED to walk into. If it ever
  // joins the others the house has no exit but the button.
  check('but the doorway is not', solid.own.door === null, solid);
  // Footprints that swallow the spot you stand on to use a thing would
  // lock you out of the TV and the computer without blocking anything.
  check('and you can still stand in front of all of it',
    Object.keys(solid.inFront).every(k => solid.inFront[k] === null), solid);

  // Straight at the sofa (worldX 0.42, depth 0.60) from the front of the
  // room. You should stop in front of it, still outside its footprint.
  const intoSofa = await walkHolding(page, [0.42, 0.88], ['ArrowUp'], 2600);
  check('walking into the sofa stops you in front of it',
    intoSofa.end.depth > 0.63 && intoSofa.end.mode === 'walk', intoSofa);
  check('and never inside it', intoSofa.insideAt === null, intoSofa);

  // Sideways into it, which is the other axis and a separate check -
  // resolving only the one you happen to test leaves the room solid in
  // one direction and open in the other.
  const alongSofa = await walkHolding(page, [-0.1, 0.60], ['ArrowRight'], 2600);
  check('and walking sideways into it stops you too',
    alongSofa.end.worldX < 0.3 && alongSofa.insideAt === null, alongSofa);

  // Diagonally at it: blocked on one axis, free on the other, so you
  // slide past instead of stopping dead. Without that a player who
  // holds a diagonal just stops, which reads as the game hanging.
  const roundSofa = await walkHolding(page, [0.42, 0.88], ['ArrowUp', 'ArrowLeft'], 3500);
  check('but a diagonal slides you round it rather than sticking',
    roundSofa.end.depth < 0.45 && roundSofa.insideAt === null, roundSofa);

  // And the way out still works with all of that in the way.
  const toDoor = await walkHolding(page, [0.06, 0.70], ['ArrowUp'], 4000);
  check('and the walk to the front door is still clear',
    toDoor.end.gone === true || toDoor.end.mode !== 'walk', toDoor);
  await page.goto(ctx.url('house.html'));
  await page.waitForTimeout(BOOT_MS);

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
