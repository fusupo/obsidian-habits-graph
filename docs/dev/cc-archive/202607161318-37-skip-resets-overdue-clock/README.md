# Issue #37 - Overdue escalation ignores skipped instances — skip should reset the escalation clock

**Archived:** 2026-07-16
**Branch:** 37-skip-resets-overdue-clock
**Code SHA:** aabbb70
**PR:** #38
**Status:** Merged

## Summary

The #35 `today-overdue` escalation was blind to `skipped_instances`: a habit completed two days ago and skipped yesterday still rendered striped-overdue today. Fixed by making the overdue anchor the latest of the last completion and the last skip strictly before today (falling back to the scheduled date, else no anchor → stays yellow). Skip RESETS the clock like a completion — it forgives even pre-skip accumulated lateness. `isDueOn`, rest days, past cells, the future ramp, and `calculateStreak` are untouched.

## Key Decisions

- **Reset, not pause** — user: "skip for my purposes basically means i don't have to do it, that particular instance is no longer my responsibility but the next one may be." Even an already-overdue habit returns to yellow the day after a skip.
- **A lone past skip is an anchor** — a never-completed habit with a skip beyond the interval CAN go overdue (the skip proves the habit was live).
- **Skip beats the scheduled-date fallback** — an actual instance event outranks the static scheduled date.
- Follow-up filed: #39 — the future escalation ramp has the same skip-blindness (and its "due then" forecast color should be light green `future-ok`).

## Files Changed

- src/graphRenderer.ts — `lastSkipBeforeToday` computed once before the cell loop; overdue anchor via `Math.max` of completion/skip epoch times with `-Infinity` sentinel
- src/__tests__/graphRenderer.test.ts — 7 new tests (reported bug, reset-not-pause, overdue-returns-after-skip-ages, completion-beats-older-skip, lone-skip anchor, skip-today precedence, past-cells-unaffected); 204 total
- PROJECT_LORE.md, README.md — invariant now names the skip anchor and reset semantics; legend mentions "or skip"

## Lessons Learned

- ~6 lines of production code; nearly all the effort was pinning semantics (pause vs reset) in conversation before filing the issue.
- `SESSION_LOG_1.md` here covers the whole session: #35 implementation and review pivots as well as #37.
