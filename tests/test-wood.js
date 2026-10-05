// The woods - off the bottom-left corner of the yard.
//
// This scene exists for its LIGHT, so that is what most of this file is
// about: that there is a shaft under every gap in the canopy, that they
// all lean the way one moon would push them, that they widen as they
// fall, and - in actual pixels - that the air inside one is brighter
// than the air beside it. Everything above that line would pass with no
// beams drawn at all.
//
// The rest is what makes the picture a place you can be in:
//
//   - that walking out of the right-hand side gets you back to the lawn,
//     and that it is a CUT rather than a sequence
//   - that you arrive where you left off rather than at a spot the page
//     picked, and never standing inside a tree
//   - that the deep end REFUSES rather than silently stopping you
//   - that the trunks are solid and sized against the figure
//   - that nothing stands under the thumb controls
const harness = require('./harness');

const BOOT_MS = 900;

async function reachedPage(page, name, timeout) {
  try {
    await page.waitForURL('**/' + name + '*', { timeout: timeout });
    return true;
  } catch (e) {
    return false;
  }
}

// The boot reads have to survive the page NAVIGATING AWAY underneath
// them - a scene you can walk out of is a scene an evaluate can arrive
// too late for, and a dead context would die with a test error instead
// of failing the one check that was there to catch it.
async function readState(page) {
  try {
    return await page.evaluate(() => window.__woodDebug.state());
  } catch (e) {
    return { gone: true, why: String(e).slice(0, 120) };
  }
}

async function standAt(page, key, depthOffset) {
  await page.evaluate(function (args) {
    var d = window.__woodDebug, p = d.props[args.key];
    d.moveTo(p.worldX, p.depth + args.offset);
  }, { key: key, offset: depthOffset === undefined ? 0.14 : depthOffset });
  await page.waitForTimeout(240);
  return readState(page);
}

// Put the figure somewhere and hold a direction, the way a player does -
// teleporting would walk straight through the trees these checks are
// about, because nothing is ever asked to move INTO one.
async function walkHolding(page, from, keys, ms) {
  await page.evaluate(f => window.__woodDebug.moveTo(f[0], f[1]), from);
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

// Mean brightness of a patch of the rendered frame.
function meanOf(page, x, y, w, h) {
  return page.evaluate(box => new Promise(res => {
    const s = window.__woodDebug.scene;
    s.game.renderer.snapshotArea(Math.round(box.x), Math.round(box.y),
      Math.round(box.w), Math.round(box.h), img => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
        res(+(sum / (px.length / 4)).toFixed(2));
      });
  }), { x, y, w, h });
}

