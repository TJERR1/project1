# Gamification: streaks, XP, levels and review nudges

Date: 2026-09-24
Status: approved in conversation, awaiting spec review

## Purpose

The Product Thinking course is a solo, self-paced set of static HTML lessons
(see `MISSION.md`). Its aim is a daily habit of asking "what problem, for whom,
what would change" in ten-minute sittings. This feature adds a light reward
layer whose only job is to make the learner come back tomorrow and retrieve
from memory. It rewards showing up and completing quizzes. It does not reward
speed, and there is no competition or leaderboard.

Constraints carried from the brief:

- Static site, no backend, no build step. All state lives in `localStorage`.
- Every lesson must still fit in ten minutes. The reward layer adds no reading
  time and no extra steps beyond what the lesson already asks.
- Solo course. Self-scored tasks are honesty-based.
- Visual style stays inside the existing Tufte-inspired stylesheet. No emoji,
  no confetti, no sound.

## Scope

In scope:

1. A progress module (`assets/progress.js`) owning all state and transitions.
2. A header progress strip on every lesson page.
3. XP and streak reporting in the quiz score line.
4. XP for rewrite tasks once the learner has typed an answer and revealed the
   model.
5. Spaced-review scheduling per lesson, surfaced as "Review due".
6. A course home page (`index.html`) listing lessons with status, streak,
   level, and a reset link.
7. Unit tests for the pure transition functions, run with `node --test`.
8. A note in `NOTES.md` so future lessons include the strip and lesson id.

Out of scope (deliberately):

- Badges, XP history charts, calendar heatmaps.
- Locking lessons behind a pass threshold.
- Streak freezes or grace days.
- Sync across devices or browsers.
- Timers, combo multipliers, per-quiz personal bests beyond "best score".

## State

One `localStorage` key: `pt.progress`. Value is JSON:

```json
{
  "v": 1,
  "xp": 0,
  "streak": { "count": 0, "best": 0, "lastDay": null },
  "lessons": {
    "0001": {
      "bestScore": 9,
      "total": 10,
      "completions": 2,
      "lastCompleted": "2026-09-24",
      "lastXpDay": "2026-09-24",
      "reviewStage": 1,
      "reviewDue": "2026-09-27",
      "rewrites": ["rw1", "rw3"]
    }
  }
}
```

Field meanings:

- `v`: schema version. Any object without `v: 1` is discarded and replaced
  with the empty state. Migration is not attempted in this version.
- `xp`: lifetime total. Never decreases.
- `streak.count`: consecutive active days including today if active.
- `streak.best`: highest `count` ever reached.
- `streak.lastDay`: local calendar date (`YYYY-MM-DD`) of the last quiz
  completion, or `null`.
- `lessons[id]`: created on first quiz completion or rewrite award.
  - `bestScore`, `total`: best correct count and question count seen.
  - `completions`: number of quiz completions across all days.
  - `lastCompleted`: local date of the most recent completion.
  - `lastXpDay`: local date the quiz last paid XP. Used to block same-day
    farming.
  - `reviewStage`: index into the review ladder, starting at 0 before any
    completion.
  - `reviewDue`: local date the next review is due, or absent before the first
    completion.
  - `rewrites`: ids of rewrite tasks already awarded. Each id pays once ever.

Dates are local calendar dates, computed from the browser clock, formatted
`YYYY-MM-DD`. Day arithmetic is done on the `YYYY-MM-DD` strings via UTC
dates so daylight-saving changes cannot shift a day.

Lesson id comes from `<body data-lesson="0001">`. If the attribute is absent,
the module falls back to the leading digits of the page filename. If neither
yields an id, progress features are inert on that page and nothing is written.

## Transitions

All transitions are pure functions of `(state, event, today)` returning a new
state plus a summary of what was awarded. They live in `progress.js` and are
the unit under test.

### Quiz completed

Event: `{ type: "quiz", lessonId, correct, total }`, fired by `quiz.js` when
the last question is answered.

