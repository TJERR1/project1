# Notes

- Workspace created 2026-09-24 from https://www.idg.gov.sg/product-thinking/
- Source is the Singapore Institute of Digital Government's 7-module Product Thinking course (part of "AI Build 301"). Public-sector framing throughout: Policy-Ops-Tech, citizens as users, mandatory services.

## User preferences (2026-09-24)
- Mission: shape what their team builds; stop shipping features that miss the real problem.
- No live project yet. Use realistic case studies. Revisit: if they later name a project, switch exercises to it and add a learning record.
- 10 minutes per session. Keep lessons to one skill, one quiz, one short rewrite task.
- No community suggestions.

## Teaching plan (draft, revise from learning records)
1. Outputs vs outcomes: classify and rewrite. (done: 0001)
2. Solutions in disguise: the question to ask when a request arrives as a feature.
3. Five Whys: from symptom to a controllable cause.
4. 4Cs problem statement: draft and critique.
5. Metrics: leading vs lagging, SMART check.
6. Assumptions and risks: cheapest test, staged delivery.
7. 11-Star: ambition then trade-offs.
8. Spaced review lesson mixing 1 to 7.

## Lesson page checklist (added 2026-09-24 with gamification)
- `<body data-lesson="NNNN">` matching the lesson file prefix.
- `<div class="progress-strip"></div>` inside `<header>` after `.meta`.
- Scripts at the end of body, in this order: `../assets/progress.js` then `../assets/quiz.js`.
- Rewrite tasks: a `<textarea id="rwN">` immediately before its `.reveal` block. The id is the XP task id.
- Add the lesson row (id, title, href) to the `LESSONS` array in `index.html` and set the previous lesson's "Next lesson" link.
- Tests: `node --test "tests/**/*.test.js"` from the repo root.
- Design: `docs/superpowers/specs/2026-09-24-gamification-design.md`.
