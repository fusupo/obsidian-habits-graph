# Issue #43 - Fixed-schedule past cells: paint overdue carry-over days red, distinguish missed due dates with bright red

**Archived:** 2026-09-29
**Branch:** 43-fixed-schedule-overdue-carry-over
**Code SHA:** 68591b9
**PR:** #44
**Status:** Merged

## Summary

Fixed-schedule habits (weekly-bydays, monthly-bymonthday, or scheduled-anchor with a date) painted the non-due days after a missed due date as blue rest, hiding that the task was still outstanding. The past loop now tracks `fixedScheduleCarryOverActive`, and a completion or skip clears it. This gives three tiers of red: the missed due date itself is `missed-overdue` (`.red-bright-solid`), carry-over days are `overdue` (base red), and today shows the striped `today-overdue` when carry-over is active and today isn't a due date. Rolling-window habits, future cells and `calculateStreak` are unchanged.

## Key Decisions

- **Three tiers of red.** Carry-over = base red `#d9534f`; missed due dates = solid bright red `#ff2d20`. Subtle enough that the graph doesn't scream, but you can pick out exactly which due dates were missed. Stripes stay today-only as the loudest call to action.
- **Today participates in carry-over.** Marc: "yes, but today should show the red-white stripes in that case". This reuses the existing `today-overdue` status through the `!isDueOn` slot, so no new today-tint CSS pair was needed.
- **Carry-over is gated on `!isRollingWindowInterval`**, so rolling-window habits are completely unaffected.

## Files Changed

- src/graphRenderer.ts — new `overdue` and `missed-overdue` statuses; `fixedScheduleCarryOverActive` flag with a carve-out in the `!isDueOn` slot (past and today); `colorClassForCell` maps `missed-overdue` to `.red-bright-solid`; the tooltip labels `overdue` as "Overdue"
- styles.css — `.red-bright-solid` in both themes
- src/__tests__/graphRenderer.test.ts — updated 5 existing blocks and added 7 new tests; split the #28 off-cadence today test into carry-over and no-carry-over variants; 210 → 220 tests
- PROJECT_LORE.md — invariants for the carry-over tiers and today-overdue's second path; updated the precedence and today-tint coupling entries

## Lessons Learned

- tsc's exhaustive switch caught the new statuses in `colorClassForCell` right away. Keep status handling as exhaustive switches.
- One early test mistake: Tuesday is a due day under `BYDAY=TU,TH`, not a carry-over day. Check the weekday grid before writing expectations for fixed-schedule tests.

## Session Log

`SESSION_LOG_1.md` is a single long session (2026-07-14 → 2026-07-18) captured before an auto-compaction. It spans issues #11 through #43. Everything before #41 was already archived, so it's filed here with the last issue it covers.
