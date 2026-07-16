# Issue #35 - Distinguish due-today (yellow) from past-due (red) in today's cell for rolling-window habits

**Archived:** 2026-07-16
**Branch:** 35-today-overdue-rolling-window
**Code SHA:** aabbb70
**PR:** #36
**Status:** Merged

## Summary

Added a `today-overdue` status for rolling-window interval habits (completion-anchor, or scheduled-anchor with no scheduled date) whose gap since the last completion exceeds the interval. Today's cell escalates from yellow `today-missed` to a red/white 45° diagonal-stripe treatment (new `.red-bright` class, SVG `<pattern>` fill) — today only; past over-gap days keep the established `.red`. Fixed-schedule habits are unaffected, both call-to-action statuses are exempt from the #33 today tint, and `calculateStreak` is regression-locked as unchanged.

## Key Decisions

- **New brighter red, today only** — user directive: "I just need bright red on 'today', not necessarily on previous days that were also past due." Past missed days stay `.red`.
- **Flat bright red → diagonal stripes** — after a live-vault screenshot, flat #ff2d20 was indistinct among red history cells; pivoted to red/white stripes via a per-svg SVG `<pattern>` (user's suggestion), bright red kept as CSS fallback fill.
- **Scheduled-date fallback anchor** — a never-completed habit with a past scheduled date (e.g. "clean kitchen", scheduled 16 days back) escalates from the scheduled date; a brand-new habit with no anchor at all stays yellow.
- **Strict `gap > interval`** — gap === interval is the due day itself, stays yellow (pinned by pre-existing boundary test).

## Files Changed

- src/graphRenderer.ts — `today-overdue` status, shared `isRollingWindowInterval` guard (future branch refactored to reuse it), `red-bright` mapping + call-to-action tint exemption, stripe `<pattern>` defs, "Overdue" tooltip
- src/__tests__/graphRenderer.test.ts — 13 new tests (escalation, boundaries, fixed-schedule immunity, today-only scope, precedence, streak regression); 197 total at merge
- styles.css — `.red-bright` + stripe classes, light/dark
- PROJECT_LORE.md, README.md — escalation invariant, tint-exemption update, legend line

## Lessons Learned

- TS definite-assignment forced the `colorClassForCell` case into Task 1 to keep every commit compiling (documented deviation).
- Visual iteration in the live vault mattered: two post-screenshot pivots (stripes; scheduled-date anchor) reshaped the feature after "code complete".
- Shared session log for this session (covers #35 and #37) lives in the sibling `202607161318-37-skip-resets-overdue-clock/` archive.