1. Streak. If `lastDay === today`, unchanged. If `lastDay` is yesterday,
   `count += 1`. Otherwise `count = 1`. Update `best`. Set `lastDay = today`.
2. XP. Paid only if the lesson's `lastXpDay !== today`:
   - 10 per correct answer
   - 20 completion bonus
   - 30 clean-sweep bonus when `correct === total`
   Set `lastXpDay = today`. A second completion the same day pays 0 but still
   updates streak (no change), `bestScore`, `completions`, `lastCompleted`, and
   review scheduling.
3. Lesson record. `bestScore = max(bestScore, correct)`, `total = total`,
   `completions += 1`, `lastCompleted = today`.
4. Review. Ladder in days: `[1, 3, 7, 14, 30]`. If `reviewDue` is absent or
   `today >= reviewDue`, advance `reviewStage` by one (capped at 5, the last
   rung). If the learner reviews early (`today < reviewDue`), the stage does
   not advance. Either way `reviewDue = today + ladder[reviewStage - 1]`.
   First completion always yields stage 1 and `reviewDue = tomorrow`.

Summary returned: `{ xpEarned, streak, streakChanged, reviewDue }`.

### Rewrite awarded

Event: `{ type: "rewrite", lessonId, taskId }`, fired by `quiz.js` when a
reveal button is clicked and the textarea paired with that reveal contains at
least 20 non-whitespace characters.

- If `taskId` is already in `rewrites`, nothing changes and `xpEarned = 0`.
- Otherwise add it and pay 15 XP.
- Rewrite awards do not touch the streak. Only quiz completion counts as an
  active day, so the streak has one clear meaning.

Pairing rule: the reveal's textarea is the nearest preceding `textarea` in
document order. Its `id` is the `taskId`.

### Level

Pure function of total XP. Thresholds and titles:

| XP from | Title            |
|--------:|------------------|
|       0 | Feature Shipper  |
|     100 | Question Asker   |
|     250 | Problem Finder   |
|     500 | Outcome Writer   |
|     800 | Root Causer      |
|    1200 | Product Thinker  |

Returns `{ title, nextAt, nextTitle }` where `nextAt` and `nextTitle` are
`null` at the top level.

Sizing check: one lesson done cleanly with three rewrites pays 10x10 + 20 +
30 + 3x15 = 195 XP. Eight lessons done once each lands around 1200 to 1500,
so the top title arrives at roughly the end of the planned course with some
review days. Reviews on later days pay again, so an engaged learner passes the
top threshold, which is fine: the title is a ceiling, not a target.

### Reset

`reset()` removes the key. Exposed only from the home page.

## Surfaces

### Header strip (every lesson)

Rendered by `progress.js` on load into an element with class `progress-strip`
placed inside `<header>` after `.meta`. Sans-serif, muted, one line:

> Streak 3 days · 120 XP · Problem Finder · 130 to Outcome Writer

When the current lesson's `reviewDue <= today` and it has been completed
before, append " · Review due". With no progress at all the strip reads:

> No streak yet · 0 XP · Feature Shipper · 100 to Question Asker

At the top level the last segment is omitted. On a page with no lesson id,
the strip still renders global figures; only the review flag is omitted.

### Quiz score line

Existing behaviour is kept. When the final question is answered, `quiz.js`
dispatches the quiz event and appends the summary to the score line:

> Score: 9 / 10. +110 XP. Streak: 3 days.

If XP was 0 because the quiz already paid today:

> Score: 9 / 10. Already counted today. Streak: 3 days.

The existing tail text ("Clean sweep." or "Re-read the misses...") stays and
comes after the streak sentence. The header strip re-renders after the award
so the numbers agree.

### Rewrite award

When a reveal pays XP, `quiz.js` appends a small muted line inside the reveal
body: "+15 XP for attempting this before revealing." No line is shown when
the textarea is too short or the task was already paid.

### Home page (`index.html` at repo root)

Same header structure as a lesson. Body:

