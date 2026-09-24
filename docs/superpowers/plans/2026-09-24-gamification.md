# Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add streaks, XP, level titles and spaced-review nudges to the static Product Thinking course, persisted in localStorage, with a course home page.

**Architecture:** One vanilla JS module (`assets/progress.js`) holds pure transition functions plus thin storage and DOM wrappers, and is loaded both by the browser (as `window.PTProgress`) and by Node tests (as `module.exports`). The existing `assets/quiz.js` calls into it after a quiz completes and when a rewrite is revealed. A new root `index.html` renders the lesson list and statuses from the same module.

**Tech Stack:** Plain HTML, CSS, ES5-style JavaScript, Node 22 built-in test runner (`node --test`). No dependencies, no build.

**Spec:** `docs/superpowers/specs/2026-09-24-gamification-design.md`

## Global Constraints

- No backend, no build step, no package.json. State key is `pt.progress`, schema `v: 1`.
- Dates are local calendar `YYYY-MM-DD` strings; arithmetic via UTC to avoid DST shifts.
- XP amounts: 10 per correct, 20 completion, 30 clean sweep, 15 per rewrite (once per task id ever). Quiz XP pays once per lesson per day.
- Review ladder days: `[1, 3, 7, 14, 30]`. Early review does not advance the stage.
- Level thresholds: 0 Feature Shipper, 100 Question Asker, 250 Problem Finder, 500 Outcome Writer, 800 Root Causer, 1200 Product Thinker.
- Only quiz completion counts as a streak day. Rewrites never touch the streak.
- Copy: strip segments joined by " · ". No emoji. Style stays within `assets/course.css` tokens.
- Not a git repo: skip commit steps.

## Review Focus

1. Streak display when the last active day was two or more days ago: strip must say "No streak yet", not the stale stored count. Pinned by `currentStreak` test in Task 1.
2. Rewrite award on a lesson that has never completed a quiz: creates a record with `completions: 0`, and home page status must still read `New`. Pinned in Task 1 lesson-status test.
3. localStorage throwing on access (private mode): strip renders with the "not being saved" note and no exception escapes. Pinned by `parseState` tests plus manual check in Task 4.
4. Reveal clicked twice (open then hide then open): XP paid once. Pinned by `applyRewrite` idempotence test in Task 1 and by quiz.js only calling on open.
5. Lesson page without `data-lesson` and with a non-numeric filename: quiz still works, no progress written. Pinned by guard in Task 2 (`if (!event.lessonId) return null`).

---

### Task 1: Progress module, pure API, tests

**Files:**
- Create: `assets/progress.js`
- Create: `tests/progress.test.js`

**Interfaces:**
- Produces: `PTProgress.emptyState()`, `parseState(raw)`, `todayString(date?)`, `addDays(day, n)`, `isYesterday(a, b)`, `currentStreak(state, today)`, `applyQuiz(state, {lessonId, correct, total}, today) -> {state, summary:{xpEarned, streak, streakChanged, reviewDue}}`, `applyRewrite(state, {lessonId, taskId}) -> {state, summary:{xpEarned}}`, `levelFor(xp) -> {title, nextAt, nextTitle}`, `lessonStatus(state, lessonId, today) -> 'New'|'Done'|'Review due'`, `stripText(state, lessonId, today)`, and side-effecting `load()`, `save(state)`, `reset()`, `currentLessonId()`, `recordQuiz(event)`, `recordRewrite(event)`, `renderStrip(lessonId)`, `MIN_REWRITE_CHARS`.

- [ ] **Step 1: Write the failing tests** in `tests/progress.test.js` (full file):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../assets/progress.js');

const D1 = '2026-09-24', D2 = '2026-09-25', D3 = '2026-09-26', D5 = '2026-09-28';
const quiz = (correct, total = 10, lessonId = '0001') => ({ type: 'quiz', lessonId, correct, total });

