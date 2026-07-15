# Issue #28 - Today cell shows 'today-missed' on non-due days for fixed-schedule habits

**Archived:** 2026-07-15
**Branch:** 28-today-cell-non-due-days
**Code SHA:** 9281350
**PR:** #32 (merged 2026-07-15)
**Status:** Merged

## Summary

#11 (PR #26) fixed past and future cells to respect fixed-day schedules, but the
today branch of `generateDayCells` still ignored `isDueOn` — a `BYDAY=MO,FR` habit
on a Tuesday showed a misleading yellow `today-missed` with the `!` marker. The fix
mirrors the past branch's precedence verbatim in the today branch
(`completed → skipped → !isDueOn → 'rest' → 'today-missed'`), uniform across all
recurrence kinds. No signature changes, no new statuses, no CSS changes.

Key unlock from planning: the `!`/`*!` today marker in `renderGraph` is driven by
`cell.isToday`/`cell.completed`, NOT `cell.status` — so reusing the existing `'rest'`
status keeps the marker (and its color class and "Not due" tooltip) for free.
`calculateStreak` needed no change: its backward walk already consults `isDueOn`.

## Key Decisions

- **Non-due today status:** Reuse `'rest'` (same blue as surrounding rest days); the
  `!` marker survives because markers are independent of status. Zero new
  CSS/type/tooltip surface. (Question was asked twice — clarified in plain terms
  before deciding.)
- **Completed on a non-due day:** Still shows `today-done`, matching the past
  branch's completed-before-isDueOn precedence.
- **Scope:** All recurrence kinds, uniform — also fixes rolling-window interval
  habits showing yellow inside the gap (e.g. every-3-days, completed yesterday).

## Files Changed

- `src/graphRenderer.ts` — today branch now mirrors past-branch precedence (c7f1cf1)
- `src/__tests__/graphRenderer.test.ts` — 8 new tests in a dedicated #28 describe
  (fixed-schedule, rolling-window in/at-gap, scheduled-anchor off/on-cadence,
  completed/skipped non-due today, due-today regression) — 170 tests total (c7f1cf1)
- `PROJECT_LORE.md` — marker/status decoupling gotcha, today-branch precedence
  coupling, scheduling-authority entry extended (606bea1)

## Lessons Learned

- Test strategy: keep the suite's single global fake-time fixture (Wed 2025-01-15)
  and pick recurrence patterns where Wednesday is non-due (`BYDAY=TU,TH`) rather
  than adding a second `jest.setSystemTime` scope.
- When the isDueOn arm is reached in the today branch, `lastCompBeforeCell` is
  strictly earlier than today (the `completed` check short-circuits first) —
  identical semantics to the past branch.
- Manual vault verification with throwaway TEST TaskNotes (BYDAY, rolling-window,
  scheduled-anchor) confirmed all predictions: yellow `!` → blue rest with `!` kept,
  streaks intact.
- Pre-existing quirk left out of scope: a *skipped* today renders `!` instead of `~`
  (marker logic checks `isToday` before `status === 'skipped'`).
