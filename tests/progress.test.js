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
