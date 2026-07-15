# Support recurrence_anchor ('scheduled' vs 'completion') in scheduling semantics - #27

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/27
- **State:** open
- **Labels:** enhancement
- **Milestone:** (none)
- **Assignees:** (none)
- **Related Issues:**
  - Related: #11/PR #26 (origin — scratchpad decision Q4 flagged this gap), #28 (today-cell
    on non-due days, queued after this — explicitly OUT of scope here), biweekly
    BYDAY+INTERVAL=2 (to be filed as a follow-up issue once this lands, per Q3 decision)

## Description

`TaskNote.recurrenceAnchor` is parsed from frontmatter (`recurrence_anchor: scheduled |
completion`, defaulting to `scheduled`) but never consumed by the renderer. Since #11
(PR #26), the two recurrence families each hard-code one anchor's semantics:

- Fixed schedules (`BYDAY`/`BYMONTHDAY`) always behave as **'scheduled'** (calendar-fixed due days).
- Interval habits (`FREQ=DAILY`, `INTERVAL=N`) always behave as **'completion'** (rolling window from last completion).

A user setting `recurrence_anchor: scheduled` on an interval habit (due every N days from
the scheduled date, regardless of when last completed) or `completion` on a weekly habit
gets silently ignored.

**Key planner finding:** the parser's *default* anchor is `'scheduled'`, so naively
consuming the field would flip default behavior for every interval habit with no
`recurrence_anchor` in frontmatter. The load-bearing design rule: scheduled-anchor
interval habits **fall back to the legacy rolling-window math whenever no `scheduled`
date is available** (silent — per Q1 decision). That fallback is what keeps the
regression suite green and requirement 3 satisfied.

## Acceptance Criteria
- [ ] Scheduled-anchor interval habits (with a `scheduled` date) compute due days from
      the `scheduled` date at fixed cadence, ignoring completion history; days before
      the scheduled date are never due
- [ ] `recurrence_anchor: completion` on fixed-day schedules is a documented no-op with
      a one-time console.warn (per Q2 decision)
- [ ] Existing default behavior unchanged when `recurrence_anchor` and/or `scheduled`
      are absent (graphRenderer.test.ts regression suite stays green untouched)
- [ ] Scheduled-anchor interval habits get binary future cells (future-ok /
      future-too-early), no escalation ramp (per Q5 decision)

## Branch Strategy
- **Base branch:** main (local main is 1 commit ahead of origin — the #29 archive commit
  f1f8005; push main before opening the PR, same lesson as #11/#29)
- **Feature branch:** 27-support-recurrence-anchor
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create and checkout feature branch from local main

### Implementation Tasks

- [x] **Task 1: Extend `ParsedRecurrence`/`parseRecurrence`/`isDueOn` with anchor + scheduledDate**
  - Files affected: `src/utils/recurrenceUtils.ts`, `src/__tests__/recurrenceUtils.test.ts`
  - Why: recurrenceUtils is the scheduling authority (PROJECT_LORE coupling); anchor
    semantics belong here, consumed by all graphRenderer branches.
  - `ParsedRecurrence` `'interval'` variant gains `anchor: 'scheduled' | 'completion'`.
    `parseRecurrence(pattern, anchor = 'scheduled')` gains a second param (default
    matches TaskNote's default so existing callers are unchanged).
  - `isDueOn(recurrence, date, lastCompletionBefore, scheduledDate: Date | null = null)`
    gains a 4th param. New logic ONLY in the `'interval'` branch:
    - `anchor === 'scheduled' && scheduledDate`: due iff `date >= scheduledDate` and
      day-diff % `recurrence.days === 0`.
    - Otherwise (completion anchor, or scheduled anchor without scheduledDate):
      unchanged rolling-window math — SILENT fallback (Q1).
  - Also: one-time console.warn when BYDAY/BYMONTHDAY + `anchor === 'completion'`
    (no-op semantics, Q2), mirroring the existing INTERVAL>1-with-BYDAY warn pattern
    (~recurrenceUtils.ts:129-131). Fixed-day branches otherwise unchanged.
  - Tests: scheduled-anchor due/not-due at exact multiples; before-scheduled-date not
    due; no-scheduledDate fallback pinned against legacy rolling-window results;
    explicit completion-anchor pass-through unchanged; completion-on-BYDAY warns once
    and stays calendar-fixed.

- [x] **Task 2: Thread anchor/scheduledDate through `generateDayCells` (past-day branch)**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`
  - Why: past rest/missed classification consults isDueOn; it needs the new inputs.
  - APPEND (never insert) trailing params to preserve positional call sites:
    `generateDayCells(..., skippedDates = [], recurrenceAnchor = 'scheduled', scheduledDate: Date | null = null)`.
  - Pass anchor into `parseRecurrence`, scheduledDate into the past-day `isDueOn` call (~line 101).
  - Tests: scheduled-anchor interval — past days before `scheduled` are `rest`;
    on-cadence past days classify done/missed correctly regardless of completion gaps.

- [x] **Task 3: Binary future cells for scheduled-anchor interval habits**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`
  - Why: Q5 decision — calendar-fixed due days make the 0.75x/1.25x/1.5x escalation
    ramp meaningless (same reasoning #11 applied to BYDAY).
  - Extend the future-branch condition from `recurrence.kind !== 'interval'` to also
    take the binary path when `recurrence.anchor === 'scheduled'` AND scheduledDate is
    non-null (fallback case keeps the ramp, consistent with Task 1).
  - Tests: scheduled-anchor `FREQ=DAILY;INTERVAL=3` + scheduled date — future
    on-cadence day `future-ok`, off-cadence `future-too-early`; completion-anchor
    interval keeps existing ramp (regression).

- [x] **Task 4: `calculateStreak` anchor/scheduledDate support**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`
  - Why: streak gap-day logic consults isDueOn (~line 248); same threading needed.
  - Append `recurrenceAnchor = 'scheduled'`, `scheduledDate = null` trailing params;
    pass through to parseRecurrence/isDueOn.
  - Tests: scheduled-anchor interval streak — non-cadence gap days don't break streak;
    missed on-cadence day does.

- [x] **Task 5: Call-site wiring in `main.ts` and `habitGraphView.ts`**
  - Files affected: `src/main.ts` (~185-201), `src/habitGraphView.ts` (~53-61)
  - Why: makes the feature reachable end-to-end; both have full `task: TaskNote` in scope.
  - Import `parseISODate` from dateUtils in both files; compute
    `const scheduledDate = task.scheduled ? parseISODate(task.scheduled) : null;`
    pass `task.recurrenceAnchor, scheduledDate` as trailing args to both
    `generateDayCells` and `calculateStreak`.
  - No new unit tests (no existing coverage for these files' wiring — consistent with
    current state; logic is fully tested at the recurrenceUtils/graphRenderer layers).

- [x] **Task 6: JSDoc contract + PROJECT_LORE.md updates**
  - Files affected: `src/utils/recurrenceUtils.ts` (JSDoc only), `PROJECT_LORE.md`
  - Why: the null-scheduledDate silent fallback is now a load-bearing invariant, not an
    implementation detail — future sessions must not "fix" it or add a warning to it.
  - Document isDueOn's anchor/scheduledDate fallback rule in JSDoc; add PROJECT_LORE
    Invariants entry (silent fallback is the common case — do not warn) and update the
    Coupling section (isDueOn now also consumes recurrenceAnchor/scheduled from TaskNote
    via both call sites).

### Quality Checks
- [x] `npx jest --runInBand` (NEVER parallel — machine constraint)
- [x] `npm run build` (run AFTER jest, never simultaneously)
- [x] Self-review for code quality
- [ ] Verify acceptance criteria met (manual test in vault with a
      `recurrence_anchor: scheduled` + `scheduled` interval habit — USER)

### Documentation
- [x] Covered by Task 6 (JSDoc + PROJECT_LORE)
- [ ] File follow-up issue for biweekly BYDAY+INTERVAL=2 support after merge (Q3)

## Technical Notes

### Architecture Considerations
- `recurrenceUtils.ts` stays the single scheduling authority; graphRenderer only
  threads inputs through (preserves the PROJECT_LORE coupling contract).
- All new params are trailing with defaults matching current behavior — every existing
  positional call (including tests) compiles and behaves identically.
- `task.scheduled` is an ISO string on TaskNote (YAML Dates coerced by taskParser's
  `coerceDateValue`); parse to Date at the call sites, keep recurrenceUtils Date-based.
- Blast radius confirmed by planner: parseRecurrence/isDueOn have exactly one consumer
  (graphRenderer.ts lines 47, 87, 101, 228, 248) plus the two render call sites.

### Implementation Approach
Extend the existing functions with optional trailing params rather than a wrapper or a
context object. Alternatives rejected:
1. Wrapper function (`isDueOnForTask(task, ...)`) — hides which inputs matter and
   couples recurrenceUtils to the TaskNote type.
2. Options-object refactor of isDueOn — churns every existing call site and test for
   no behavioral gain; can be done later if the param list grows again.

### Potential Challenges
- The regression invariant: isDueOn's 'interval' branch must reproduce legacy
  rolling-window math exactly on the fallback path (PROJECT_LORE: graphRenderer.test.ts
  suite verified against pre-#11 implementation). Pin with explicit fallback tests.
- Day-diff modulo math must use the same local-date day arithmetic as the rest of
  recurrenceUtils (beware DST/UTC-offset pitfalls — see getTodayUTC lore entry).
- Task 3's condition must not accidentally flip fallback-case future cells to binary
  (anchor='scheduled' is the default — the scheduledDate null-check is the gate).

## Questions/Blockers

### Clarifications Needed
(none — all resolved 2026-07-14, see Decisions Made)

### Blocked By
(none)

### Assumptions Made
- `scheduled` in frontmatter is a single date (anchor/start), not a recurring value.
- Cadence from scheduled date uses simple day-diff modulo (no month-aware stepping) —
  matches the interval-days model already used by the rolling window.

### Decisions Made
2026-07-14

**Q: Silent fallback vs warning when anchor='scheduled' but no `scheduled` date?**
**A:** Silent fallback to rolling-window math. Nearly every existing habit hits this
path (default anchor, no scheduled date); warning would spam the console on the common
case. Documented via JSDoc + PROJECT_LORE instead.

**Q: What does `recurrence_anchor: completion` mean for BYDAY/BYMONTHDAY schedules?**
**A:** No-op + one-time console.warn, mirroring the existing INTERVAL>1-with-BYDAY
warn-and-ignore pattern. Fixed-day habits stay calendar-fixed regardless of anchor.

**Q: Biweekly (FREQ=WEEKLY;BYDAY=...;INTERVAL=2) in scope?**
**A:** No — separate follow-up issue once #27 lands. This work unblocks it (scheduledDate
reference now reaches isDueOn) but week-parity logic is materially separate.

**Q: Future ramp for scheduled-anchor interval habits?**
**A:** Yes, drop it — binary future-ok/future-too-early like BYDAY schedules. Once due
days are calendar-fixed, "how overdue will I be" is meaningless (same reasoning as #11).

**Q: Today-cell misbehavior on non-due days (planner Q4)?**
**A:** Out of scope — that is exactly issue #28, already filed and queued next.

## Work Log

### 2026-07-14 - Session 1
- Completed: Task 1 (commit b26e131) — anchor + scheduledDate in recurrenceUtils.
  - Existing interval-shape test assertions updated to include anchor: 'scheduled';
    they now double as fallback-pinning regressions.
  - Completion-anchor-on-fixed-day warn fires per parse call (same behavior as the
    existing INTERVAL>1-with-BYDAY warn), not literally once per session.
- Completed: Task 2 (commit 7c1032f) — generateDayCells past-day threading + 4 tests.
- Completed: Task 3 (commit 4af9db9) — binary future cells; condition gated on
  anchor === 'scheduled' AND scheduledDate non-null so the fallback case keeps the ramp.
- Completed: Task 4 (commit 681b700) — calculateStreak threading + 4 tests. Noted:
  off-cadence completions still count toward the streak while no due day is missed
  (legacy interval semantics preserved; test documents this explicitly).
- Completed: Task 5 (commit 0212ab4) — call-site wiring. DEVIATION from plan: instead
  of bare parseISODate (which throws), added tolerant parseISODateOrNull to
  dateUtils.ts + new dateUtils.test.ts suite — taskParser passes raw frontmatter
  strings through, and TaskNotes can emit datetime values ("2025-01-15T09:00");
  a malformed `scheduled` must not break rendering. Time portion is discarded.
- Completed: Task 6 (commit d7ea9a5) — PROJECT_LORE: new silent-fallback invariant,
  updated the two scheduling-authority coupling entries, added call-site-duplication
  and trailing-params coupling entries. isDueOn JSDoc contract was written in Task 1.

### 2026-07-14 - Session Complete
- All 6 implementation tasks complete (6 commits on 27-support-recurrence-anchor).
- Quality checks: 162 tests pass (jest --runInBand; was 132 before this issue),
  npm run build clean — fresh main.js produced for manual vault verification.
- Reminder for PR: push local main first (1 commit ahead with the #29 archive
  commit f1f8005) so the PR contains exactly the 6 issue commits.
- After merge: file the biweekly (BYDAY+INTERVAL=2) follow-up issue per Q3 decision.
- Ready for PR: yes (pending user's manual vault verification with a
  recurrence_anchor: scheduled + scheduled interval habit).

---
**Generated:** 2026-07-14
**By:** Issue Setup Skill (planner agent: ab2fb9c767f7304b1)
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/27
