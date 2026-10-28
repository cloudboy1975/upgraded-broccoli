// Chapter 1 as one game (chapter1.js): the yard, Head-On, the descent
// and Main Street joined up - where you have got to (so you can carry on
// from it), one running score, and an inventory kept for the chapter.
//
// The record itself first, then each page's part in it: the yard begins
// a run and offers to carry on; Head-On hands its score down; the
// descent counts in, shows the total, and steps outside on its own once
// landed; Main Street ends the chapter with every stage's score added up.
const harness = require('./harness');

const D = (page, fn, arg) => page.evaluate(fn, arg);

async function reached(page, name, timeout) {
  try { await page.waitForURL('**/' + name + '*', { timeout: timeout }); return true; } catch (e) { return false; }
}

harness.run(async (page, check, ctx) => {
  // ---- The record ----------------------------------------------------
  const api = await D(page, () => {
    const c = window.Chapter1, out = {};
    c.reset();
    out.fresh = c.state().stage;
    out.noResume = c.resume();
    c.give({ id: 'torch', name: 'Torch', from: 'house' });
    c.begin();
    out.begun = c.state();
    out.t1 = c.finish('head-on', 1000);
    out.r1 = c.resume();
    c.enter('descent', 1000);
    out.t2 = c.finish('descent', 500);
    out.r2 = c.resume();
    // The descent tried again: its own score starts again.
    out.retry = (c.enter('descent', 1000), c.state().scores.descent);
    c.finish('descent', 500);
    c.enter('street', 1500);
    out.t3 = c.finish('street', 2000);
    out.done = c.state().stage;
    out.r3 = c.resume();
    out.b = c.breakdown();
    out.has = c.has('torch');
    out.dup = c.give({ id: 'torch', name: 'Torch' });
    out.inv = c.inventory().length;
    c.begin();
    out.keptOnBegin = c.inventory().length;
    out.took = c.take('torch');
    c.give({ id: 'torch' });
    c.reset();
    out.afterReset = c.inventory().length;
    // Handed a total with no record of how it was made (carried on from
    // a link, say): the stage still builds on what it was handed.
    c.enter('descent', 4321);
    out.handed = c.finish('descent', 100);
    out.handedTotal = c.breakdown().total;
    c.reset();
    return out;
  });
  check('a fresh chapter starts at the yard, with nothing to carry on', api.fresh === 'yard' && api.noResume === null, api);
  check('off the yard: a new run, at Head-On, scores clear', api.begun.stage === 'head-on' && Object.keys(api.begun.scores).length === 0, api.begun);
  check('through Head-On: its score is the total going on to the descent', api.t1 === 1000 && api.r1.stage === 'descent' && api.r1.url === 'descent.html?from=head-on&score=1000', api.r1);
  check('...through the descent: added on, carried into Main Street', api.t2 === 1500 && api.r2.url === 'main-street.html?from=descent&score=1500', api.r2);
  check('...a stage tried again starts its own score again', api.retry === undefined, api.retry);
  check('...through Main Street: the chapter done, nothing left to carry on', api.t3 === 3500 && api.done === 'done' && api.r3 === null, api);
  check('...every stage\'s score, in order, and the lot added up',
    api.b.total === 3500 && api.b.rows.map((r) => r.stage + ':' + r.score).join() === 'head-on:1000,descent:500,street:2000', api.b);
  check('the inventory: things kept, one of each', api.has && !api.dup && api.inv === 1, api);
  check('...kept through a new run off the yard; gone when the chapter is started over', api.keptOnBegin === 1 && api.took && api.afterReset === 0, api);
  check('a stage builds on the total it was handed, whatever the record holds', api.handed === 4421 && api.handedTotal === 4421, api);

  // ---- The yard: carry on, or begin -----------------------------------
  await D(page, () => { const c = window.Chapter1; c.reset(); c.begin(); c.finish('head-on', 1000); });
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(600);
  const chip = await D(page, () => {
    const el = document.getElementById('continueChip');
    return { shown: getComputedStyle(el).display !== 'none', text: el.textContent, href: el.getAttribute('href') };
  });
  check('the yard offers to carry on from the stage you had got to', chip.shown && /descent/i.test(chip.text) && chip.href === 'descent.html?from=head-on&score=1000', chip);
  await page.click('#flyBtn');
  const flew = await reached(page, 'head-on.html?from=yard', 5000);
  check('flying off the yard goes to Head-On as the chapter', flew, page.url());
  const begun = await D(page, () => window.Chapter1.state());
  check('...as a new run through it', begun.stage === 'head-on' && Object.keys(begun.scores).length === 0, begun);

  await D(page, () => window.Chapter1.reset());
  await page.goto(ctx.url('yard.html'));
  await page.waitForTimeout(600);
  const none = await D(page, () => getComputedStyle(document.getElementById('continueChip')).display);
  check('...and with nothing to carry on, no offer', none === 'none', none);

  // ---- Head-On hands down its score -----------------------------------
  await page.goto(ctx.url('head-on.html?from=yard'));
  await page.waitForFunction(() => !!(window.__headOnDebug && window.__headOnDebug.scene), null, { timeout: 10000 });
  const handed = await D(page, () => {
    window.Chapter1.reset(); window.Chapter1.begin();
    const total = window.__headOnDebug.scene.finishForChapter(4321);
    return { total, st: window.Chapter1.state() };
  });
  check('Head-On through: its score goes down to the descent as the chapter\'s total', handed.total === 4321 && handed.st.stage === 'descent' && handed.st.scores['head-on'] === 4321, handed);

  // ---- The descent counts in, shows the total, steps outside ---------
  await page.goto(ctx.url('descent.html?from=head-on&score=4321'));
  await page.waitForFunction(() => !!window.__descentDebug, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  let run = await D(page, () => ({ run: window.__descentDebug.run(), st: window.Chapter1.state() }));
  check('the descent, come down the chapter\'s way, is counted in', run.st.stage === 'descent' && run.st.entry.descent === 4321, run.st);
  check('...and shows the chapter\'s running total: carried in plus metres flown', run.run.total >= 4321 && /^total /.test(run.run.totalShown), run.run);
  await D(page, () => { const d = window.__descentDebug; d.holdLeave(); d.setInvincible(true); d.startCity('landing'); });
  await page.waitForFunction(() => window.__descentDebug.leftFor, null, { timeout: 60000 }).catch(() => {});
  run = await D(page, () => ({ left: window.__descentDebug.leftFor, overlay: window.__descentDebug.state().overlay, st: window.Chapter1.state() }));
  const flown = run.st.scores.descent;
  check('landed, it steps outside on its own: no end screen, on to Main Street',
    run.left === 'main-street.html?from=descent&score=' + (4321 + flown) && !run.overlay, run);
  check('...with the descent through, its metres as its score', run.st.stage === 'street' && flown > 0 && run.st.entry.street === 4321 + flown, run.st);

  // ---- Main Street ends the chapter ------------------------------------
  const into = 4321 + flown;
  await page.goto(ctx.url('main-street.html?from=descent&score=' + into));
  await page.waitForFunction(() => !!window.__streetDebug, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  let st = await D(page, () => window.Chapter1.state());
  check('Main Street, come out of the landing, is counted in', st.stage === 'street' && st.entry.street === into, st);
  await D(page, () => { const d = window.__streetDebug; d.jumpTo(d.constants().tuning.STREET_END_M); d.setInvincible(true); d.setSpawning(false); });
  await page.waitForFunction(() => window.__streetDebug.state().boss, null, { timeout: 10000 }).catch(() => {});
  await D(page, () => { const d = window.__streetDebug; d.clear(); d.killBoss(); d.setPlayer(0, d.state().wallD); });
  await page.waitForFunction(() => window.__streetDebug.state().overlay, null, { timeout: 15000 }).catch(() => {});
  const end = await D(page, () => ({ s: window.__streetDebug.state(), line: document.getElementById('overLine').textContent, st: window.Chapter1.state(), b: window.Chapter1.breakdown() }));
  check('through the door: the chapter done, its score kept', end.s.mode === 'won' && end.st.stage === 'done' && end.st.scores.street === end.s.score, end.st);
  check('...and the end screen adds up every stage: Chapter 1, in total',
    end.b.total === into + end.s.score && end.line.indexOf('Chapter 1: ' + end.b.total.toLocaleString()) >= 0 && /Head-On/.test(end.line) && /descent/.test(end.line), { line: end.line, b: end.b });

  await D(page, () => window.Chapter1.reset());
  check('no page errors', ctx.errors.length === 0, ctx.errors);
}, { page: 'yard.html' });