1. Progress strip (as above) plus a second line with best streak.
2. Lesson list, one row per planned lesson in the order given in `NOTES.md`.
   Each row shows number, title, and a status word from this set:
   - `Not yet written` (no file; rendered as plain text, not a link)
   - `New` (file exists, no record)
   - `Done` (record exists, review not due)
   - `Review due` (record exists, `reviewDue <= today`)
   Best score is shown after the status when a record exists: "Done · best 9/10".
3. A short paragraph on how streaks and XP work (three sentences).
4. Footer with a "Reset progress" link. Clicking it asks for confirmation
   with a second click on the same link (label changes to "Click again to
   reset") rather than a browser dialog, then clears state and re-renders.

The lesson list is a static array in the page's own script, each entry
carrying id, title and href (href `null` for unwritten lessons). Adding a
lesson means adding a row there; `NOTES.md` records this.

## Module boundaries

`assets/progress.js`

- Exposes `window.PTProgress` in the browser and `module.exports` under Node,
  so the same file is tested and shipped.
- Pure API (no DOM, no storage):
  `emptyState()`, `applyQuiz(state, event, today)`, `applyRewrite(state,
  event)`, `levelFor(xp)`, `lessonStatus(state, lessonId, today)`,
  `todayString(date)`, `addDays(dayString, n)`, `isYesterday(a, b)`,
  `parseState(rawJson)`.
- Side-effecting API: `load()`, `save(state)`, `reset()`,
  `recordQuiz(event)`, `recordRewrite(event)`, `renderStrip(lessonId)`,
  `currentLessonId()`. These wrap the pure API with storage and DOM.
- On load in a browser, renders the strip into `.progress-strip` if present.

`assets/quiz.js`

- After the final answer: build the quiz event, call
  `PTProgress.recordQuiz`, append the summary to the score line.
- On reveal click: find the paired textarea, check length, call
  `PTProgress.recordRewrite`, append the award line when XP > 0.
- Guards every call with `if (window.PTProgress)` so a lesson that omits the
  progress script still works exactly as today.

Script order in lesson pages: `progress.js` first, then `quiz.js`.

## Error handling

- `localStorage` unavailable or throwing (private mode, blocked storage): all
  reads return the empty state, writes are swallowed, and the strip renders
  with a trailing note "Progress is not being saved in this browser".
- Corrupt or foreign JSON under the key: treated as empty state and
  overwritten on the next save.
- Missing `.progress-strip` element: nothing rendered, no error.
- Missing lesson id: strip renders global figures, quiz and rewrite events are
  dropped silently.

## Testing

`tests/progress.test.js`, run with `node --test "tests/**/*.test.js"`. Node's built-in
runner, no dependencies, no `package.json` needed. Cases:

- Streak: first ever completion gives 1; next day gives 2; same day again
  leaves it; a gap resets to 1; `best` tracks the maximum.
- XP: correct-answer, completion and clean-sweep amounts; second completion
  same day pays 0 but still updates the record; next day pays again.
- Review: first completion sets stage 1 and due tomorrow; on-time review
  advances the ladder; early review does not advance; the ladder caps at 30.
- Rewrite: pays 15 once per task id; second call pays 0; does not touch
  streak.
- Level: each threshold boundary, and `nextAt` is null at the top.
- Lesson status: `New`, `Done`, `Review due` for the combinations of record
  present and due date.
- Date helpers: `addDays` across a month boundary and a year boundary;
  `isYesterday` true and false cases.
- Corrupt state: `parseState` with garbage, with the wrong version, and with
  `null` returns the empty state.

Manual check after implementation: open the lesson in a browser, complete the
quiz, confirm the strip and score line agree, reload and confirm persistence,
open `index.html` and confirm the row reads `Done · best N/10`, reset, and
confirm everything returns to zero.

## Documentation changes

- `NOTES.md`: add a "Lesson page checklist" section: `data-lesson` on body,
  `.progress-strip` div in header, script order, and add the row to
  `index.html`.
- Existing lesson `0001`: add `data-lesson="0001"`, the strip element, the
  progress script tag, and point its "Next lesson" nav at `../index.html`
  until lesson 2 exists.
