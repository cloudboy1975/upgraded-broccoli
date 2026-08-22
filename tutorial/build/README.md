# Tutorial page generator

This is an authoring convenience only. `tutorial/lessons/*.html` are
plain static files, same as every other page in this repo &mdash; nobody
needs this generator, Python, or any build step to view the site.

It exists so a lesson is a data entry, not a hand-copied HTML page: the
markup that's identical across every lesson (page head, crumbs, the "Try
it" iframe block, the "Full source so far" disclosure, the prev/next nav)
lives once, in `template.html`. Content that differs per lesson (title,
subtitle, the body copy and code snippets, which checkpoint it demos, its
place in the prev/next chain) lives in `lessons.json`.

## Files

- `lessons.json` &mdash; the data. One object per lesson: `id`, `number`,
  `group` (`"core"` or `"bonus"`), `groupTotal`, `title`, `subtitle`
  (HTML), `body` (HTML &mdash; everything between the subtitle and the "Try
  it" section: your own `<h2>`/`<p>`/`.code-panel` blocks), `demoNote`
  (the "Try it" paragraph), `prevId`/`nextId` (another lesson's `id`, or
  omit `nextId` on the most recently written lesson), and
  `nextPendingTitle` (only needed when `nextId` is omitted &mdash; renders a
  non-link "N. Title &mdash; coming soon" placeholder instead of a dangling
  link).
- `template.html` &mdash; the shared shell, with `__PLACEHOLDER__` tokens.
- `generate.py` &mdash; reads both, plus the matching file in
  `tutorial/checkpoints/<id>.html` (for the full-source disclosure, HTML-
  escaped automatically), and writes `tutorial/lessons/<id>.html`.

## Adding a lesson

1. Write its checkpoint first: `tutorial/checkpoints/<id>.html`, a real,
   complete, runnable single-file game reflecting the state through that
   lesson.
2. Append an entry to `lessons.json`. Set the *previous* last lesson's
   `nextId` to your new lesson's `id` (and drop its `nextPendingTitle`);
   give your new entry no `nextId` yet, and a `nextPendingTitle` guessing
   the lesson after it.
3. Run `python3 tutorial/build/generate.py` from the repo root (or
   anywhere &mdash; paths are relative to this file).
4. Verify the regenerated page: it should load with zero console errors,
   its iframe should render the checkpoint's canvas, and its "Full source
   so far" disclosure should be byte-identical to the checkpoint file.

Editing shared structure (the nav footer, the disclosure markup, adding a
new field every lesson needs) means editing `template.html`/`generate.py`
once and regenerating &mdash; not touching 18 files by hand.
