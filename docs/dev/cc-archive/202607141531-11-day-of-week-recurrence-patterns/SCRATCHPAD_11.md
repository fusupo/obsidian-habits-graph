# Support day-of-week recurrence patterns - #11

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/11
- **State:** open
- **Labels:** (none)
- **Milestone:** (none)
- **Assignees:** (none)
- **Related Issues:**
  - Related: #3 (numeric pattern foundation, closed), #17 (RRULE parsing, closed — explicitly deferred day-of-week scheduling to this issue)

## Description

(Original issue body — NOTE: written pre-TaskNotes migration; examples use legacy
human-readable phrases. The codebase now receives RRULE strings from TaskNotes
frontmatter, e.g. `FREQ=WEEKLY;BYDAY=MO,WE,FR`. This plan targets RRULE
BYDAY/BYMONTHDAY semantics first-class.)

Add support for day-of-week based recurrence patterns to expand on the numeric
pattern support added in #3.

Examples of patterns to support (legacy phrasing; RRULE equivalents in parens):
- `every Monday` (`FREQ=WEEKLY;BYDAY=MO`)
- `every Tuesday and Thursday` (`FREQ=WEEKLY;BYDAY=TU,TH`)
- `every 2 weeks on Monday` (`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO`)
- `every month on the 1st` (`FREQ=MONTHLY;BYMONTHDAY=1`)
- `weekdays` (`FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`)
- `weekends` (`FREQ=WEEKLY;BYDAY=SA,SU`)

Technical approach (from issue):
- Parse day names from recurrence strings
- Calculate next occurrence date based on current date and day-of-week
- Handle combination patterns
- Maintain compatibility with existing numeric patterns from #3

## Acceptance Criteria
- [x] Parse and recognize common day-of-week patterns (RRULE `BYDAY` / `BYMONTHDAY`)
- [x] Calculate correct due-day semantics for day-based recurrences (past cells: rest vs missed; future cells: due vs not-due; streaks)
- [x] Handle multi-day patterns (e.g., `BYDAY=TU,TH`)
- [x] Log warnings for unrecognized day-of-week patterns
- [x] Update JSDoc with supported day-of-week pattern examples
- [x] Existing plain-interval behavior (`FREQ=DAILY`, `INTERVAL=N`, legacy text) unchanged (regression tests)

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 11-day-of-week-recurrence-patterns
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Fetch latest from main
- [x] Create and checkout feature branch

### Implementation Tasks

- [x] **Task 1: Add `ParsedRecurrence` type + `parseRecurrence()` + `isDueOn()` predicate**
  - Files affected: `src/utils/recurrenceUtils.ts`, `src/__tests__/recurrenceUtils.test.ts`
  - Why: Foundation — a scalar interval cannot represent fixed-weekday schedules.
    Pure addition; no consumers changed; `parseRecurrenceIntervalDays` stays untouched.
  - Shape:
    ```typescript
    export type ParsedRecurrence =
      | { kind: 'interval'; days: number }                       // DAILY/WEEKLY(no BYDAY)/legacy text
      | { kind: 'weekly-bydays'; byDays: Set<number> }           // 0=Sun..6=Sat
      | { kind: 'monthly-bymonthday'; byMonthDays: Set<number> };
    export function parseRecurrence(pattern: string): ParsedRecurrence;
    export function isDueOn(rec: ParsedRecurrence, date: Date, lastCompletionBefore: Date | null): boolean;
    ```
  - Warn + fall back to `{ kind: 'interval', days: 1 }` for unrecognized BYDAY tokens,
    empty BYDAY, out-of-range BYMONTHDAY (matches existing console.warn pattern).
  - Tests: MO,WE,FR set; single/all-7 BYDAY; BYMONTHDAY=1,15; DTSTART stripping;
    warning fallbacks; `isDueOn` for each kind — including exact reproduction of
    current rolling-window math for the `interval` kind (regression guard).