test('date helpers', () => {
  assert.equal(P.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(P.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(P.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(P.isYesterday(D1, D2), true);
  assert.equal(P.isYesterday(D1, D3), false);
  assert.equal(P.isYesterday(null, D1), false);
  assert.equal(P.todayString(new Date(2026, 8, 24, 23, 59)), '2026-09-24');
});

test('streak: first, next day, same day, gap, best', () => {
  let s = P.emptyState();
  s = P.applyQuiz(s, quiz(8), D1).state;
  assert.equal(s.streak.count, 1);
  s = P.applyQuiz(s, quiz(8), D2).state;
  assert.equal(s.streak.count, 2);
  const same = P.applyQuiz(s, quiz(8), D2);
  assert.equal(same.state.streak.count, 2);
  assert.equal(same.summary.streakChanged, false);
  s = P.applyQuiz(same.state, quiz(8), D5).state;
  assert.equal(s.streak.count, 1);
  assert.equal(s.streak.best, 2);
});

test('currentStreak drops to 0 after a missed day', () => {
  const s = P.applyQuiz(P.emptyState(), quiz(8), D1).state;
  assert.equal(P.currentStreak(s, D1), 1);
  assert.equal(P.currentStreak(s, D2), 1);
  assert.equal(P.currentStreak(s, D3), 0);
});

test('xp: amounts, same-day zero, next-day pays again', () => {
  const r1 = P.applyQuiz(P.emptyState(), quiz(9), D1);
  assert.equal(r1.summary.xpEarned, 110);
  const r2 = P.applyQuiz(P.emptyState(), quiz(10), D1);
  assert.equal(r2.summary.xpEarned, 150);
  const r3 = P.applyQuiz(r1.state, quiz(10), D1);
  assert.equal(r3.summary.xpEarned, 0);
  assert.equal(r3.state.xp, 110);
  assert.equal(r3.state.lessons['0001'].bestScore, 10);
  assert.equal(r3.state.lessons['0001'].completions, 2);
  const r4 = P.applyQuiz(r3.state, quiz(7), D2);
  assert.equal(r4.summary.xpEarned, 90);
  assert.equal(r4.state.xp, 200);
});

test('review ladder: first, on time, early, cap', () => {
  let r = P.applyQuiz(P.emptyState(), quiz(10), D1);
  let L = r.state.lessons['0001'];
  assert.equal(L.reviewStage, 1);
  assert.equal(L.reviewDue, D2);
  r = P.applyQuiz(r.state, quiz(10), D2);            // on time -> stage 2, +3
  L = r.state.lessons['0001'];
  assert.equal(L.reviewStage, 2);
  assert.equal(L.reviewDue, D5);
  r = P.applyQuiz(r.state, quiz(10), D3);            // early -> stage stays 2, +3 from D3
  L = r.state.lessons['0001'];
  assert.equal(L.reviewStage, 2);
  assert.equal(L.reviewDue, '2026-09-29');
  let day = '2026-09-29';
  for (let i = 0; i < 6; i++) { r = P.applyQuiz(r.state, quiz(10), day); day = r.state.lessons['0001'].reviewDue; }
  L = r.state.lessons['0001'];
  assert.equal(L.reviewStage, 5);
  assert.equal(P.addDays(L.lastCompleted, 30), L.reviewDue);
});

test('rewrite: pays 15 once, never touches streak', () => {
  const ev = { type: 'rewrite', lessonId: '0001', taskId: 'rw1' };
  const r1 = P.applyRewrite(P.emptyState(), ev);
  assert.equal(r1.summary.xpEarned, 15);
  assert.equal(r1.state.xp, 15);
  assert.equal(r1.state.streak.count, 0);
  const r2 = P.applyRewrite(r1.state, ev);
  assert.equal(r2.summary.xpEarned, 0);
  assert.equal(r2.state.xp, 15);
  assert.equal(P.lessonStatus(r2.state, '0001', D1), 'New');
});

test('levels', () => {
  assert.deepEqual(P.levelFor(0), { title: 'Feature Shipper', nextAt: 100, nextTitle: 'Question Asker' });
  assert.equal(P.levelFor(99).title, 'Feature Shipper');
  assert.equal(P.levelFor(100).title, 'Question Asker');
  assert.equal(P.levelFor(250).title, 'Problem Finder');
  assert.equal(P.levelFor(500).title, 'Outcome Writer');
  assert.equal(P.levelFor(800).title, 'Root Causer');
  assert.deepEqual(P.levelFor(1200), { title: 'Product Thinker', nextAt: null, nextTitle: null });
  assert.equal(P.levelFor(5000).nextAt, null);
});

test('lessonStatus', () => {
  assert.equal(P.lessonStatus(P.emptyState(), '0001', D1), 'New');
  const s = P.applyQuiz(P.emptyState(), quiz(8), D1).state;
  assert.equal(P.lessonStatus(s, '0001', D1), 'Done');
  assert.equal(P.lessonStatus(s, '0001', D2), 'Review due');
  assert.equal(P.lessonStatus(s, '0002', D2), 'New');
});

test('parseState rejects garbage', () => {
  assert.deepEqual(P.parseState('not json'), P.emptyState());
  assert.deepEqual(P.parseState(null), P.emptyState());
  assert.deepEqual(P.parseState(JSON.stringify({ v: 2, xp: 5 })), P.emptyState());
  const good = P.applyQuiz(P.emptyState(), quiz(8), D1).state;
  assert.deepEqual(P.parseState(JSON.stringify(good)), good);
});

test('stripText', () => {
  assert.equal(P.stripText(P.emptyState(), null, D1), 'No streak yet · 0 XP · Feature Shipper · 100 to Question Asker');
  const s = P.applyQuiz(P.emptyState(), quiz(9), D1).state;
  assert.equal(P.stripText(s, '0001', D1), 'Streak 1 day · 110 XP · Question Asker · 140 to Problem Finder');
  assert.equal(P.stripText(s, '0001', D2), 'Streak 1 day · 110 XP · Question Asker · 140 to Problem Finder · Review due');
  assert.equal(P.stripText(s, '0001', D3), 'No streak yet · 110 XP · Question Asker · 140 to Problem Finder · Review due');
});
```

- [ ] **Step 2: Run** `node --test "tests/**/*.test.js"` from the repo root. Expected: fails with "Cannot find module '../assets/progress.js'".

- [ ] **Step 3: Write `assets/progress.js`** (full file):

```js
/* Product Thinking course: progress, streaks, XP, levels, review nudges.
   Loaded in the browser as window.PTProgress, and in Node tests via require.
   State lives in localStorage under "pt.progress" (schema v1). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.PTProgress = api; if (root.document) api.init(); }
})(typeof window !== 'undefined' ? window : null, function (root) {
  var KEY = 'pt.progress';
  var LADDER = [1, 3, 7, 14, 30];
  var LEVELS = [[0, 'Feature Shipper'], [100, 'Question Asker'], [250, 'Problem Finder'],
                [500, 'Outcome Writer'], [800, 'Root Causer'], [1200, 'Product Thinker']];
  var XP = { perCorrect: 10, completion: 20, cleanSweep: 30, rewrite: 15 };
  var MIN_REWRITE_CHARS = 20;
  var saveFailed = false;

  // ---- dates ----
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayString(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toUtc(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = new Date(toUtc(s) + n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function isYesterday(a, b) { return !!a && !!b && addDays(a, 1) === b; }

  // ---- pure state ----
  function emptyState() { return { v: 1, xp: 0, streak: { count: 0, best: 0, lastDay: null }, lessons: {} }; }
  function parseState(raw) {
    try { var s = JSON.parse(raw); if (s && s.v === 1 && typeof s.xp === 'number' && s.streak && s.lessons) return s; } catch (e) {}
    return emptyState();
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function record(state, id) {
    return state.lessons[id] || (state.lessons[id] = { bestScore: 0, total: 0, completions: 0, lastCompleted: null, lastXpDay: null, reviewStage: 0, rewrites: [] });
  }
  function currentStreak(state, today) {
    var st = state.streak;
    return (st.lastDay === today || isYesterday(st.lastDay, today)) ? st.count : 0;
  }
  function applyQuiz(state, ev, today) {
    var s = clone(state), st = s.streak, changed = false;
    if (st.lastDay !== today) { st.count = isYesterday(st.lastDay, today) ? st.count + 1 : 1; st.lastDay = today; changed = true; }
    if (st.count > st.best) st.best = st.count;
    var L = record(s, ev.lessonId), xp = 0;
    if (L.lastXpDay !== today) {
      xp = ev.correct * XP.perCorrect + XP.completion + (ev.correct === ev.total ? XP.cleanSweep : 0);
      L.lastXpDay = today; s.xp += xp;
    }
    L.bestScore = Math.max(L.bestScore, ev.correct); L.total = ev.total; L.completions += 1; L.lastCompleted = today;
    if (!L.reviewDue || today >= L.reviewDue) L.reviewStage = Math.min(L.reviewStage + 1, LADDER.length);
    L.reviewDue = addDays(today, LADDER[L.reviewStage - 1]);
    return { state: s, summary: { xpEarned: xp, streak: st.count, streakChanged: changed, reviewDue: L.reviewDue } };
  }
  function applyRewrite(state, ev) {
    var s = clone(state), L = record(s, ev.lessonId);
    if (L.rewrites.indexOf(ev.taskId) >= 0) return { state: s, summary: { xpEarned: 0 } };
    L.rewrites.push(ev.taskId); s.xp += XP.rewrite;
    return { state: s, summary: { xpEarned: XP.rewrite } };
  }
  function levelFor(xp) {
    var i = 0; for (var k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k][0]) i = k;
    var next = LEVELS[i + 1];
    return { title: LEVELS[i][1], nextAt: next ? next[0] : null, nextTitle: next ? next[1] : null };
  }
  function lessonStatus(state, id, today) {
    var L = state.lessons[id];
    if (!L || !L.completions) return 'New';
    return today >= L.reviewDue ? 'Review due' : 'Done';
  }
  function stripText(state, lessonId, today) {
    var n = currentStreak(state, today), lv = levelFor(state.xp);
    var parts = [n > 0 ? 'Streak ' + n + (n === 1 ? ' day' : ' days') : 'No streak yet', state.xp + ' XP', lv.title];
    if (lv.nextAt !== null) parts.push((lv.nextAt - state.xp) + ' to ' + lv.nextTitle);
    if (lessonId && lessonStatus(state, lessonId, today) === 'Review due') parts.push('Review due');
    return parts.join(' · ');
  }

  // ---- storage and DOM ----
  function storage() { try { var s = root.localStorage; s.getItem(KEY); return s; } catch (e) { saveFailed = true; return null; } }
  function load() { var s = storage(); return s ? parseState(s.getItem(KEY)) : emptyState(); }
  function save(state) { var s = storage(); if (!s) return false; try { s.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { saveFailed = true; return false; } }
  function reset() { var s = storage(); if (s) { try { s.removeItem(KEY); } catch (e) {} } }
  function currentLessonId() {
    var b = root.document && root.document.body;
    if (b && b.getAttribute('data-lesson')) return b.getAttribute('data-lesson');
    var m = (root.location.pathname.split('/').pop() || '').match(/^(\d+)/);
    return m ? m[1] : null;
  }
  function renderStrip(lessonId) {
    var els = root.document.querySelectorAll('.progress-strip');
    if (!els.length) return;
    var text = stripText(load(), lessonId, todayString());
    if (saveFailed) text += ' · Progress is not being saved in this browser';
    for (var i = 0; i < els.length; i++) els[i].textContent = text;
  }
  function recordQuiz(ev) { if (!ev.lessonId) return null; var r = applyQuiz(load(), ev, todayString()); save(r.state); renderStrip(ev.lessonId); return r.summary; }
  function recordRewrite(ev) { if (!ev.lessonId) return null; var r = applyRewrite(load(), ev); save(r.state); renderStrip(ev.lessonId); return r.summary; }
  function init() {
    function go() { renderStrip(currentLessonId()); }
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
  }

  return { KEY: KEY, LADDER: LADDER, XP: XP, MIN_REWRITE_CHARS: MIN_REWRITE_CHARS,
    todayString: todayString, addDays: addDays, isYesterday: isYesterday,
    emptyState: emptyState, parseState: parseState, currentStreak: currentStreak,
    applyQuiz: applyQuiz, applyRewrite: applyRewrite, levelFor: levelFor, lessonStatus: lessonStatus, stripText: stripText,
    load: load, save: save, reset: reset, currentLessonId: currentLessonId, renderStrip: renderStrip,
    recordQuiz: recordQuiz, recordRewrite: recordRewrite, init: init };
});
```

- [ ] **Step 4: Run** `node --test "tests/**/*.test.js"`. Expected: all 10 tests pass.

### Task 2: Wire quiz.js to progress

**Files:**
- Modify: `assets/quiz.js` (score line block inside the click handler; `wireReveal`)

**Interfaces:**
- Consumes: `window.PTProgress.currentLessonId()`, `recordQuiz`, `recordRewrite`, `MIN_REWRITE_CHARS`.

- [ ] **Step 1: Replace the score-line update** in the option click handler. Current code:

```js
          var tail = '';
          if (answered === qs.length) {
            tail = score === qs.length
              ? '. Clean sweep.'
              : '. Re-read the misses, then come back tomorrow and try again from memory.';
          }
          scoreEl.textContent = 'Score: ' + score + ' / ' + answered + tail;
```

New code:

```js
          var text = 'Score: ' + score + ' / ' + answered;
          if (answered === qs.length) {
            text += '.';
            var P = window.PTProgress;
            var sum = P ? P.recordQuiz({ type: 'quiz', lessonId: P.currentLessonId(), correct: score, total: qs.length }) : null;
            if (sum) {
              text += sum.xpEarned > 0 ? ' +' + sum.xpEarned + ' XP.' : ' Already counted today.';
              text += ' Streak: ' + sum.streak + (sum.streak === 1 ? ' day.' : ' days.');
            }
            text += score === qs.length
              ? ' Clean sweep.'
              : ' Re-read the misses, then come back tomorrow and try again from memory.';
          }
          scoreEl.textContent = text;
```

- [ ] **Step 2: Extend `wireReveal`** so opening a reveal awards the paired rewrite. Replace the whole function:

```js
  function pairedTextarea(el) {
    var all = document.querySelectorAll('textarea'), found = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = all[i];
    }
    return found;
  }

  function wireReveal(el) {
    var btn = el.querySelector('button');
    if (!btn) return;
    var label = btn.getAttribute('data-label') || btn.textContent || 'Reveal';
    btn.textContent = label;
    btn.addEventListener('click', function () {
      var opening = !el.classList.contains('open');
      el.classList.toggle('open');
      btn.textContent = el.classList.contains('open') ? 'Hide' : label;
      var P = window.PTProgress;
      if (!opening || !P) return;
      var ta = pairedTextarea(el);
      if (!ta || !ta.id || ta.value.replace(/\s/g, '').length < P.MIN_REWRITE_CHARS) return;
      var sum = P.recordRewrite({ type: 'rewrite', lessonId: P.currentLessonId(), taskId: ta.id });
      if (sum && sum.xpEarned > 0) {
        var line = document.createElement('p');
        line.className = 'xp-award';
        line.textContent = '+' + sum.xpEarned + ' XP for attempting this before revealing.';
        el.querySelector('.reveal-body').appendChild(line);
      }
    });
  }
```

- [ ] **Step 3: Verify** `node --test "tests/**/*.test.js"` still passes (quiz.js is browser-only; this confirms nothing else broke) and `node -e "new Function(require('fs').readFileSync('assets/quiz.js','utf8'))"` parses without error.

### Task 3: Styles, lesson page hooks, home page

**Files:**
- Modify: `assets/course.css` (append)
- Modify: `lessons/0001-outputs-vs-outcomes.html` (body tag, header, nav, scripts)
- Create: `index.html`

- [ ] **Step 1: Append to `assets/course.css`** before the `/* Print */` block:

```css
/* Progress */
.progress-strip { font-family: var(--sans); font-size: .8rem; color: var(--muted); margin-top: .6rem; min-height: 1.2rem; }
.progress-strip.secondary { margin-top: .2rem; }
.xp-award { font-family: var(--sans); font-size: .8rem; color: var(--ok); margin: .6rem 0 0; }
.lesson-list { list-style: none; padding: 0; margin: 1.2rem 0; }
.lesson-list li { display: flex; justify-content: space-between; gap: 1rem; padding: .7rem 0; border-top: 1px solid var(--rule); }
.lesson-list li:last-child { border-bottom: 1px solid var(--rule); }
.lesson-list .num { font-family: var(--sans); color: var(--muted); font-size: .8rem; margin-right: .6rem; }
.lesson-list .status { font-family: var(--sans); font-size: .8rem; color: var(--muted); white-space: nowrap; }
.lesson-list .status.due { color: var(--accent); }
.lesson-list .status.done { color: var(--ok); }
.lesson-list .unwritten { color: var(--muted); }
.reset-link { font-family: var(--sans); font-size: .8rem; }
```

Also add `.progress-strip` to the print-hidden list: change `.lesson-nav, .no-print, button { display: none !important; }` to `.lesson-nav, .no-print, .progress-strip, .xp-award, button { display: none !important; }`.

- [ ] **Step 2: Edit `lessons/0001-outputs-vs-outcomes.html`:**
  - `<body>` becomes `<body data-lesson="0001">`.
  - After the `.meta` div in header, add `<div class="progress-strip"></div>`.
  - Replace `<span>Next lesson: not yet written</span>` with `<a href="../index.html">Course home</a>`.
  - Before `<script src="../assets/quiz.js"></script>` add `<script src="../assets/progress.js"></script>`.

- [ ] **Step 3: Create `index.html`** (full file):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Product Thinking</title>
<link rel="stylesheet" href="assets/course.css">
</head>
<body>
<header>
  <div class="kicker">Course home · Product Thinking</div>
  <h1>Product Thinking</h1>
  <p class="subtitle">Ask what problem, for whom, and what would change, before anyone reaches for a solution.</p>
  <div class="progress-strip"></div>
  <div class="progress-strip secondary" id="best-streak"></div>
</header>
<main>

<h2>Lessons</h2>
<ul class="lesson-list" id="lessons"></ul>

<h2>How progress works</h2>
<p>Finishing a quiz counts as a day. Do one on consecutive days and the streak grows; miss a day and it starts again from one. Each quiz pays XP once a day, so coming back tomorrow for a review pays again, and lessons come due for review after 1, 3, 7, 14 and 30 days.</p>

<p class="aside">Ten minutes a session. Pick the lesson marked "Review due" first; if none is due, take the next new one.</p>

</main>
<footer>
  <p>Built from <a href="https://www.idg.gov.sg/product-thinking/">idg.gov.sg/product-thinking</a>. See <a href="MISSION.md">MISSION.md</a>. <a href="#" class="reset-link" id="reset">Reset progress</a></p>
</footer>
<script src="assets/progress.js"></script>
<script>
(function () {
  var LESSONS = [
    { id: '0001', title: 'Outputs vs Outcomes', href: 'lessons/0001-outputs-vs-outcomes.html' },
    { id: '0002', title: 'Solutions in disguise', href: null },
    { id: '0003', title: 'Five Whys', href: null },
    { id: '0004', title: '4Cs problem statement', href: null },
    { id: '0005', title: 'Metrics: leading, lagging, SMART', href: null },
    { id: '0006', title: 'Assumptions, risks and the cheapest test', href: null },
    { id: '0007', title: '11-Star: ambition then trade-offs', href: null },
    { id: '0008', title: 'Spaced review', href: null }
  ];
  var P = window.PTProgress;

  function render() {
    var state = P.load(), today = P.todayString();
    var ul = document.getElementById('lessons');
    ul.textContent = '';
    LESSONS.forEach(function (l, i) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      var num = document.createElement('span'); num.className = 'num'; num.textContent = i + 1;
      left.appendChild(num);
      if (l.href) {
        var a = document.createElement('a'); a.href = l.href; a.textContent = l.title; left.appendChild(a);
      } else {
        var t = document.createElement('span'); t.className = 'unwritten'; t.textContent = l.title; left.appendChild(t);
      }
      var status = document.createElement('span'); status.className = 'status';
      if (!l.href) {
        status.textContent = 'Not yet written';
      } else {
        var st = P.lessonStatus(state, l.id, today);
        status.textContent = st;
        if (st === 'Review due') status.classList.add('due');
        if (st === 'Done') status.classList.add('done');
        var L = state.lessons[l.id];
        if (L && L.completions) status.textContent += ' · best ' + L.bestScore + '/' + L.total;
      }
      li.appendChild(left); li.appendChild(status); ul.appendChild(li);
    });
    var best = state.streak.best;
    document.getElementById('best-streak').textContent = best > 0 ? 'Best streak ' + best + (best === 1 ? ' day' : ' days') : '';
    P.renderStrip(null);
  }

  var reset = document.getElementById('reset'), armed = false;
  reset.addEventListener('click', function (e) {
    e.preventDefault();
    if (!armed) { armed = true; reset.textContent = 'Click again to reset'; return; }
    P.reset(); armed = false; reset.textContent = 'Reset progress'; render();
  });

  render();
})();
</script>
</body>
</html>
```

- [ ] **Step 4: Manual check.** Open `lessons/0001-outputs-vs-outcomes.html` in a browser (file:// is fine). Confirm the strip reads "No streak yet · 0 XP · Feature Shipper · 100 to Question Asker". Answer all ten questions; the score line ends with "+N XP. Streak: 1 day." and the strip updates. Type 20+ characters in a rewrite box and reveal; a green "+15 XP" line appears; reveal again, no second line. Reload: numbers persist. Open `index.html`: row 1 reads "Done · best N/10", footer reset requires two clicks and zeroes everything.

### Task 4: Notes

**Files:**
- Modify: `NOTES.md` (append)

- [ ] **Step 1: Append** to `NOTES.md`:

```markdown
## Lesson page checklist (added 2026-09-24 with gamification)
- `<body data-lesson="NNNN">` matching the lesson file prefix.
- `<div class="progress-strip"></div>` inside `<header>` after `.meta`.
- Scripts at the end of body, in this order: `../assets/progress.js` then `../assets/quiz.js`.
- Rewrite tasks: a `<textarea id="rwN">` immediately before its `.reveal` block. The id is the XP task id.
- Add the lesson's row (id, title, href) to the `LESSONS` array in `index.html` and set the previous lesson's "Next lesson" link.
- Tests: `node --test "tests/**/*.test.js"` from the repo root.
```

- [ ] **Step 2: Run** `node --test "tests/**/*.test.js"` one last time. Expected: pass.
