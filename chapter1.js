// Chapter 1, as one game: the yard, Head-On, the descent and Main
// Street, played straight through. Each is still its own page with its
// own way of staying alive (a shield up there, lives down here) and its
// own retry; this file is what joins them up:
//
//   - where you have got to, so a closed tab or a game over can pick up
//     from the start of the last stage you reached instead of the top;
//   - one running score: each stage's own, added up, with the total
//     carried into the next;
//   - the inventory: things picked up along the way (to come - it
//     starts at the house), kept for the rest of the chapter.
//
// All of it in one localStorage record, so it survives closing the tab.
// It is separate from the house's sessionStorage world (doors, the cat,
// the letter), which is about the rooms, not the run.
//
// A stage counts toward the chapter only when it was reached the
// chapter's way - off the yard, out of the boss fight, down from the
// landing (the pages pass ?from= along). Opened on its own for practice,
// a page plays as before and leaves the chapter alone.
(function () {
  "use strict";

  var KEY = 'broccoli-chapter1-save-v1';
  // In order. 'done' is past the last: through the door in the spire.
  var STAGES = ['yard', 'head-on', 'descent', 'street', 'done'];
  var NAMES = { 'yard': 'The yard', 'head-on': 'Head-On', 'descent': 'The descent', 'street': 'Main Street', 'done': 'The spire' };
  // Where each stage starts, as the chapter goes into it.
  var PAGES = {
    'head-on': function () { return 'head-on.html?from=yard'; },
    'descent': function (total) { return 'descent.html?from=head-on&score=' + total; },
    'street': function (total) { return 'main-street.html?from=descent&score=' + total; }
  };

  function fresh() {
    // `total` is the chapter's total so far: what the stage being played
    // started on, or what the last one finished on. Each stage builds on
    // the total it was entered with - the one it was handed - so the
    // running score is right even if the per-stage record is not whole.
    return { v: 1, stage: 'yard', scores: {}, entry: {}, total: 0, inventory: [], started: Date.now(), updated: Date.now() };
  }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1 && STAGES.indexOf(s.stage) >= 0) {
        s.scores = s.scores || {}; s.entry = s.entry || {}; s.inventory = s.inventory || [];
        if (typeof s.total !== 'number') s.total = 0;
        return s;
      }
    } catch (e) {}
    return fresh();
  }

  function save(s) {
    s.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  function rank(stage) { return STAGES.indexOf(stage); }

  // The total going into `stage`: every stage before it, added up.
  function totalBefore(s, stage) {
    var t = 0;
    for (var i = 1; i < rank(stage); i++) t += s.scores[STAGES[i]] || 0;
    return t;
  }

  var Chapter1 = {
    STAGES: STAGES.slice(),
    name: function (stage) { return NAMES[stage] || stage; },
    state: function () { return load(); },

    // Off the yard and into the sky: a new run through the chapter's
    // stages. The scores start again; what you picked up stays.
    begin: function () {
      var s = load(), inv = s.inventory;
      s = fresh();
      s.inventory = inv;
      s.stage = 'head-on';
      s.entry['head-on'] = 0;
      return save(s);
    },

    // Into `stage`, the chapter's way, with `total` carried in.
    enter: function (stage, total) {
      var s = load();
      if (rank(stage) > rank(s.stage)) s.stage = stage;
      s.entry[stage] = total || 0;
      s.total = s.entry[stage];
      delete s.scores[stage];
      return save(s);
    },

    // Through `stage` with `score` of its own. Returns the new total.
    finish: function (stage, score) {
      var s = load();
      s.scores[stage] = Math.max(0, Math.round(score || 0));
      var from = s.entry[stage] != null ? s.entry[stage] : totalBefore(s, stage);
      s.total = from + s.scores[stage];
      var next = STAGES[rank(stage) + 1];
      if (next && rank(next) > rank(s.stage)) s.stage = next;
      if (next) s.entry[next] = s.total;
      save(s);
      return s.total;
    },

    // Every stage's own score, in order, and the lot added up.
    breakdown: function () {
      var s = load(), rows = [];
      for (var i = 1; i < STAGES.length - 1; i++) {
        var st = STAGES[i];
        if (s.scores[st] == null) continue;
        rows.push({ stage: st, name: NAMES[st], score: s.scores[st] });
      }
      return { rows: rows, total: s.total };
    },

    // Where to carry on from: the start of the furthest stage reached
    // (with the total that stage started on), or null if there is
    // nothing to carry on - not started, or all the way through.
    resume: function () {
      var s = load();
      if (!PAGES[s.stage]) return null;
      var total = s.entry[s.stage] != null ? s.entry[s.stage] : totalBefore(s, s.stage);
      return { stage: s.stage, name: NAMES[s.stage], url: PAGES[s.stage](total), total: total };
    },

    // Starting again from the yard: progress and scores go. The
    // inventory too, unless asked to keep it.
    reset: function (keepInventory) {
      var s = load(), inv = s.inventory;
      s = fresh();
      if (keepInventory) s.inventory = inv;
      return save(s);
    },

    // ---- The inventory (for what's to come) ------------------------
    // Items are plain records: { id, name, from } and anything else a
    // stage wants to note. One of each id.
    inventory: function () { return load().inventory.slice(); },
    has: function (id) { return load().inventory.some(function (it) { return it.id === id; }); },
    give: function (item) {
      var s = load();
      if (!item || !item.id || s.inventory.some(function (it) { return it.id === item.id; })) return false;
      s.inventory.push(item);
      save(s);
      return true;
    },
    take: function (id) {
      var s = load(), n = s.inventory.length;
      s.inventory = s.inventory.filter(function (it) { return it.id !== id; });
      save(s);
      return s.inventory.length < n;
    },

    KEY: KEY
  };

  window.Chapter1 = Chapter1;
})();