harness.run(async (page, check, ctx) => {
  const errors = ctx.errors;
  await page.waitForTimeout(BOOT_MS);

  check('no page errors on load', errors.length === 0, errors);

  const start = await readState(page);
  check('the wood boots with you standing in it', start.mode === 'walk', start);
  check('on the ground rather than in a tree', start.blockedBy === null, start);
  check('and not already at anything', start.prompt === null, start);

  // --- the light ------------------------------------------------------------
  // A beam with no gap over it is a torch nobody is holding, and a gap
  // with no beam under it is a hole in a roof. The canopy and the shafts
  // are drawn from one list for exactly this reason, and this is the
  // check that says so.
  const beams = await page.evaluate(() => window.__woodDebug.beams());
  const gaps = await page.evaluate(() => window.__woodDebug.gaps);
  const W = await page.evaluate(() => window.innerWidth);
  check('there is a shaft of light for every gap in the canopy',
    beams.length === gaps.length && beams.length >= 3, { beams: beams.length, gaps: gaps.length });
  check('and each one hangs under its own gap',
    beams.every((b, i) => Math.abs(b.top.cx - gaps[i].at * W) < 2), { beams, W });
  // The moon is one moon, it is up and to the RIGHT, and light from it
  // travels down and to the left. Every shaft has to lean that way, and
  // so does the lit edge of every trunk - two of them disagreeing is two
  // moons, which looks fine in a still and wrong in the picture.
  check('every shaft leans away from the moon, which is one moon on the right',
    beams.every(b => b.foot.cx < b.top.cx - 10), beams);
  check('and they spread as they fall, the way a beam does',
    beams.every(b => (b.foot.right - b.foot.left) > (b.top.right - b.top.left) * 1.3), beams);
  // Where it LANDS is the half of a shaft that makes it light rather
  // than a pale stripe, so it is not enough for a sliver to be on
  // screen - the pool has to be.
  check('and every one of them lands somewhere you can see it land',
    beams.every(b => b.foot.cx > 8 && b.foot.cx < W - 8 &&
                     b.foot.left > -20 && b.foot.right < W + 20), { beams, W });

  // Inside a shaft is lit; the air between two of them is not. The dark
  // sample is SEARCHED FOR rather than guessed at a fixed offset,
  // because the shafts very nearly tile the sky at mid height - a
  // stride to the right of one is often inside the next, which is a
  // fact about the picture rather than a fault in it.
  const litTest = await page.evaluate(() => {
    const d = window.__woodDebug, W = window.innerWidth;
    const y = window.innerHeight * 0.5, t = 0.5;
    const i = Math.floor(d.gaps.length / 2);
    const span = d.scene.gapSpan(d.gaps[i], t);
    let darkX = null;
    for (let x = 2; x < W; x += 2) { if (d.inBeam(x, y) === 0) { darkX = x; break; } }
    return {
      inside: d.inBeam((span.left + span.right) / 2, y),
      darkX: darkX,
      dark: darkX === null ? null : d.inBeam(darkX, y)
    };
  });
  check('a point inside a shaft is in the light', litTest.inside > 0, litTest);
  check('and there is air between them that is not',
    litTest.darkX !== null && litTest.dark === 0, litTest);

  // ...and it is REALLY DRAWN. Everything above would pass with the
  // beam layer never cleared onto the screen. Two patches of air at the
  // same height, one inside the middle shaft and one beside it: the lit
  // one has to come back brighter.
  //
  // The control is THE SAME PATCH with the beam layer hidden, not a
  // different patch of sky beside it. The first version of this check
  // compared two bits of backdrop and passed with the beams drawn at
  // zero alpha, which is precisely the failure it existed to catch.
  //
  // The patch is high up the shaft, where the light is strongest, and
  // found rather than guessed: a trunk standing in front of a beam
  // occludes it, and the first spot picked by eye was on one.
  const pixels = await (async () => {
    const box = await page.evaluate(() => {
      const d = window.__woodDebug, b = d.bounds(), H = window.innerHeight;
      const trees = Object.keys(d.props).map(k => b[k]);
      const t = 0.2, y = H * 0.04 + H * 0.92 * t;
      for (var i = 0; i < d.gaps.length; i++) {
        const span = d.scene.gapSpan(d.gaps[i], t);
        for (var x = span.left + 5; x < span.right - 5; x += 3) {
          const behindTree = trees.some(r =>
            x > r.left - 4 && x < r.right + 4 && y > r.top && y < r.bottom);
          if (!behindTree) return { gap: i, x: x, y: y, w: 16 };
        }
      }
      return null;
    });
    if (!box) return { box: null };
    const lit = await meanOf(page, box.x - box.w / 2, box.y, box.w, 40);
    const litWhole = await meanOf(page, 0, 0, 390, 844);
    await page.evaluate(() => window.__woodDebug.scene.beamGfx.setVisible(false));
    await page.waitForTimeout(160);
    const unlit = await meanOf(page, box.x - box.w / 2, box.y, box.w, 40);
    const unlitWhole = await meanOf(page, 0, 0, 390, 844);
    await page.evaluate(() => window.__woodDebug.scene.beamGfx.setVisible(true));
    await page.waitForTimeout(160);
    return { lit, unlit, litWhole, unlitWhole, box };
  })();
  check('there is air in a shaft that no trunk is standing in front of',
    pixels.box !== null, pixels);
  check('and the shafts are really drawn: that air goes dark without them',
    pixels.lit > pixels.unlit + 3, pixels);
  // ...and it is not one lucky patch. The whole frame dims when the
  // beam layer goes, because a quarter of it is standing in one.
  check('and so does the whole picture',
    pixels.litWhole > pixels.unlitWhole + 0.8, pixels);

  // ...and there is NO MOON. The light has a source - everything in
  // here is lit from up and to the right - and you never see it, which
  // is the whole mood of the place. A disc in the sky is the one thing
  // that would undo it, and it is also the easiest thing to put back by
  // accident, so it gets a number: the brightest patch of sky reads
  // around 30 as it stands and around 180 with a moon in it.
  const sky = await page.evaluate(() => new Promise(res => {
    const s = window.__woodDebug.scene;
    const h = Math.round(window.__woodDebug.bounds().horizon);
    s.game.renderer.snapshotArea(0, 0, window.innerWidth, h, img => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      // The brightest 16x16 tile, because that is the shape of a moon.
      let best = 0;
      for (let ty = 0; ty + 16 <= c.height; ty += 8) {
        for (let tx = 0; tx + 16 <= c.width; tx += 8) {
          let t = 0;
          for (let y = ty; y < ty + 16; y++) {
            for (let x = tx; x < tx + 16; x++) {
              const i = (y * c.width + x) * 4;
              t += (px[i] + px[i + 1] + px[i + 2]) / 3;
            }
          }
          if (t / 256 > best) best = t / 256;
        }
      }
      res({ brightestTile: +best.toFixed(1) });
    });
  }));
  check('and nothing in the sky is bright enough to be the moon making them',
    sky.brightestTile < 70, sky);

  // --- something is looking at you ------------------------------------------
  // It comes and goes on its own. What can be WRONG about it rather than
  // merely random is where it is drawn: up in the sky it is a star, down
  // on the path it is a torch.
  const eyes = await page.evaluate(() => new Promise(res => {
    const d = window.__woodDebug;
    d.scene.eyes.on = false; d.scene.eyes.wait = 0.2;
    // Counted as a SEQUENCE, not as a tally: an 'off' sample before
    // they have ever been on is the state the watch started in, and a
    // pair that opens and never closes again would produce one too.
    const seen = { on: 0, offAfterOn: 0, spots: {}, everOn: false };
    const iv = setInterval(() => {
      const e = d.eyes();
      if (e.on) { seen.on++; seen.everOn = true; seen.spots[e.at] = 1; }
      else if (seen.everOn) seen.offAfterOn++;
    }, 100);
    setTimeout(() => { clearInterval(iv); res(seen); }, 18000);
  }));
  check('something out there opens its eyes', eyes.on > 0, eyes);
  check('and closes them again afterwards', eyes.offAfterOn > 0, eyes);
  // Where they were actually drawn, read off the scene rather than
  // worked out a second time here - a check that recomputes the thing
  // it is checking only ever agrees with itself. Every spot on the list
  // has to land in the band of dark just above the ground, and on
  // screen: up in the sky they are a star, down on the path they are a
  // torch somebody is holding.
  const eyePlaces = await page.evaluate(() => new Promise(res => {
    const d = window.__woodDebug, s = d.scene;
    const horizon = d.bounds().horizon, W = window.innerWidth;
    const out = { horizon: horizon, width: W, seen: [] };
    let i = 0;
    const iv = setInterval(() => {
      // Walk the list rather than wait for chance to visit all of it.
      s.eyes.on = true; s.eyes.age = 1.4; s.eyes.at = i % d.eyes().spots;
      setTimeout(() => {
        const e = d.eyes();
        out.seen.push({ at: e.at, x: Math.round(e.x), y: Math.round(e.y) });
        if (++i >= d.eyes().spots) { clearInterval(iv); res(out); }
      }, 60);
    }, 160);
  }));
  check('every pair it can draw sits in the dark just above the ground',
    eyePlaces.seen.length >= 4 &&
    eyePlaces.seen.every(e => e.y < eyePlaces.horizon && e.y > eyePlaces.horizon * 0.7),
    eyePlaces);
  check('and on the screen rather than off the side of it',
    eyePlaces.seen.every(e => e.x > 6 && e.x < eyePlaces.width - 6), eyePlaces);

  // --- the wood is a wood ---------------------------------------------------
  await page.goto(ctx.url('wood.html'));
  await page.waitForTimeout(BOOT_MS);

  const said = {};
  for (const thing of ['log', 'stone', 'treeF']) said[thing] = await standAt(page, thing);
  check('standing at each thing out here says what it is',
    Object.keys(said).every(k => typeof said[k].prompt === 'string' && said[k].prompt.length > 0),
    said);
  check('and no two of them say the same thing',
    new Set(Object.keys(said).map(k => said[k].prompt)).size === Object.keys(said).length, said);
  check('none of it is a thing you can press',
    Object.keys(said).every(k => said[k].action === null), said);

  const open = await page.evaluate(() => {
    window.__woodDebug.moveTo(-0.2, 0.88);
    return new Promise(res => setTimeout(() => res(window.__woodDebug.state()), 240));
  });
  check('and the open ground between them is not standing at anything',
    open.prompt === null, open);

  // --- the trees are solid --------------------------------------------------
  const solid = await page.evaluate(() => {
    const d = window.__woodDebug, s = d.scene;
    const out = { own: {}, inFront: {} };
    Object.keys(d.props).forEach(k => {
      const q = d.props[k];
      out.own[k] = s.blockedAt(q.worldX, q.depth);
      out.inFront[k] = s.blockedAt(q.worldX, q.depth + 0.14);
    });
    return out;
  });
  check('every trunk is solid',
    Object.keys(solid.own).every(k => solid.own[k] === k), solid);
  check('and you can still stand in front of all of them',
    Object.keys(solid.inFront).every(k => solid.inFront[k] === null), solid);

  const intoLog = await walkHolding(page, [-0.4, 0.88], ['ArrowUp'], 2600);
  check('walking into the fallen trunk stops you in front of it',
    intoLog.end.depth > 0.66 && intoLog.end.mode === 'walk', intoLog);
  check('and never inside it', intoLog.insideAt === null, intoLog);

  // Sideways into a standing trunk, which is the other axis and a
  // separate check - resolving only the one you happen to test leaves
  // the wood solid in one direction and open in the other.
  const alongTree = await walkHolding(page, [0.1, 0.70], ['ArrowRight'], 2000);
  check('and walking sideways into a trunk stops you too',
    alongTree.end.gone !== true && alongTree.end.worldX < 0.46 &&
    alongTree.insideAt === null, alongTree);

  // Diagonally at it: blocked on one axis, free on the other, so you
  // slide past instead of stopping dead. Without that a player who holds
  // a diagonal just stops, which reads as the game hanging.
  const roundTree = await walkHolding(page, [0.5, 0.9], ['ArrowUp', 'ArrowLeft'], 2200);
  check('but a diagonal slides you round it rather than sticking',
    roundTree.end.gone === true || roundTree.end.depth < 0.75, roundTree);

  // --- the way back ---------------------------------------------------------
  await page.goto(ctx.url('wood.html'));
  await page.waitForTimeout(BOOT_MS);

  const nearEdge = await page.evaluate(() => {
    window.__woodDebug.moveTo(0.86, 0.8);
    return new Promise(res => setTimeout(() => res(window.__woodDebug.state()), 240));
  });
  check('the open side of the wood says the yard is through it',
    /yard/i.test(nearEdge.prompt || ''), nearEdge);

  // Mid-walk, the scene must still read 'walk' right up to the cut -
  // there is no leaving sequence to be in.
  const modes = await (async () => {
    await page.evaluate(() => window.__woodDebug.moveTo(0.4, 0.74));
    await page.waitForTimeout(140);
    await page.keyboard.down('ArrowRight');
    const seen = new Set();
    const started = Date.now();
    while (Date.now() - started < 3500) {
      const st = await readState(page);
      if (st.gone) break;
      seen.add(st.mode);
      if (st.mode === 'gone') break;
      await page.waitForTimeout(40);
    }
    await page.keyboard.up('ArrowRight').catch(() => {});
    return [...seen];
  })();
  check('walking out of the trees is a cut, with no leaving sequence',
    modes.indexOf('leaving') === -1, modes);
  check('and lands on the lawn', await reachedPage(page, 'yard.html', 6000), page.url());
  const handover = new URL(page.url());
  check('carrying the depth you were walking at across with you',
    handover.searchParams.get('from') === 'wood' &&
    Math.abs(parseFloat(handover.searchParams.get('d')) - 0.74) < 0.1, page.url());

  // Coming the other way. You arrive at the side you walked in through,
  // at the depth you were walking at - and crucially NOT balanced on the
  // line, which would hand you straight back where you came from.
  // 0.54 is not a round number for the sake of it: it is the one depth
  // at which the boundary stone is standing exactly where you would
  // come in, and it is the only one of these that exercises the step
  // forward onto clear ground. Without it that guard is code nothing
  // can prove.
  for (const d of [0.3, 0.54, 0.66, 0.88]) {
    await page.goto(ctx.url(`wood.html?from=yard&d=${d}`));
    await page.waitForTimeout(BOOT_MS);
    const arrived = await readState(page);
    check(`coming in at depth ${d} puts you at the lawn side of the wood`,
      arrived.gone !== true && arrived.worldX > 0.6, arrived);
    check(`...on ground rather than in a tree`, arrived.blockedBy === null, arrived);
    check(`...a walk clear of the line you came through`, arrived.worldX < 0.95, arrived);
    // At the depth you were walking at, or a step nearer if that depth
    // would have put you in a tree - never further back, and never at
    // some spot the page picked for itself.
    check(`...at the depth you were walking at, give or take a step out of the way`,
      arrived.depth >= d - 0.001 && arrived.depth - d < 0.26, { d, arrived });
  }

  await page.goto(ctx.url('wood.html?from=yard&d=nonsense'));
  await page.waitForTimeout(BOOT_MS);
  const nonsense = await readState(page);
  check('and a depth that is not a number lands you somewhere real',
    nonsense.gone !== true && nonsense.depth > 0.05 && nonsense.depth < 0.95 &&
    nonsense.blockedBy === null, nonsense);

  // --- the deep end refuses -------------------------------------------------
  // The one direction in the chapter that says no. A wall you can see is
  // scenery; a wall you cannot is a bug, so it has to SAY so - and it
  // must not quietly become a third exit.
  await page.goto(ctx.url('wood.html'));
  await page.waitForTimeout(BOOT_MS);
  const deep = await walkHolding(page, [-0.4, 0.7], ['ArrowLeft'], 4000);
  check('walking deeper in does not take you anywhere', deep.end.gone !== true, deep);
  check('it stops you at the edge of the scene', deep.end.worldX < -0.98, deep);
  check('and says why, rather than just stopping',
    typeof deep.end.prompt === 'string' && deep.end.prompt.length > 0, deep);
  check('and the page has not moved', /wood\.html/.test(page.url()), page.url());

  // The Out button and Escape are the same escape hatch the other scenes
  // have, and both go back to the lawn.
  await page.goto(ctx.url('wood.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.click('#outBtn');
  check('the Out button goes back to the yard',
    await reachedPage(page, 'yard.html', 6000), page.url());

  await page.goto(ctx.url('wood.html'));
  await page.waitForTimeout(BOOT_MS);
  await page.keyboard.press('Escape');
  check('and so does Escape', await reachedPage(page, 'yard.html', 6000), page.url());

  // --- it is drawn to scale -------------------------------------------------
  await page.goto(ctx.url('wood.html'));
  await page.waitForTimeout(BOOT_MS);

  const scale = await page.evaluate(() => {
    const b = window.__woodDebug.bounds();
    const h = k => b[k].bottom - b[k].top;
    const person = h('you');
    const out = { person: Math.round(person) };
    ['treeA', 'treeB', 'treeC', 'treeD', 'treeE', 'treeF', 'log', 'stone']
      .forEach(k => { out[k] = +(h(k) / person).toFixed(2); });
    return out;
  });
  check('the figure is the same person who walked off the lawn, not a speck',
    scale.person > 28 && scale.person < 70, scale);
  // Trees are the one thing in this chapter that SHOULD tower over you.
  check('every tree towers over them, as a tree does',
    ['treeA', 'treeB', 'treeC', 'treeD', 'treeE', 'treeF'].every(k => scale[k] > 3), scale);
  check('and the nearest is the biggest, because it is the nearest',
    scale.treeF > scale.treeA, scale);
  check('the fallen one comes up to about the knee', scale.log < 0.8, scale);
  check('and the boundary stone is not a standing stone', scale.stone < 1.2, scale);

  // Nothing may stand under the thumb controls, and nothing may be drawn
  // off the side of the picture.
  const layout = await page.evaluate(() => {
    const b = window.__woodDebug.bounds(), W = window.innerWidth;
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
      if (k === 'horizon') return;
      if (overlaps(b[k], stick)) res.onStick.push(k);
      if (overlaps(b[k], out)) res.onOut.push(k);
      if (b[k].right < 12 || b[k].left > W - 12) res.offPicture.push(k);
    });
    return res;
  });
  check('you do not start standing under the thumb controls',
    layout.onStick.indexOf('you') === -1 && layout.onOut.indexOf('you') === -1, layout);
  check('and nothing you walk up to stands under them either',
    layout.onStick.indexOf('log') === -1 && layout.onStick.indexOf('stone') === -1 &&
    layout.onOut.indexOf('log') === -1 && layout.onOut.indexOf('stone') === -1, layout);
  check('nothing in the wood is off the side of the picture',
    layout.offPicture.length === 0, layout);

  check('no page errors after full run', errors.length === 0, errors);
}, { page: 'wood.html' });
