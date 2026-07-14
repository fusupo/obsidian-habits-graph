# Issue #11 - Support day-of-week recurrence patterns

**Archived:** 2026-07-14
**Branch:** 11-day-of-week-recurrence-patterns
**Code SHA:** da87b2b
**PR:** #26 (merged)
**Status:** Merged

## Summary

Added first-class scheduling support for RRULE `BYDAY` (fixed weekdays, e.g.
`FREQ=WEEKLY;BYDAY=MO,WE,FR`) and `BYMONTHDAY` (fixed month days, e.g.
`FREQ=MONTHLY;BYMONTHDAY=1`) recurrence patterns. Introduced a
`ParsedRecurrence` discriminated union (`interval` | `weekly-bydays` |
`monthly-bymonthday`) plus an `isDueOn()` predicate in recurrenceUtils.ts,
which became the scheduling authority for all three consumers in
graphRenderer.ts:

- Past cells: non-due days render `rest` (blue) instead of `missed` (red)
- Future cells: fixed schedules get binary due/not-due coloring (no escalation ramp)
- Streaks: non-due gap days no longer break a streak; a missed due day still does

`parseRecurrenceIntervalDays` was left untouched as a display/legacy heuristic
(still drives the interval-kind future escalation ramp). Plain-interval behavior
is byte-identical, guarded by a regression suite written and verified against
the pre-change implementation.

## Key Decisions

- **Future-cell coloring for BYDAY/BYMONTHDAY:** binary `isDueOn ? 'future-ok'
  : 'future-too-early'` — no warning/overdue escalation; a missed past due-day
  already renders red.
- **`FREQ=WEEKLY;BYDAY=...;INTERVAL=N>1`:** treat as weekly, ignore INTERVAL,
  log a console warning about the limitation.
- **Legacy human-readable day phrases ("every Monday", "weekdays"):** RRULE
  only; existing legacy phrases keep working via the interval fallback.
- **`recurrence_anchor` gap:** out of scope; filed as follow-up issue #27
  (BYDAY semantics assume 'scheduled' anchor).

## Files Changed

- `src/utils/recurrenceUtils.ts` — ParsedRecurrence type, parseRecurrence(),
  isDueOn(), shared parseRRuleParams() helper, JSDoc updates
- `src/graphRenderer.ts` — past/future cell classification and streak gap
  handling via isDueOn
- `src/__tests__/recurrenceUtils.test.ts` — +24 tests
- `src/__tests__/graphRenderer.test.ts` — new file; 12 interval-kind regression
  tests (verified against pre-change code) + BYDAY/BYMONTHDAY tests
- `PROJECT_LORE.md` — coupling notes updated (scheduling authority, legacy
  rolling-window equivalence)

## Lessons Learned

- Regression-first approach paid off: baseline graphRenderer tests were written
  and verified green against the pre-change implementation before any renderer
  edits; all 126 tests stayed green throughout.
- Feature branch was created from a stale origin/main — fast-forward merging
  local main into the branch (and pushing local main first) kept the PR to
  exactly the 5 issue commits.
- Observed during verification: the TODAY cell renders `today-missed` (yellow
  "!") on non-due days for fixed-schedule habits — filed as issue #28.
  Clickable habit labels filed as issue #29.