- [x] **Task 2: Fix past-day `missed`/`rest` classification in `generateDayCells`**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts` (new file)
  - Why: The literal bug — Tue must render `rest`, not `missed`, for a Mon/Wed/Fri habit.
    Replace `daysSincePriorComp < intervalDays` with `!isDueOn(...)`.
  - Tests: Mon/Wed/Fri week with missed Wednesday (Tue=rest, Wed=missed, Sat/Sun=rest);
    BYMONTHDAY=1 past month; interval-kind regression cases FIRST (no baseline exists —
    this is the first direct test file for GraphRenderer).

- [x] **Task 3: Fix future-day scheduling-window classification**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`
  - Why: Saturday must not render as due/overdue for a Mon/Wed/Fri habit.
    For byday/bymonthday kinds: binary `isDueOn ? 'future-ok' : 'future-too-early'`
    (pending Q1 decision). Interval kind keeps 0.75x/1.25x/1.5x thresholds untouched.
  - Tests: future week Mon/Wed/Fri (Sat/Sun=future-too-early); interval regression.

- [x] **Task 4: Fix `calculateStreak` gap-day handling**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`
  - Why: Non-due days (Tue/Thu/weekends) must not break a Mon/Wed/Fri streak; a missed
    due day still must. Replace `gapDays < intervalDays` with shared `isDueOn`.
  - Tests: 3-week unbroken Mon/Wed/Fri streak = 9; missed Wednesday breaks it;
    interval-kind streak regression.

- [x] **Task 5: JSDoc + PROJECT_LORE.md updates**
  - Files affected: `src/utils/recurrenceUtils.ts`, `PROJECT_LORE.md`
  - Why: Explicit acceptance criterion; also the "sole bridge" coupling note in
    PROJECT_LORE.md (line ~30) becomes inaccurate once `isDueOn` exists, and the
    "tracked in #11" comment in recurrenceUtils.ts becomes stale.

### Quality Checks
- [x] `npx jest --runInBand` (NEVER parallel — machine constraint)
- [x] `npm run build` (tsc type check + esbuild, run AFTER jest, never simultaneously)
- [x] Self-review for code quality
- [x] Verify acceptance criteria met

### Documentation
- [x] JSDoc examples for BYDAY/BYMONTHDAY (Task 5)
- [x] PROJECT_LORE.md coupling note update (Task 5)

## Technical Notes

### Architecture Considerations
- `parseRecurrenceIntervalDays` remains exported and UNCHANGED — its 47 existing tests
  (incl. the BYDAY average-interval heuristic block) keep passing. It becomes a
  display/legacy helper; `parseRecurrence` + `isDueOn` become the scheduling authority.
- Three consumers of the scalar all need the predicate instead:
  - `generateDayCells` past branch (graphRenderer.ts:94) — rolling window
  - `generateDayCells` future branch (graphRenderer.ts:81-89) — proportional window
  - `calculateStreak` (graphRenderer.ts:235) — rolling window
- `isDueOn`'s `interval` branch must EXACTLY reproduce current math for both call
  shapes (days-since-prior-completion in generateDayCells vs gap-to-next-completion
  walking backward in calculateStreak). This is the main regression risk.
- Use `getUTCDay()`/`getUTCDate()` — correct given the local-midnight-wrapped-in-UTC
  date model (PROJECT_LORE invariant on getTodayUTC).
- `TaskNote.recurrenceAnchor` ('scheduled' | 'completion') is parsed but unused;
  BYDAY due-day semantics implicitly assume 'scheduled'. Out of scope here (Q4).

### Implementation Approach
Additive richer parse alongside existing scalar (see Task 1 shape). Alternatives
rejected:
1. `rrule` npm package — overkill for two set-membership predicates; mobile bundle
   weight; issue #17's scratchpad already made this call anticipating this issue.
2. Better scalar heuristic — no scalar can distinguish "never due" from "due but not yet".
3. Replace `parseRecurrenceIntervalDays` outright — breaks 47 tests unnecessarily,
   less reviewable.

### Potential Challenges
- No existing graphRenderer test file — interval-kind regression cases must be
  hand-derived from current code before touching BYDAY logic (do this first in Task 2).
- `FREQ=WEEKLY;BYDAY=...;INTERVAL=2` (biweekly on weekdays) — see Q2.
- DST/negative-UTC-offset gotchas already documented in PROJECT_LORE; add a defensive
  test for weekday extraction at UTC midnight.

## Questions/Blockers

### Clarifications Needed
(none — all resolved 2026-07-14, see Decisions Made)

### Blocked By
(none — #3 and #17 are complete)

### Assumptions Made
- RRULE is the primary recurrence format (post-TaskNotes migration); the issue body's
  human-readable examples are treated as historical context, not requirements.

### Decisions Made
2026-07-14

**Q: Future-cell coloring for BYDAY/BYMONTHDAY habits?**
**A:** Binary due/not-due — `isDueOn ? 'future-ok' : 'future-too-early'`. No
warning/overdue escalation; a missed past due-day already renders red.

**Q: `FREQ=WEEKLY;BYDAY=...;INTERVAL=N>1`?**
**A:** Treat as weekly, ignore INTERVAL, log a console warning about the
limitation. Candidate follow-up if it appears in real data.

**Q: Legacy human-readable day-of-week phrases ("every Monday", "weekdays")?**
**A:** RRULE only. Do not add new legacy phrase parsing; existing legacy phrases
keep working unchanged via the interval fallback.

**Q: `recurrenceAnchor` gap?**
**A:** File a follow-up GitHub issue after #11 lands documenting that BYDAY
semantics assume 'scheduled' anchor and 'completion' anchor is unimplemented.

## Work Log

### 2026-07-14 - Session 1
- Fast-forwarded feature branch 23cf9fb → 76787bb (local main had 3 doc-archive
  commits not on origin/main; src/ identical).
- Completed: Task 1 (commit 0036a6d) — ParsedRecurrence + parseRecurrence + isDueOn.
  - Extracted parseRRuleParams() helper shared with parseRecurrenceIntervalDays
    (behavior identical, all 35 pre-existing tests pass; 24 new tests added).
  - Commit mode: auto-commit each task (user decision).
- Completed: Task 2 (commit 8253678) — past-day rest/missed via isDueOn.
  - Regression tests written and verified green against the PRE-change
    implementation before modifying graphRenderer (12 baseline tests).
- Completed: Task 3 (commit a110520) — binary future window for fixed schedules.
- Completed: Task 4 (commit 074e988) — streak gap days via isDueOn.
  - calculateStreak no longer uses parseRecurrenceIntervalDays at all.
- Completed: Task 5 (commit e9fbcf0) — PROJECT_LORE coupling notes; JSDoc was
  already updated in Task 1.

### 2026-07-14 - Session Complete
- All 5 implementation tasks complete (5 commits on 11-day-of-week-recurrence-patterns).
- Quality checks: 126 tests pass (`jest --runInBand`), `npm run build` clean
  (tsc + esbuild; main.js is gitignored).
- Observation (out of scope, not changed): the TODAY cell still renders
  'today-missed' (yellow "!") on non-due days for fixed-schedule habits —
  e.g. Tuesday for a Mon/Wed/Fri habit. Consider whether today should render
  'rest' when not due; candidate for the recurrenceAnchor follow-up issue or
  its own small issue.
- Follow-up to file after merge (decision Q4): recurrenceAnchor
  ('scheduled' vs 'completion') is parsed but unused; BYDAY semantics assume
  'scheduled'.
- Ready for PR: yes.

---
**Generated:** 2026-07-14
**By:** Issue Setup Skill (planner agent: a34bee8cae1b79a55)
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/11
