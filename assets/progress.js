/* Product Thinking course: progress, streaks, XP, levels, review nudges.
   Loaded in the browser as window.PTProgress, and in Node tests via require.
   State lives in localStorage under "pt.progress" (schema v1).

   Lesson pages need:
     <body data-lesson="0001">
     <div class="progress-strip"></div>   (inside <header>)
     <script src="../assets/progress.js"></script> before quiz.js
*/
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

  // ---- dates (local calendar days as YYYY-MM-DD; arithmetic via UTC) ----
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayString(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toUtc(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = new Date(toUtc(s) + n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function isYesterday(a, b) { return !!a && !!b && addDays(a, 1) === b; }

  // ---- pure state transitions ----
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
    var els = root.document.querySelectorAll('.progress-strip:not(.secondary)');
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
