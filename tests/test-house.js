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
    // The trailing * matters: walking between rooms carries a query
    // string, and a pattern without it matches neither.
    await page.waitForURL('**/' + name + '*', { timeout: timeout });
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

// The cat roams the whole house, so a room may or may not have it -
// which is the point of it and also the one thing these checks cannot
// live with. ?cat= pins it: AWAY for everything that is about the
// furniture, HERE for the handful of checks that are about the cat.
const AWAY = 'house.html?cat=away';
const HERE = 'house.html?cat=house';

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
    window.__houseDebug.moveTo(-0.55, 0.9);
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
  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);
  await page.click('#outBtn');
  check('the Out button leaves from anywhere', await reachedPage(page, 'yard.html', 6000), page.url());

  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);
  await page.keyboard.press('Escape');
  check('and so does Escape', await reachedPage(page, 'yard.html', 6000), page.url());

  // --- the room is a room --------------------------------------------------
  await page.goto(ctx.url(AWAY));
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
  const computerUi = await page.evaluate(() => ({
    label: document.getElementById('outLabel').textContent,
    lit: document.getElementById('outBtn').classList.contains('acts'),
    hint: document.getElementById('hint').textContent
  }));
  check('standing at the computer offers something to press',
    atComputer.action === 'head-on.html?tutorial', atComputer);
  // The prompt line names the thing; the BUTTON says what pressing it
  // will do. The first draft had it the other way round - the only way
  // in was a word on the prompt line, at the top of a tablet screen,
  // nowhere near the thumb that had just walked you there.
  check('and the corner button has become that thing',
    computerUi.label === 'Use' && computerUi.lit === true, computerUi);
  check('while the prompt line just says what you are standing at',
    /computer/i.test(computerUi.hint) && !/tap/i.test(computerUi.hint), computerUi);

  // One button, three jobs, decided by where you are standing.
  const corner = {};
  for (const spot of ['tv', 'desk', 'shelf']) {
    await standAt(page, spot);
    corner[spot] = await page.evaluate(() => ({
      label: document.getElementById('outLabel').textContent,
      lit: document.getElementById('outBtn').classList.contains('acts')
    }));
  }
  await page.evaluate(() => window.__houseDebug.moveTo(0.06, 0.70));
  await page.waitForTimeout(240);
  corner.open = await page.evaluate(() => ({
    label: document.getElementById('outLabel').textContent,
    lit: document.getElementById('outBtn').classList.contains('acts')
  }));
  check('the corner button says what is in reach',
    corner.tv.label === 'Watch' && corner.desk.label === 'Use', corner);
  check('and goes back to being the way out when nothing is',
    corner.open.label === 'Out' && corner.open.lit === false &&
    corner.shelf.label === 'Out' && corner.shelf.lit === false, corner);

  // Pressing it where it is the way out must still be the way out - the
  // exit cannot be the thing that gets lost in repurposing the button.
  await page.click('#outBtn');
  check('and pressing it in the open still goes outside',
    await reachedPage(page, 'yard.html', 6000), page.url());
  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);

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

  // The whole point of the thing: pressing the corner button where it
  // says Use goes there. Pressed rather than called, because what broke
  // before was the route from a thumb to the action, not the action.
  await standAt(page, 'desk');
  await page.click('#outBtn');
  check('pressing Use at the computer leaves for the tutorial',
    await reachedPage(page, 'head-on.html?tutorial', 6000), page.url());
  await page.goto(ctx.url(AWAY));
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
  // Pressed, not called: the corner button is the only way in that a
  // player has, and it is a different piece of code from watchTv().
  await page.click('#outBtn');
  await page.waitForTimeout(260);
  const on = await page.evaluate(() => {
    const d = window.__houseDebug;
    return { mode: d.state().mode, tv: d.tv(),
             bar: document.getElementById('tvBar').classList.contains('visible'),
             controls: document.getElementById('controlBar').classList.contains('gone') };
  });
  check('turning it on starts the bulletin', on.mode === 'watching' && on.tv.shot === 0, on);
  check('with the captions up and the room\'s controls out of the way',
    on.bar === true && on.controls === true && on.tv.caption.length > 10, on);
  check('and the caption is the line the shot is actually on',
    on.tv.caption === on.tv.say, on.tv);

  // Directly under the set, and the same width as it. On a tall screen
  // a caption pinned to the foot of the page is a long way from the
  // mouth saying it, and you end up reading one or watching the other.
  const captionBox = await page.evaluate(async () => {
    // Wiped and reopened first, so this proves the band is placed AS IT
    // IS SHOWN rather than that boot happened to leave it in the right
    // spot - the resize that fires at startup does the same arithmetic,
    // and would cover for a show path that never placed it at all.
    // Turning it off is a fade now, so the reopen waits for the set to
    // actually be off rather than assuming it went at once.
    const d = window.__houseDebug;
    const el = document.getElementById('tvBar');
    el.style.top = ''; el.style.left = ''; el.style.width = '';
    d.closeTv();
    await new Promise(res => {
      const tick = setInterval(() => { if (!d.tv()) { clearInterval(tick); res(); } }, 30);
      setTimeout(() => { clearInterval(tick); res(); }, 3000);
    });
    d.watchTv();
    const s = d.scene, r = s.tvRect();
    const b = document.getElementById('tvBar').getBoundingClientRect();
    return { gap: Math.round(b.y - (r.y + r.h)), dx: Math.round(b.x - r.x),
             dw: Math.round(b.width - r.w), viewport: window.innerHeight,
             barBottom: Math.round(b.bottom) };
  });
  check('the captions sit right under the picture, not at the foot of the screen',
    captionBox.gap >= 0 && captionBox.gap < 40, captionBox);
  check('and line up with the set rather than with the page',
    Math.abs(captionBox.dx) < 3 && Math.abs(captionBox.dw) < 3, captionBox);

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

  // --- it fades up and down, rather than cutting ---------------------------
  // A cut between a lit room and a lit television is a jolt; the point
  // of a quarter of a second is that your eye follows it instead of
  // being told. Sampled rather than trusted: both ends read the SET's
  // own fade, which is what every layer of it is drawn at.
  const fadeUp = await page.evaluate(async () => {
    const d = window.__houseDebug;
    d.watchTv();
    const first = d.scene.tv.fade;
    await new Promise(r => setTimeout(r, 600));
    return { first: first, settled: d.scene.tv ? d.scene.tv.fade : null };
  });
  check('the set fades up rather than snapping on',
    fadeUp.first < 0.4 && fadeUp.settled === 1, fadeUp);

  const fadeDown = await page.evaluate(async () => {
    const d = window.__houseDebug;
    d.closeTv();
    await new Promise(r => setTimeout(r, 90));
    const mid = d.scene.tv ? d.scene.tv.fade : null;
    const stillWatching = d.state().mode;
    await new Promise(r => setTimeout(r, 700));
    return { mid: mid, stillWatching: stillWatching, after: d.state().mode, tv: d.tv() };
  });
  check('and fades back down before the room returns',
    fadeDown.mid !== null && fadeDown.mid > 0 && fadeDown.mid < 1 &&
    fadeDown.stillWatching === 'watching' && fadeDown.after === 'walk', fadeDown);

  // --- and the room itself arrives out of black ----------------------------
  // The page cannot draw its own arrival - there is no scene yet when it
  // first paints - so an overlay starts opaque and is lifted once there
  // is a frame behind it. Read twice: dark a moment in, clear after.
  const arrival = await (async () => {
    await page.goto(ctx.url(AWAY));
    const early = await page.evaluate(() => {
      const el = document.getElementById('blackout');
      return { exists: !!el, visible: el ? el.classList.contains('visible') : false,
               opacity: el ? +getComputedStyle(el).opacity : null };
    });
    await page.waitForTimeout(1200);
    const late = await page.evaluate(() => {
      const el = document.getElementById('blackout');
      return { visible: el.classList.contains('visible'), opacity: +getComputedStyle(el).opacity };
    });
    return { early: early, late: late };
  })();
  check('the room arrives out of black rather than snapping on',
    arrival.early.exists && arrival.early.opacity > 0.3, arrival);
  check('and clears once there is something behind it',
    arrival.late.visible === false && arrival.late.opacity === 0, arrival);
  await page.waitForTimeout(BOOT_MS);

  // And the two ways to stop watching it early.
  await page.evaluate(() => window.__houseDebug.watchTv());
  await page.click('#tvCloseBtn');
  await page.waitForTimeout(700); // it fades down rather than cutting - see NEWS_FADE
  const offByButton = await page.evaluate(() => ({
    mode: window.__houseDebug.state().mode, tv: window.__houseDebug.tv()
  }));
  check('Turn it off stops it at once', offByButton.mode === 'walk' && offByButton.tv === null,
    offByButton);

  await page.evaluate(() => window.__houseDebug.watchTv());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
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
  await page.goto(ctx.url('house.html?cat=away&at=sofa'));
  await page.waitForTimeout(BOOT_MS);
  const atSofa = await readState(page);
  check('?at= puts you in front of the thing it names',
    Math.abs(atSofa.worldX - 0.42) < 0.05 && atSofa.depth > 0.6 && atSofa.blockedBy === null,
    atSofa);

  await page.goto(ctx.url('house.html?cat=away&at=door'));
  await page.waitForTimeout(BOOT_MS);
  const atTheDoor = await readState(page);
  check('but never on the doorstep, which would bounce you straight out',
    atTheDoor.gone !== true && atTheDoor.mode === 'walk' && atTheDoor.atDoor === false, atTheDoor);

  await page.goto(ctx.url('house.html?cat=away&at=nonsense'));
  await page.waitForTimeout(BOOT_MS);
  const atNonsense = await readState(page);
  check('and a spot that is not a thing lands you where you always start',
    Math.abs(atNonsense.worldX - 0.06) < 0.01 && Math.abs(atNonsense.depth - 0.70) < 0.01,
    atNonsense);

  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);

  // --- furniture is solid ---------------------------------------------------
  // Walking through the sofa is the kind of thing that looks fine in a
  // screenshot and ruins a room the moment you play it. What makes this
  // worth its own section is the SHAPE of the fix: a footprint on the
  // floor rather than the sprite's outline, and one axis resolved at a
  // time so furniture is something you slide along instead of something
  // you stick to. Both halves are invisible until someone walks at a
  // sofa, and neither is covered by anything above.
  await page.goto(ctx.url(AWAY));
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
  const roundSofa = await walkHolding(page, [0.42, 0.88], ['ArrowUp', 'ArrowLeft'], 2000);
  check('but a diagonal slides you round it rather than sticking',
    roundSofa.end.depth < 0.45 && roundSofa.insideAt === null, roundSofa);

  // And the way out still works with all of that in the way.
  const toDoor = await walkHolding(page, [0.06, 0.70], ['ArrowUp'], 4000);
  check('and the walk to the front door is still clear',
    toDoor.end.gone === true || toDoor.end.mode !== 'walk', toDoor);
  await page.goto(ctx.url(AWAY));
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

  // --- the two open ends of the house ---------------------------------------
  // The front room is the middle of three. There is no door at either
  // end and no hallway between them - it is one open plan - so the way
  // through is to keep walking, and crossing the line is a CUT: the
  // same rule as crossing the house's front line out in the yard.
  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);

  const nearEnds = {};
  for (const [name, x] of [['kitchen', -0.9], ['bedroom', 0.9]]) {
    nearEnds[name] = await page.evaluate(spot => {
      window.__houseDebug.moveTo(spot, 0.8);
      return new Promise(res => setTimeout(() => res(window.__houseDebug.state()), 240));
    }, x);
  }
  check('the left-hand end of the room says the kitchen is through it',
    /kitchen/i.test(nearEnds.kitchen.prompt || ''), nearEnds);
  check('and the right-hand end says the bed end is',
    /bed/i.test(nearEnds.bedroom.prompt || ''), nearEnds);
  // The hint is a sign, not a button. Pressing the corner button here
  // must still be the way OUT of the house, not a way sideways.
  const endButton = await page.evaluate(() => ({
    label: document.getElementById('outLabel').textContent,
    lit: document.getElementById('outBtn').classList.contains('acts')
  }));
  check('but neither end turns the corner button into something else',
    endButton.label === 'Out' && endButton.lit === false, endButton);

  const toKitchen = await walkHolding(page, [0.0, 0.8], ['ArrowLeft'], 4000);
  check('walking off the left-hand end of the room leaves it', toKitchen.end.gone === true,
    toKitchen);
  check('and lands in the kitchen', await reachedPage(page, 'kitchen.html', 6000), page.url());
  // Carrying the depth across is the whole of continuity here: there is
  // no doorway at either end to work a landing spot out from, so the
  // only thing that can make the two sides agree is where you were.
  const handover = new URL(page.url());
  check('carrying the depth you were walking at across with you',
    handover.searchParams.get('from') === 'house' &&
    Math.abs(parseFloat(handover.searchParams.get('d')) - 0.8) < 0.08, page.url());

  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);
  const toBedroom = await walkHolding(page, [0.0, 0.8], ['ArrowRight'], 4000);
  check('and walking off the right-hand end leaves it too', toBedroom.end.gone === true,
    toBedroom);
  check('landing at the bed end', await reachedPage(page, 'bedroom.html', 6000), page.url());

  // Coming back the other way. You arrive at the end you walked out of,
  // at the depth you were walking at - and never standing in the sofa,
  // whatever depth that was.
  for (const [from, sign] of [['kitchen', -1], ['bedroom', 1]]) {
    await page.goto(ctx.url(`house.html?cat=away&from=${from}&d=0.62`));
    await page.waitForTimeout(BOOT_MS);
    const back = await readState(page);
    check(`coming back from the ${from} puts you at that end of the room`,
      Math.sign(back.worldX) === sign && Math.abs(back.worldX) > 0.6, back);
    check(`at the depth you left it at, and standing on floor`,
      Math.abs(back.depth - 0.62) < 0.02 && back.blockedBy === null, back);
    // ...and not one step from walking straight back out again.
    check(`with room to turn round in`,
      Math.abs(back.worldX) < 0.95, back);
  }

  // The whole round trip, walked rather than teleported: out of the
  // front room, across the kitchen, back, across the bed end, back.
  // Each leg is checked on its own above; what this catches is the
  // thing none of them can - the two sides of a join drifting apart,
  // so that a lap of the house leaves you somewhere you never walked.
  const lap = await (async () => {
    const legs = [];
    async function walkOut(hook, keys, ms) {
      await page.keyboard.down(keys);
      const started = Date.now();
      while (Date.now() - started < ms) {
        const here = await page.evaluate(h => {
          const d = window[h];
          return d ? d.state() : null;
        }, hook).catch(() => null);
        if (!here) break;
        if (here.mode !== 'walk') break;
        await page.waitForTimeout(40);
      }
      await page.keyboard.up(keys).catch(() => {});
      await page.waitForTimeout(900);
      return page.url();
    }
    await page.goto(ctx.url('house.html?cat=away'));
    await page.waitForTimeout(BOOT_MS);
    await page.evaluate(() => window.__houseDebug.moveTo(0, 0.66));
    legs.push(await walkOut('__houseDebug', 'ArrowLeft', 5000));
    const inKitchen = await page.evaluate(() => window.__kitchenDebug.state());
    legs.push(await walkOut('__kitchenDebug', 'ArrowRight', 5000));
    const backHome = await page.evaluate(() => window.__houseDebug.state());
    return { legs, inKitchen, backHome };
  })();
  check('a lap of the house walks through the kitchen and back',
    /kitchen\.html/.test(lap.legs[0]) && /house\.html/.test(lap.legs[1]), lap.legs);
  // Out at depth 0.66, so in at depth 0.66, and home again at 0.66 -
  // give or take the stride you were part way through.
  check('and you are at the same depth the whole way round',
    Math.abs(lap.inKitchen.depth - 0.66) < 0.08 &&
    Math.abs(lap.backHome.depth - 0.66) < 0.08, lap);
  check('standing on floor at every stop',
    lap.inKitchen.blockedBy === null && lap.backHome.blockedBy === null, lap);
  // And back on the side of the front room you came in through, not
  // teleported across it.
  check('and back on the side of the room you came in through',
    lap.backHome.worldX < -0.6, lap.backHome);

  // --- the cat --------------------------------------------------------------
  // It belongs to the house rather than to a room, so the first thing
  // worth checking is that it is somewhere at all - and only ever in a
  // room that exists.
  await page.goto(ctx.url('house.html?cat=away'));
  await page.waitForTimeout(BOOT_MS);
  const away = await page.evaluate(() => ({
    cat: window.__houseDebug.cat(),
    stored: JSON.parse(window.sessionStorage.getItem('broccoli-chapter1-v1') || '{}'),
    state: window.__houseDebug.state()
  }));
  check('with the cat elsewhere in the house, this room has no cat',
    away.cat.here === false && away.state.atCat === false, away);
  check('and it is still somewhere real',
    ['house', 'kitchen', 'bedroom'].indexOf(away.stored.catRoom) >= 0 &&
    away.stored.catRoom !== 'house', away);
  check('and nothing in here claims to be it', away.state.prompt === null, away);

  // Left to itself it moves between the three rooms while you are not
  // looking. Loaded enough times, it has to have been in more than one
  // of them - and never in a room that does not exist.
  const roamed = await (async () => {
    const seen = {};
    for (let i = 0; i < 24; i++) {
      await page.goto(ctx.url('house.html'));
      await page.waitForTimeout(260);
      const room = await page.evaluate(() =>
        JSON.parse(window.sessionStorage.getItem('broccoli-chapter1-v1') || '{}').catRoom);
      seen[room] = (seen[room] || 0) + 1;
    }
    return seen;
  })();
  check('left alone the cat moves about the house',
    Object.keys(roamed).length >= 2, roamed);
  check('and is never put in a room that does not exist',
    Object.keys(roamed).every(r => ['house', 'kitchen', 'bedroom'].indexOf(r) >= 0), roamed);

  // In the room, it is a thing you can be at.
  await page.goto(ctx.url(HERE));
  await page.waitForTimeout(BOOT_MS);
  const catHere = await page.evaluate(() => window.__houseDebug.cat());
  check('pinned to this room, the cat is in it', catHere.here === true, catHere);
  check('every place it goes is floor it can stand on',
    catHere.spots.length >= 4 && catHere.spotsBlocked.every(b => b === null), catHere);
  check('and it does not boot standing underfoot',
    (await readState(page)).atCat === false, await readState(page));

  // Watched for a while: does it move, does it get anywhere, and is it
  // ever found standing in the furniture on the way. Sampled rather
  // than asserted once, because a cat that only clips the sofa in the
  // middle of a walk would pass every end-of-walk check there is.
  const watched = await (async () => {
    const rested = new Set(), places = new Set();
    let insideAt = null, walked = false;
    const started = Date.now();
    while (Date.now() - started < 26000) {
      const c = await page.evaluate(() => window.__houseDebug.cat().at);
      if (c.insideFurniture) insideAt = c;
      if (c.mode === 'walk') walked = true;
      if (c.mode === 'rest') rested.add(c.at);
      places.add(c.worldX.toFixed(2) + ',' + c.depth.toFixed(2));
      await page.waitForTimeout(120);
    }
    return { rested: rested.size, positions: places.size, walked, insideAt };
  })();
  check('the cat gets up and walks about the room', watched.walked, watched);
  check('and arrives somewhere other than where it started', watched.rested >= 2, watched);
  check('having moved through more than a handful of places on the way',
    watched.positions > 12, watched);
  check('and is never found standing inside the furniture',
    watched.insideAt === null, watched);

  // Petting. The cat is the only thing in here that answers to the
  // corner button without being somewhere you can be TOLD to stand, so
  // the check has to put it under your feet first.
  await page.evaluate(() => {
    const d = window.__houseDebug, st = d.state();
    d.moveCat(st.worldX, st.depth - 0.06);
  });
  await page.waitForTimeout(260);
  const onCat = await page.evaluate(() => ({
    state: window.__houseDebug.state(),
    label: document.getElementById('outLabel').textContent,
    lit: document.getElementById('outBtn').classList.contains('acts'),
    hint: document.getElementById('hint').textContent
  }));
  check('standing at the cat registers', onCat.state.atCat === true, onCat);
  check('and the corner button offers to pet it',
    onCat.label === 'Pet' && onCat.lit === true, onCat);

  await page.click('#outBtn');
  await page.waitForTimeout(280);
  const petted = await page.evaluate(() => ({
    cat: window.__houseDebug.cat(),
    hint: document.getElementById('hint').textContent,
    url: window.location.pathname
  }));
  check('pressing it pets the cat rather than leaving the house',
    petted.cat.at.petted === true && /house\.html$/.test(petted.url), petted);
  check('and the room says something different once you have',
    petted.hint !== onCat.hint && petted.hint.length > 0, petted);
  check('and the cat stays put to be petted', petted.cat.at.mode === 'pet', petted);

  // Sat in front of something else, the cat wins. Being told about the
  // television while a cat sits on your feet is the wrong answer every
  // time, and the order of a list of ifs is exactly the kind of thing
  // that gets rearranged by accident.
  await page.goto(ctx.url(HERE));
  await page.waitForTimeout(BOOT_MS);
  const overTv = await page.evaluate(() => {
    const d = window.__houseDebug, p = d.props.tv;
    d.moveTo(p.worldX, p.depth + 0.18);
    d.moveCat(p.worldX, p.depth + 0.18);
    return new Promise(res => setTimeout(() => res({
      state: d.state(), label: document.getElementById('outLabel').textContent
    }), 280));
  });
  check('a cat in front of the TV is what the room talks about',
    overTv.state.atTv === true && overTv.state.atCat === true &&
    overTv.label === 'Pet', overTv);

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'house.html?cat=away' });
