// The kitchen - the left-hand end of the house.
//
// The room itself is mostly a picture, and a picture is not worth
// asserting about. What IS worth asserting is everything that decides
// whether the picture is a place you can be in, and - because this is
// one of three rooms rather than a page on its own - everything about
// the join between it and the front room:
//
//   - that walking off the open end of it gets you back, and that it
//     is a CUT rather than a sequence
//   - that you arrive where you left off rather than at a spot the
//     page picked, and never standing inside the worktop
//   - that the two sides cannot hand you back and forth forever
//   - that the furniture is sized against the FIGURE rather than the
//     canvas, which is the difference between a room and a doll's house
//   - that nothing stands under the thumb controls or off the side of
//     the picture
//
// Nothing in here acts yet except the cat, and that the rest of it SAYS
// so is checked too: a prominent object that ignores you reads as
// broken, where one that says something reads as furnished.
const harness = require('./harness');

const BOOT_MS = 700;
// The cat roams the whole house, so this room may or may not have it -
// which is the point of it and also the one thing these checks cannot
// live with. ?cat= pins it.
const AWAY = 'kitchen.html?cat=away';
const HERE = 'kitchen.html?cat=kitchen';

async function reachedPage(page, name, timeout) {
  try {
    await page.waitForURL('**/' + name + '*', { timeout: timeout });
    return true;
  } catch (e) {
    return false;
  }
}

// The boot reads have to survive the page NAVIGATING AWAY underneath
// them - a room you can walk out of is a room an evaluate can arrive
// too late for, and a dead context would die with a test error instead
// of failing the one check that was there to catch it.
async function readState(page) {
  try {
    return await page.evaluate(() => window.__kitchenDebug.state());
  } catch (e) {
    return { gone: true, why: String(e).slice(0, 120) };
  }
}

async function standAt(page, key, depthOffset) {
  await page.evaluate(function (args) {
    var d = window.__kitchenDebug, p = d.props[args.key];
    d.moveTo(p.worldX, p.depth + args.offset);
  }, { key: key, offset: depthOffset === undefined ? 0.18 : depthOffset });
  await page.waitForTimeout(240);
  return readState(page);
}

