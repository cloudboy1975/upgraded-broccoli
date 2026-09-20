# head-on.html tests

Browser tests for `head-on.html`, driven by Playwright against a real
Chromium page. There is no test framework: each file is a plain Node
script that prints `PASS`/`FAIL` lines and exits non-zero if anything
failed. The game is one self-contained HTML file with no build step, so
its tests stay equally direct.

## Running

```sh
./tests/run.sh
```

It serves the repo on `127.0.0.1:8778` if nothing is there already, runs
every `test-*.js`, and exits non-zero if any file failed. To point at a
server you're already running:

```sh
HEADON_URL=http://127.0.0.1:8778/head-on.html ./tests/run.sh
```

A single file:

```sh
node tests/test-challenge-stage.js
```

## Requirements

Playwright and a Chromium. `harness.js` looks for Playwright as a normal
module first and then at a couple of common global install paths, and for
a browser at `$CHROMIUM_PATH` or `/opt/pw-browsers/chromium` before
falling back to whatever Playwright resolves itself. If it can't find
Playwright:

```sh
npm i -D playwright && npx playwright install chromium
```

## Writing a test

```js
const harness = require('./harness');

harness.run(async (page, check, ctx) => {
  check('the thing holds', await page.evaluate(() => /* ... */ true));
  check('no page errors after full run', ctx.errors.length === 0, ctx.errors);
});
```

`harness.run` opens the game with a cleared tuning store (a saved blob
masks defaults **per key**, which makes failures look like logic bugs),
collects page errors into `ctx.errors`, prints the summary and sets the
exit code.

### What has actually caught bugs here

Worth knowing before adding to this, because each of these came from a
real miss rather than from a style guide:

- **Assert the axis the user is describing.** A whole round of work once
  verified rotation exhaustively while the actual reported problem was a
  50px positional jump. Rotation was smooth; nobody had measured
  position.
- **Test the integration path, not just the unit.** Every challenge-stage
  test reached a stage through the debug hook, so a mutation that stopped
  waves ever *producing* a stage passed all 57 checks. The route that
  makes the feature exist needs its own test.
- **Mutation-test new assertions.** Break the mechanism on purpose and
  confirm the test fails, then restore from a snapshot and `diff` to
  prove the source is untouched. An assertion that has never failed has
  not been shown to work.
- **Read live `TUNING`, not `defaults()`.** `TUNING` is seeded at load
  from `var` constants, so a key whose constant sits lower in the file
  arrives `undefined` through hoisting - and `defaults()` called later
  looks perfectly fine. `test-challenge-stage.js` has a standing guard
  for this.
- **Assert intent, not a blinking sprite.** Things that flash during
  respawn invulnerability sample dark at random. Check the state flag the
  animation is derived from.
