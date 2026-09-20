// Shared harness for the head-on.html browser tests.
//
// Every test file is a plain Node script driving a real Chromium page
// through Playwright - there is no test framework here on purpose. The
// game is one self-contained HTML file with no build step, so its tests
// stay equally direct: a file runs, prints PASS/FAIL lines, and exits
// non-zero if anything failed. run.sh runs them all.
//
// This module owns only the boilerplate every file repeats: finding
// Playwright and a browser wherever this happens to be checked out,
// opening the game with a clean tuning store, and counting results.

function loadPlaywright() {
  var candidates = [
    'playwright',
    'playwright-core',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright'
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { return require(candidates[i]); } catch (e) { /* try the next one */ }
  }
  throw new Error(
    'Playwright not found. Install it (npm i -D playwright) or point NODE_PATH at it.'
  );
}

// Some environments ship a browser at a fixed path with downloads
// disabled; others let Playwright manage its own. Try the pinned one and
// fall back to whatever Playwright resolves by itself.
async function launch(chromium) {
  var pinned = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  try {
    var fs = require('fs');
    if (fs.existsSync(pinned)) return await chromium.launch({ executablePath: pinned });
  } catch (e) { /* fall through */ }
  return await chromium.launch();
}

var URL = process.env.HEADON_URL || 'http://127.0.0.1:8778/head-on.html';

// Opens the game with a clean tuning store. A saved blob from a previous
// session would otherwise mask the defaults a test is asserting against -
// and it masks them PER KEY, so the failure looks like a logic bug rather
// than stale state.
async function openGame(page) {
  await page.goto(URL);
  await page.evaluate(function () {
    try { localStorage.removeItem('headon-tuning-v1'); } catch (e) {}
  });
  await page.reload();
  await page.waitForTimeout(500);
}

function makeChecker() {
  var pass = 0, fail = 0;
  function check(name, cond, extra) {
    if (cond) { pass++; console.log('PASS', name); }
    else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  }
  check.summary = function () {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    return fail;
  };
  return check;
}

// The standard shape of a test file: harness.run(async (page, check, ctx) => { ... }).
// Page errors are collected for you in ctx.errors; the favicon 404 every
// page logs is filtered out, since it is not the game's doing.
function run(body) {
  var chromium = loadPlaywright().chromium;
  (async function () {
    var browser = await launch(chromium);
    var page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    var errors = [];
    page.on('pageerror', function (e) { errors.push(String(e)); });
    page.on('console', function (m) {
      if (m.type() === 'error' && m.text().indexOf('favicon') === -1 && m.text().indexOf('404') === -1) {
        errors.push(m.text());
      }
    });
    var check = makeChecker();
    await openGame(page);
    var threw = null;
    try {
      await body(page, check, { errors: errors });
    } catch (e) {
      // Reported as a failure rather than swallowed by the summary - a
      // file that dies half way through has NOT passed the checks it
      // never reached, and exiting 0 there would hide a real break.
      threw = e;
      console.error('TEST ERROR', e && e.stack ? e.stack : e);
    }
    var failed = check.summary();
    await browser.close();
    process.exit(failed || threw ? 1 : 0);
  })().catch(function (e) {
    console.error('TEST ERROR', e);
    process.exit(1);
  });
}

module.exports = { run: run, URL: URL };