// Put the figure somewhere and hold a direction, the way a player does -
// teleporting would walk straight through the furniture these checks are
// about, because nothing is ever asked to move INTO it.
async function walkHolding(page, from, keys, ms) {
  await page.evaluate(f => window.__kitchenDebug.moveTo(f[0], f[1]), from);
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
  check('the kitchen boots with you standing in it', start.mode === 'walk', start);
  check('on the floor rather than in the worktop', start.blockedBy === null, start);
  check('and not already at anything', start.prompt === null, start);

  // --- it is a kitchen ------------------------------------------------------
  // Every one of these is scenery, and scenery that says what it is. The
  // check that matters is that they say DIFFERENT things: one reach
  // ellipse loose enough to be usable is very easily loose enough for
  // the cooker and the worktop to claim each other.
  // The bowl gets a shorter step forward than the rest: it is ankle
  // high and the size of a saucer, so the distance you stand at to
  // look into it is not the distance you stand at to look at a fridge.
  const said = {};
  for (const [thing, step] of [['counter', 0.18], ['cooker', 0.18], ['fridge', 0.18],
                               ['table', 0.18], ['bin', 0.18], ['bowl', 0.08]]) {
    said[thing] = await standAt(page, thing, step);
  }
  check('standing at each thing in the kitchen says what it is',
    Object.keys(said).every(k => typeof said[k].prompt === 'string' && said[k].prompt.length > 0),
    said);
  check('and no two of them say the same thing',
    new Set(Object.keys(said).map(k => said[k].prompt)).size === Object.keys(said).length, said);
  check('none of it is a thing you can press',
    Object.keys(said).every(k => said[k].action === null), said);

  // The reach zones are deliberately generous - you stand in FRONT of
  // furniture - and generous is one step from "the whole room". The
  // middle of the floor must belong to nothing.
  const middle = await page.evaluate(() => {
    window.__kitchenDebug.moveTo(-0.3, 0.86);
    return new Promise(res => setTimeout(() => res(window.__kitchenDebug.state()), 240));
  });
  check('the middle of the floor is not standing at anything',
    middle.prompt === null, middle);

  // --- the furniture is solid ----------------------------------------------
  const solid = await page.evaluate(() => {
    const d = window.__kitchenDebug, s = d.scene;
    const out = { own: {}, inFront: {} };
    Object.keys(d.props).forEach(k => {
      const q = d.props[k];
      out.own[k] = s.blockedAt(q.worldX, q.depth);
      out.inFront[k] = s.blockedAt(q.worldX, q.depth + 0.18);
    });
    return out;
  });
  check('every piece of furniture is solid',
    ['fridge', 'counter', 'cooker', 'bin', 'table'].every(k => solid.own[k] === k), solid);
  // The one thing on this floor you step OVER rather than round. A
  // saucer that stops a grown adult is a comedy prop.
  check('but the cat bowl is not', solid.own.bowl === null, solid);
  check('and you can still stand in front of all of it',
    Object.keys(solid.inFront).every(k => solid.inFront[k] === null), solid);

  const intoTable = await walkHolding(page, [0.2, 0.9], ['ArrowUp'], 2600);
  check('walking into the table stops you in front of it',
    intoTable.end.depth > 0.6 && intoTable.end.mode === 'walk', intoTable);
  check('and never inside it', intoTable.insideAt === null, intoTable);

  // Sideways into it, which is the other axis and a separate check -
  // resolving only the one you happen to test leaves the room solid in
  // one direction and open in the other.
  const alongTable = await walkHolding(page, [-0.4, 0.56], ['ArrowRight'], 2600);
  check('and walking sideways into it stops you too',
    alongTable.end.worldX < 0.05 && alongTable.insideAt === null, alongTable);

  // Diagonally at it: blocked on one axis, free on the other, so you
  // slide past instead of stopping dead. Without that a player who holds
  // a diagonal just stops, which reads as the game hanging.
  const roundTable = await walkHolding(page, [0.2, 0.9], ['ArrowUp', 'ArrowLeft'], 2200);
  check('but a diagonal slides you round it rather than sticking',
    roundTable.end.gone === true || roundTable.end.depth < 0.6, roundTable);

  // --- the way back ---------------------------------------------------------
  // There is no door between here and the front room and no hallway to
  // walk down. The way back is to keep walking right until you are off
  // this end of the room, and crossing that line is a CUT.
  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);

  const nearEdge = await page.evaluate(() => {
    window.__kitchenDebug.moveTo(0.9, 0.8);
    return new Promise(res => setTimeout(() => res(window.__kitchenDebug.state()), 240));
  });
  check('the open end of the room says the front room is through it',
    /front room/i.test(nearEdge.prompt || ''), nearEdge);
  const edgeButton = await page.evaluate(() => ({
    label: document.getElementById('outLabel').textContent,
    lit: document.getElementById('outBtn').classList.contains('acts')
  }));
  check('but it is a sign, not a button',
    edgeButton.label === 'Out' && edgeButton.lit === false, edgeButton);

  // Mid-walk, the scene must still read 'walk' right up to the cut -
  // there is no leaving sequence to be in. Caught by watching the mode
  // for the whole walk rather than once at the end.
  const modes = await (async () => {
    await page.evaluate(() => window.__kitchenDebug.moveTo(0.4, 0.74));
    await page.waitForTimeout(140);
    await page.keyboard.down('ArrowRight');
    const seen = new Set();
    const started = Date.now();
    while (Date.now() - started < 3000) {
      const st = await readState(page);
      if (st.gone) break;
      seen.add(st.mode);
      if (st.mode === 'gone') break;
      await page.waitForTimeout(40);
    }
    await page.keyboard.up('ArrowRight').catch(() => {});
    return [...seen];
  })();
  check('walking off the open end is a cut, with no leaving sequence',
    modes.indexOf('leaving') === -1, modes);
  check('and lands in the front room', await reachedPage(page, 'house.html', 6000), page.url());
  const handover = new URL(page.url());
  check('carrying the depth you were walking at across with you',
    handover.searchParams.get('from') === 'kitchen' &&
    Math.abs(parseFloat(handover.searchParams.get('d')) - 0.74) < 0.1, page.url());

  // Coming the other way. You arrive at the end you walked in through,
  // at the depth you were walking at - and crucially NOT balanced on the
  // line, which would hand you straight back where you came from.
  for (const d of [0.2, 0.5, 0.86]) {
    await page.goto(ctx.url(`kitchen.html?cat=away&from=house&d=${d}`));
    await page.waitForTimeout(BOOT_MS);
    const arrived = await readState(page);
    check(`coming in at depth ${d} puts you at this end of the room`,
      arrived.gone !== true && arrived.worldX > 0.6, arrived);
    check(`...on floor rather than in the furniture`, arrived.blockedBy === null, arrived);
    // At the depth you were walking at, or a step nearer if that depth
    // would have put you inside the furniture - never further back, and
    // never at some spot the page picked for itself.
    check(`...at the depth you were walking at, give or take a step out of the way`,
      arrived.depth >= d - 0.001 && arrived.depth - d < 0.26, { d, arrived });
    check(`...and a walk clear of the line you came through`,
      arrived.worldX < 0.95, arrived);
  }

  // A depth the URL made up, or none at all, must not put you anywhere
  // silly - a room is not a thing a query string gets to break.
  await page.goto(ctx.url('kitchen.html?cat=away&from=house&d=nonsense'));
  await page.waitForTimeout(BOOT_MS);
  const nonsense = await readState(page);
  check('and a depth that is not a number lands you somewhere real',
    nonsense.gone !== true && nonsense.depth > 0.05 && nonsense.depth < 0.95 &&
    nonsense.blockedBy === null, nonsense);

  // The Out button and Escape are the same escape hatch the other rooms
  // have, and both go to the front room rather than out of the house.
  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);
  await page.click('#outBtn');
  check('the Out button goes back to the front room',
    await reachedPage(page, 'house.html', 6000), page.url());

  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);
  await page.keyboard.press('Escape');
  check('and so does Escape', await reachedPage(page, 'house.html', 6000), page.url());

  // --- the room is a room ---------------------------------------------------
  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);

  // Sized against the FIGURE, not the canvas - the difference between a
  // room and a doll's house, and invisible in any single screenshot.
  const scale = await page.evaluate(() => {
    const b = window.__kitchenDebug.bounds();
    const h = k => b[k].bottom - b[k].top;
    const person = h('you');
    const out = { person: Math.round(person) };
    ['fridge', 'counter', 'cooker', 'bin', 'table', 'bowl'].forEach(k => {
      out[k] = +(h(k) / person).toFixed(2);
    });
    return out;
  });
  check('the figure is drawn big enough to be a person in a room, not a speck',
    scale.person > 70, scale);
  check('nothing in the kitchen towers over them',
    ['fridge', 'counter', 'cooker', 'bin', 'table'].every(k => scale[k] < 1.1), scale);
  check('the worktop comes up to the hip, as a worktop does',
    scale.counter > 0.3 && scale.counter < 0.7, scale);
  check('the fridge is a fridge rather than a wardrobe',
    scale.fridge > 0.75 && scale.fridge < 1.1, scale);
  check('and the cat bowl is a saucer', scale.bowl < 0.3, scale);

  // The things that belong against the back wall have to land on the
  // junction rather than out on the floorboards.
  const wall = await page.evaluate(() => {
    const b = window.__kitchenDebug.bounds();
    const out = { floorY: Math.round(b.floorY) };
    ['fridge', 'counter', 'cooker'].forEach(k => { out[k] = Math.round(b[k].bottom - b.floorY); });
    return out;
  });
  check('the kitchen units stand against the back wall, not out in the room',
    ['fridge', 'counter', 'cooker'].every(k => wall[k] > 0 && wall[k] < 45), wall);

  // Nothing may stand under the thumb controls, and nothing may be drawn
  // off the side of the picture - the same two layout traps the yard had.
  const layout = await page.evaluate(() => {
    const b = window.__kitchenDebug.bounds(), W = window.innerWidth;
    function rect(id) {
      const r = document.getElementById(id).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    function overlaps(a, c) {
      return a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    }
    const stick = rect('stickZone'), out = rect('outBtn');
    const res = { width: W, onStick: [], onOut: [], offPicture: [] };
    Object.keys(b).forEach(k => {
      if (k === 'floorY') return;
      if (overlaps(b[k], stick)) res.onStick.push(k);
      if (overlaps(b[k], out)) res.onOut.push(k);
      if (b[k].right < 12 || b[k].left > W - 12) res.offPicture.push(k);
    });
    return res;
  });
  check('you do not start standing under the thumb controls',
    layout.onStick.indexOf('you') === -1 && layout.onOut.indexOf('you') === -1, layout);
  check('and the furniture stays clear of them too',
    layout.onStick.length === 0 && layout.onOut.length === 0, layout);
  check('nothing in the room is off the side of the picture',
    layout.offPicture.length === 0, layout);

  // --- the cat --------------------------------------------------------------
  await page.goto(ctx.url(AWAY));
  await page.waitForTimeout(BOOT_MS);
  const noCat = await page.evaluate(() => ({
    cat: window.__kitchenDebug.cat(), state: window.__kitchenDebug.state()
  }));
  check('with the cat elsewhere in the house, this room has no cat',
    noCat.cat.here === false && noCat.state.atCat === false, noCat);
  check('and nothing in here claims to be it', noCat.state.prompt === null, noCat);
  // Nothing about a room without a cat in it may throw - every one of
  // these runs on a null cat every time the cat is somewhere else.
  const quiet = await page.evaluate(() => {
    const d = window.__kitchenDebug;
    return { moved: d.moveCat(0, 0.5), petted: d.pet(), state: d.state().mode };
  });
  check('and a room with no cat in it still works',
    quiet.moved === false && quiet.petted === false && quiet.state === 'walk', quiet);

  await page.goto(ctx.url(HERE));
  await page.waitForTimeout(BOOT_MS);
  const catHere = await page.evaluate(() => window.__kitchenDebug.cat());
  check('pinned to this room, the cat is in it', catHere.here === true, catHere);
  check('every place it goes is floor it can stand on',
    catHere.spots.length >= 3 && catHere.spotsBlocked.every(b => b === null), catHere);
  check('and it does not boot standing underfoot',
    (await readState(page)).atCat === false, catHere);

  // Watched for a while: does it move, does it get anywhere, and is it
  // ever found standing in the furniture on the way. Sampled rather
  // than asserted once, because a cat that only clips the table in the
  // middle of a walk would pass every end-of-walk check there is.
  const watched = await (async () => {
    const rested = new Set(), places = new Set();
    let insideAt = null, walked = false;
    const started = Date.now();
    while (Date.now() - started < 26000) {
      const c = await page.evaluate(() => window.__kitchenDebug.cat().at);
      if (c.insideFurniture) insideAt = c;
      if (c.mode === 'walk') walked = true;
      if (c.mode === 'rest') rested.add(c.at);
      places.add(c.worldX.toFixed(2) + ',' + c.depth.toFixed(2));
      await page.waitForTimeout(120);
    }
    return { rested: rested.size, positions: places.size, walked, insideAt };
  })();
  check('the cat gets up and walks about the kitchen', watched.walked, watched);
  check('and arrives somewhere other than where it started', watched.rested >= 2, watched);
  check('having moved through more than a handful of places on the way',
    watched.positions > 12, watched);
  check('and is never found standing inside the furniture',
    watched.insideAt === null, watched);

  await page.evaluate(() => {
    const d = window.__kitchenDebug, st = d.state();
    d.moveCat(st.worldX, st.depth - 0.06);
  });
  await page.waitForTimeout(260);
  const onCat = await page.evaluate(() => ({
    state: window.__kitchenDebug.state(),
    label: document.getElementById('outLabel').textContent,
    hint: document.getElementById('hint').textContent
  }));
  check('standing at the cat registers', onCat.state.atCat === true, onCat);
  check('and the corner button offers to pet it', onCat.label === 'Pet', onCat);

  await page.click('#outBtn');
  await page.waitForTimeout(280);
  const petted = await page.evaluate(() => ({
    cat: window.__kitchenDebug.cat(),
    hint: document.getElementById('hint').textContent,
    url: window.location.pathname
  }));
  check('pressing it pets the cat rather than leaving the room',
    petted.cat.at.petted === true && /kitchen\.html$/.test(petted.url), petted);
  check('and the room says something different once you have',
    petted.hint !== onCat.hint && petted.hint.length > 0, petted);
  check('and the cat stays put to be petted', petted.cat.at.mode === 'pet', petted);

  // Sat in front of something else, the cat wins. Being told about the
  // cooker while a cat sits on your feet is the wrong answer every time.
  await page.goto(ctx.url(HERE));
  await page.waitForTimeout(BOOT_MS);
  const overCooker = await page.evaluate(() => {
    const d = window.__kitchenDebug, p = d.props.cooker;
    d.moveTo(p.worldX, p.depth + 0.18);
    d.moveCat(p.worldX, p.depth + 0.18);
    return new Promise(res => setTimeout(() => res({
      state: d.state(), label: document.getElementById('outLabel').textContent
    }), 280));
  });
  check('a cat in front of the cooker is what the room talks about',
    overCooker.state.atCat === true && overCooker.label === 'Pet' &&
    !/cooker/i.test(overCooker.state.prompt), overCooker);

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'kitchen.html?cat=away' });
